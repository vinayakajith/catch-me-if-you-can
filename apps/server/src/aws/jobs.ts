import { createHash, randomUUID } from 'node:crypto';
import { CHARACTER_RETENTION_MS, DEFAULT_SKIN, EXPRESSIONS, type CharacterServiceConfig, type Expression } from '../../../../packages/game-core/src/index.ts';
import { GenerationError, type CharacterJob, type CharacterService, type ImageProvider, type ImageResult } from '../contracts.ts';
import { JobError, characterJobView } from '../jobs.ts';
import { assembleAtlas, normalizeHead, normalizePhoto, MAX_UPLOAD_BYTES } from '../images.ts';
import { BudgetedImageProvider } from '../budget.ts';
import { Database, conflict, type Item } from './database.ts';
import { S3Assets } from './assets.ts';
import { DynamoBudget, DynamoRateLimiter } from './limits.ts';
const order: Expression[] = ['grin', 'serious', 'laugh', 'giggle', 'bonked', 'dizzy'];
interface CloudJob extends CharacterJob { revision: number; digest: string; etag?: string; token?: string; leaseUntil?: number; notBefore?: number }
export interface JobMessage { jobId: string; revision: number }
export interface CloudJobOptions { db: Database; assets: S3Assets; enabled: boolean; budgetMicros: number; model: string; provider?: () => Promise<ImageProvider>; clock?: () => number; testMode?: boolean }
export class CloudJobs implements CharacterService {
  readonly db: Database; readonly assets: S3Assets; private options: CloudJobOptions; readonly clock: () => number;
  constructor(options: CloudJobOptions) { this.options = options; this.db = options.db; this.assets = options.assets; this.clock = options.clock ?? Date.now; }
  async initialize() {}
  async close() {}
  async config(): Promise<CharacterServiceConfig> {
    const health = await this.db.get('IMAGE_HEALTH'), remaining = await new DynamoBudget(this.db, this.options.budgetMicros).remaining();
    const paused = health && health.retryAt > this.clock();
    return { available: this.options.enabled && !paused && remaining >= 200000, testMode: !!this.options.testMode, maxUploadBytes: MAX_UPLOAD_BYTES, uploadMode: 's3',
      message: paused ? health.message : !this.options.enabled ? 'Photo generation is not connected yet. Sample artwork is ready to play.' : remaining < 200000 ? 'Photo generation has reached its budget. Your completed faces are saved. Sample artwork is ready to play.' : undefined };
  }
  async get(id: string, owner: string): Promise<CloudJob> {
    const item = await this.db.get(`JOB#${id}`), job = item?.data as CloudJob | undefined;
    if (!job || job.owner !== owner) throw new JobError(404, 'That character could not be found on this device.');
    if (job.expiresAt <= this.clock()) throw new JobError(410, 'This character has expired. Create a fresh game with sample artwork or another photo.');
    return job;
  }
  async findUpload(owner: string, key: string) {
    const existing = await this.db.get(`JOBKEY#${owner}#${key}`);
    if (!existing) throw new JobError(404, 'The upload has not reached the lab yet.');
    return this.get(existing.jobId, owner);
  }
  async view(job: CharacterJob) { return characterJobView(job, (await this.config()).available); }
  async create(): Promise<CharacterJob> { throw new JobError(400, 'Please upload the photo from the game page.'); }
  private item(job: CloudJob): Item { return { pk: `JOB#${job.id}`, sk: 'META', version: job.revision, data: job, gcKind: 'JOB', gcAt: job.status === 'generating' ? job.leaseUntil : job.status === 'uploading' ? Math.min(job.expiresAt, job.createdAt + 900000) : job.expiresAt, ttl: Math.ceil((job.expiresAt + 86400000) / 1000) }; }
  private async save(job: CloudJob, creating = false) {
    const previous = job.revision; job.revision++;
    const writes = [this.db.write(this.item(job), creating ? undefined : previous)];
    if (job.status === 'queued') writes.push(this.db.write({ pk: `OUTBOX#${job.id}#${job.revision}`, sk: 'META', jobId: job.id, revision: job.revision, availableAt: job.notBefore ?? this.clock(), gcKind: 'OUTBOX', gcAt: this.clock(), ttl: Math.ceil(job.expiresAt / 1000) }));
    if (creating) writes.push(this.db.write({ pk: `JOBKEY#${job.owner}#${job.idempotencyKey}`, sk: 'META', jobId: job.id, ttl: Math.ceil(job.expiresAt / 1000) }));
    try { await this.db.transact(writes); } catch (error) { job.revision = previous; if (conflict(error)) throw new JobError(409, 'This preview changed. Reload the latest saved progress.'); throw error; }
  }
  async beginUpload(owner: string, key: string, name: string, digest: string) {
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(key) || !/^[a-f0-9]{64}$/.test(digest) || !name.trim() || name.trim().length > 32 || /[\u0000-\u001f\u007f]/.test(name)) throw new JobError(400, 'Choose one photo and enter a name.');
    const fingerprint = createHash('sha256').update(digest).update(name).digest('hex');
    const existing = await this.db.get(`JOBKEY#${owner}#${key}`);
    if (existing) { const job = await this.get(existing.jobId, owner); if (job.fingerprint !== fingerprint) throw new JobError(409, 'This upload has changed. Choose it again.'); return this.uploadReply(job); }
    const service = await this.config(); if (!service.available) throw new JobError(503, service.message!);
    if (!await new DynamoRateLimiter(this.db).take('photo:global', 20, 86400000, this.clock())) throw new JobError(429, 'Today’s photo limit has been reached. Sample games and saved characters still work.');
    const now = this.clock();
    const job: CloudJob = { id: randomUUID(), owner, idempotencyKey: key, fingerprint, digest, name: name.trim(), status: 'uploading', revision: 0, createdAt: now, expiresAt: now + CHARACTER_RETENTION_MS,
      baseRevision: 0, baseApproved: false, sourcePresent: false, completed: {}, currentExpression: 'grin', stepAttempts: {}, attempts: 0, skin: DEFAULT_SKIN, atlasRevision: 0, error: null, usage: [], unmeteredRequests: 0, requestIds: [], model: this.options.model, testMode: !!this.options.testMode };
    try { await this.save(job, true); } catch (error) { if (error instanceof JobError && error.status === 409) { const duplicate = await this.findUpload(owner, key); if (duplicate.fingerprint !== fingerprint) throw error; return this.uploadReply(duplicate); } throw error; }
    return this.uploadReply(job);
  }
  private async uploadReply(job: CloudJob) { return { job: await this.view(job), upload: job.status === 'uploading' ? await this.assets.upload(job.id) : null }; }
  async completeUpload(id: string, owner: string) {
    const job = await this.get(id, owner); if (job.status !== 'uploading') return job;
    job.etag = await this.assets.uploaded(id); job.status = 'queued'; await this.save(job); return job;
  }
  async approve(id: string, owner: string, revision: number) {
    const job = await this.get(id, owner);
    if (job.baseRevision !== revision) throw new JobError(409, 'The preview changed. Check the latest face.');
    if (job.baseApproved) return job;
    if (job.status !== 'awaiting_approval') throw new JobError(409, 'Wait for the first face to finish.');
    job.baseApproved = true; job.status = 'queued'; job.currentExpression = 'serious'; job.error = null; await this.save(job); return job;
  }
  async retry(id: string, owner: string, expression: Expression, revision: number) {
    const job = await this.get(id, owner), view = await this.view(job);
    if (revision !== job.baseRevision) throw new JobError(409, 'The preview changed. Check the latest face.');
    if (['uploading', 'queued', 'generating'].includes(job.status)) return job;
    if ((job.error && !view.error?.canRetry) || !view.retryableExpressions.includes(expression)) throw new JobError(409, job.error?.message ?? 'This face has used its retry allowance.');
    job.currentExpression = expression; job.status = 'queued'; job.error = null; job.notBefore = this.clock(); await this.save(job); return job;
  }
  async finalize(id: string, owner: string, name: string, skin: string) {
    const job = await this.get(id, owner); if (job.status === 'ready') return job;
    if (!job.baseApproved || !['preview', 'failed'].includes(job.status) || EXPRESSIONS.some(e => !job.completed[e])) throw new JobError(409, 'Finish all six faces first.');
    await this.assets.remove(id, 'source.jpg'); await this.assets.remove(id, 'upload.jpg');
    job.sourcePresent = false; job.status = 'ready'; job.name = name; job.skin = skin; job.error = null; job.currentExpression = null; await this.save(job); return job;
  }
  async asset(id: string, owner: string, name: string) {
    const job = await this.get(id, owner);
    if (!['atlas.png', 'source.jpg'].includes(name) || (name === 'source.jpg' && !job.sourcePresent)) throw new JobError(404, 'Image not found.');
    return { url: await this.assets.url(id, name, Math.min(this.clock() + 60000, job.expiresAt)) };
  }
  async characterBytes(id: string, owner: string) { const job = await this.get(id, owner); if (job.status !== 'ready') throw new JobError(409, 'Finish this character first.'); return this.assets.read(id, 'atlas.png'); }
  async process(message: JobMessage) {
    const record = await this.db.get(`JOB#${message.jobId}`), job = record?.data as CloudJob | undefined;
    if (!job || job.status !== 'queued' || job.revision !== message.revision || job.expiresAt <= this.clock()) return;
    const expression = job.currentExpression ?? order.find(e => !job.completed[e]) ?? 'grin';
    if (job.attempts >= 8 || (job.stepAttempts[expression] ?? 0) >= 2) { job.status = 'failed'; job.error = { code: 'attempt_limit', message: 'This face has used its retry allowance.', canRetry: false, uncertain: false }; await this.save(job); return; }
    job.status = 'generating'; job.token = randomUUID(); job.leaseUntil = this.clock() + 330000; job.currentExpression = expression;
    job.attempts++; job.stepAttempts[expression] = (job.stepAttempts[expression] ?? 0) + 1;
    try { await this.save(job); } catch (error) { if (error instanceof JobError && error.status === 409) return; throw error; }
    try {
      const config = await this.config(); if (!config.available) throw new GenerationError('service_paused', config.message!, { canRetry: true });
      if (!job.sourcePresent) {
        const upload = await this.assets.read(job.id, 'upload.jpg', job.etag);
        if (createHash('sha256').update(upload).digest('hex') !== job.digest) throw new GenerationError('invalid_upload', 'The uploaded photo changed. Please choose it again.');
        await this.assets.write(job.id, 'source.jpg', await normalizePhoto(upload)); job.sourcePresent = true; await this.save(job); await this.assets.remove(job.id, 'upload.jpg');
      }
      const photo = await this.assets.read(job.id, 'source.jpg'), base = job.baseApproved ? await this.assets.read(job.id, 'base.png') : undefined;
      if (!this.options.provider) throw new GenerationError('not_configured', 'Photo generation is not connected yet. Sample artwork is ready to play.', { canRetry: true });
      const provider = new BudgetedImageProvider(await this.options.provider(), new DynamoBudget(this.db, this.options.budgetMicros, `${job.id}:${job.token}`));
      const result = await provider.generate({ photo, base, expression });
      // Save the provider output before composition. A crashed worker can finish
      // this exact image without paying for another generation.
      await this.assets.write(job.id, `result-${job.token}.png`, result.image);
      await this.assets.write(job.id, `receipt-${job.token}.json`, Buffer.from(JSON.stringify({ usage: result.usage, requestId: result.requestId })));
      await this.finish(job, result);
    } catch (error) {
      if (error instanceof JobError && error.status === 409) return;
      const fault = error instanceof GenerationError ? error : error instanceof JobError ? new GenerationError('invalid_upload', error.message) : new GenerationError('storage', 'The image could not be saved. Completed faces are safe; retry this step.', { canRetry: true, uncertain: true });
      if (['development_budget', 'service_paused', 'access', 'quota', 'not_configured'].includes(fault.code)) { job.attempts--; job.stepAttempts[expression] = Math.max(0, (job.stepAttempts[expression] ?? 1) - 1); }
      if (['access', 'quota', 'not_configured'].includes(fault.code)) await this.db.put({ pk: 'IMAGE_HEALTH', sk: 'META', retryAt: this.clock() + 300000, message: fault.message });
      job.error = { code: fault.code, message: fault.message, canRetry: fault.canRetry, uncertain: fault.uncertain };
      console.warn(JSON.stringify({ event: 'image_job_failed', code: fault.code, uncertain: fault.uncertain }));
      const automatic = fault.automatic && !fault.uncertain && (fault.retryDelayMs ?? 0) <= 30000 && job.attempts < 8 && (job.stepAttempts[expression] ?? 0) < 2;
      job.status = automatic ? 'queued' : fault.uncertain ? 'interrupted' : 'failed'; job.notBefore = this.clock() + Math.max(2000, fault.retryDelayMs ?? 0); await this.save(job);
    }
  }
  private async finish(job: CloudJob, result: ImageResult) {
    if (job.expiresAt <= this.clock()) return;
    const expression = job.currentExpression!, normalized = await normalizeHead(result.image);
    await this.assets.write(job.id, `${expression}.png`, normalized.image); job.completed[expression] = `${expression}.png`;
    if (!job.baseApproved) { await this.assets.write(job.id, 'base.png', result.image); job.baseRevision++; job.skin = normalized.skin; }
    const heads: Partial<Record<Expression, Buffer>> = {};
    for (const e of EXPRESSIONS) if (job.completed[e]) heads[e] = await this.assets.read(job.id, job.completed[e]!);
    await this.assets.write(job.id, 'atlas.png', await assembleAtlas(heads, true)); job.atlasRevision++;
    if (result.usage) job.usage.push(result.usage); else job.unmeteredRequests++;
    if (result.requestId) job.requestIds.push(result.requestId);
    job.error = null; job.leaseUntil = undefined; job.notBefore = this.clock();
    job.currentExpression = job.baseApproved ? order.find(e => !job.completed[e]) ?? null : null;
    job.status = !job.baseApproved ? 'awaiting_approval' : job.currentExpression ? 'queued' : 'preview'; await this.save(job);
    // Keep any just-saved recovery image until the state is durably published.
    // A cleanup outage must not roll back a face already published to the job.
    // The remaining private files are removed by the job's expiry cleanup.
    try { await this.assets.remove(job.id, `result-${job.token}.png`); await this.assets.remove(job.id, `receipt-${job.token}.json`); }
    catch { console.warn(JSON.stringify({ event: 'image_recovery_cleanup_deferred' })); }
  }
  async cleanup() {
    for (const item of await this.db.due('JOB', this.clock())) {
      const latest = await this.db.get(item.pk), job = latest?.data as CloudJob | undefined; if (!job) continue;
      if (job.expiresAt <= this.clock() || job.status === 'uploading' && job.createdAt + 900000 <= this.clock()) {
        await this.assets.remove(job.id); job.status = 'expired'; job.sourcePresent = false; job.completed = {}; job.atlasRevision = 0; job.name = ''; job.fingerprint = ''; job.error = null;
        const expired = this.item(job); expired.gcKind = undefined; expired.gcAt = undefined; expired.version = job.revision + 1; job.revision++;
        try { await this.db.transact([this.db.write(expired, latest!.version)]); } catch (error) { if (!conflict(error)) throw error; }
      } else if (job.status === 'generating' && (job.leaseUntil ?? Infinity) <= this.clock()) {
        let image: Buffer | undefined;
        try { image = await this.assets.read(job.id, `result-${job.token}.png`); } catch (error) { if (!['NoSuchKey', 'NotFound', 'ENOENT'].includes((error as Error).name) && (error as { code?: string }).code !== 'ENOENT') throw error; }
        if (image) {
          let receipt: { usage?: ImageResult['usage']; requestId?: string } = {};
          try { receipt = JSON.parse((await this.assets.read(job.id, `receipt-${job.token}.json`)).toString()); } catch {}
          try { await this.finish(job, { image, usage: receipt.usage ?? null, requestId: receipt.requestId }); continue; } catch (error) { if (error instanceof JobError && error.status === 409) continue; }
        }
        job.status = 'interrupted'; job.error = { code: 'interrupted', message: 'This image request was interrupted and may have been charged. Completed faces are saved; retry only when ready.', canRetry: true, uncertain: true };
        try { await this.save(job); } catch (error) { if (!(error instanceof JobError && error.status === 409)) throw error; }
      }
    }
  }
}
