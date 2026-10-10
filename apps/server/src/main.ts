import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { OpenAIImageProvider } from './provider.ts';
import { BudgetedImageProvider, DevelopmentBudget } from './budget.ts';

const rawProvider = new OpenAIImageProvider({ apiKey: process.env.OPENAI_API_KEY, model: process.env.FATHER_HUNTER_IMAGE_MODEL,
  quality: process.env.FATHER_HUNTER_IMAGE_QUALITY === 'medium' ? 'medium' : 'high' });
const budget = new DevelopmentBudget(fileURLToPath(new URL('../../../.father-hunter', import.meta.url)));
const provider = new BudgetedImageProvider(rawProvider, budget);
const { app } = await buildApp({ directory: resolve(process.env.FATHER_HUNTER_DATA_DIR || '.father-hunter'), provider,
  publicOrigin: process.env.FATHER_HUNTER_PUBLIC_ORIGIN,
  dailyJobs: Math.max(1, Number(process.env.FATHER_HUNTER_DAILY_JOBS) || 20) });
await app.listen({ host: '127.0.0.1', port: Number(process.env.FATHER_HUNTER_API_PORT) || 8787 });
console.log(`Father Hunter room and photo service ready (${provider.available ? 'OpenAI connected' : 'add OPENAI_API_KEY to .env to enable photo generation'}).`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { app.close().then(() => { budget.close(); process.exit(0); }); });
