import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Database } from './database.ts';
import { S3Assets } from './assets.ts';
import { DynamoRoomStore } from './room-store.ts';
import { DynamoRateLimiter } from './limits.ts';
import { CloudJobs } from './jobs.ts';
import { Outbox } from './queue.ts';
import { OpenAIImageProvider } from '../provider.ts';
import { GenerationError } from '../contracts.ts';
export function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing server configuration: ${name}`); return value; }
export function runtime(worker = false) {
  const db = new Database(required('FH_TABLE')), assets = new S3Assets(required('FH_ASSET_BUCKET'));
  const budgetMicros = Number(process.env.FH_IMAGE_BUDGET_MICROS || '0');
  if (!Number.isSafeInteger(budgetMicros) || budgetMicros < 0) throw new Error('Invalid production budget configuration.');
  const model = process.env.FATHER_HUNTER_IMAGE_MODEL || 'gpt-image-2.5-sunburst-2026-09-08';
  let saved: { key: string; until: number } | undefined;
  const secrets = worker ? new SecretsManagerClient({ maxAttempts: 2 }) : null;
  const jobs = new CloudJobs({ db, assets, model, budgetMicros, enabled: process.env.FH_IMAGE_ENABLED === 'true' && budgetMicros > 0,
    provider: worker ? async () => {
      if (!saved || saved.until < Date.now()) {
        const value = (await secrets!.send(new GetSecretValueCommand({ SecretId: required('FH_OPENAI_SECRET_ARN') }))).SecretString?.trim();
        if (!value?.startsWith('sk-')) throw new GenerationError('not_configured', 'Photo generation is not connected yet. Sample artwork is ready to play.', { canRetry: true });
        saved = { key: value, until: Date.now() + 60000 };
      }
      return new OpenAIImageProvider({ apiKey: saved.key, model, quality: process.env.FATHER_HUNTER_IMAGE_QUALITY === 'medium' ? 'medium' : 'high' });
    } : undefined,
  });
  return { db, assets, jobs, rooms: new DynamoRoomStore(db), limiter: new DynamoRateLimiter(db), outbox: new Outbox(db, required('FH_QUEUE_URL')) };
}
