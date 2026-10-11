import { createHash, randomUUID } from 'node:crypto';
import { CHARACTER_RETENTION_MS, DEFAULT_SKIN, EXPRESSIONS, EXPRESSION_FRAMES, type CharacterJobView, type Expression } from '../../../packages/game-core/src/index.ts';
import { GenerationError, type AssetStore, type CharacterJob, type ImageProvider, type JobStore, type PlayerPortraitJob } from './contracts.ts';
import { assembleAtlas, normalizeHead, normalizePhoto } from './images.ts';

const MAX_ATTEMPTS = 8;
const generationOrder: Expression[] = ['grin', 'serious', 'laugh', 'giggle', 'bonked', 'dizzy'];
export { JobError } from './errors.ts';
import { JobError } from './errors.ts';
export class CharacterJobs {
  private store: JobStore; private assets: AssetStore; readonly provider: ImageProvider;
  private clock: () => number; private dailyJobs: number; private retryDelayMs: number;
  private running = false; private stopping = false; private task: Promise<void> | null = null;
  private onPlayerReady?: (job: CharacterJob) => Promise<void>;
  constructor(options: { store: JobStore; assets: AssetStore; provider: ImageProvider; clock?: () => number; dailyJobs?: number; retryDelayMs?: number; onPlayerReady?: (job: CharacterJob) => Promise<void> }) {
    this.store = options.store; this.assets = options.assets; this.provider = options.provider;
    this.clock = options.clock ?? Date.now; this.dailyJobs = options.dailyJobs ?? 20; this.retryDelayMs = options.retryDelayMs ?? 2000;
    this.onPlayerReady = options.onPlayerReady;
  }
  async initialize() {
    for (const job of this.store.list()) {
      if (job.status === 'generating') {
        job.status = 'interrupted'; job.error = { code: 'interrupted', message: 'Generation was interrupted. This attempt may have been charged. Your completed faces are saved; retry this step when ready.', canRetry: true, uncertain: true }; this.store.save(job);
      } else if (job.status === 'uploading' || (job.status === 'interrupted' && !job.error && job.attempts === 0)) {
        try { await this.assets.read(job.id, 'source.jpg'); job.status = 'queued'; }
        catch { job.status = 'failed'; job.sourcePresent = false; job.error = { code: 'upload_incomplete', message: 'The upload was interrupted before the photo was saved. Choose it again; no image was generated.', canRetry: false, uncertain: false }; }
        this.store.save(job);
      }
    }
    await this.cleanup(); this.kick();
  }
  get(id: string, owner: string) {
    const job = this.store.get(id);
    if (!job || job.owner !== owner) throw new JobError(404, 'That Dad could not be found on this device.');
    if (job.expiresAt <= this.clock()) throw new JobError(410, 'This Dad has expired. Create a fresh one or play with sample Balaji.');
    return job;
  }
  findUpload(owner: string, key: string) {
    const job = this.store.find(owner, key);
    if (!job) throw new JobError(404, 'The upload has not reached the lab yet. Check again, or choose your photo again.');
    return this.get(job.id, owner);
  }
  view(job: CharacterJob) { return characterJobView(job, this.provider.available && this.provider.canAffordGeneration !== false); }
  async characterBytes(id: string, owner: string) { if (this.get(id, owner).playerRoomId) throw new JobError(403, 'Player faces stay in their original room.'); return this.asset(id, owner, 'atlas.png'); }
  async create(owner: string, idempotencyKey: string, name: string, upload: Buffer, player?: PlayerPortraitJob) {
    const fingerprint = createHash('sha256').update(upload).update(name).update(player?.roomId ?? '').digest('hex');
    const existing = this.store.find(owner, idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new JobError(409, 'This upload has changed. Choose the photo again.');
      return this.get(existing.id, owner);
    }
    if (!this.provider.available) throw new JobError(503, 'Photo generation is not connected yet. Play with sample Balaji for now.');
    const photo = await normalizePhoto(upload);
    // Recheck after asynchronous image decoding; repeated requests can overlap.
    const duplicate = this.store.find(owner, idempotencyKey);
    if (duplicate) {
      if (duplicate.fingerprint !== fingerprint) throw new JobError(409, 'This upload has changed. Choose the photo again.');
      return this.get(duplicate.id, owner);
    }
    const now = this.clock(), recent = this.store.list().filter(job => job.createdAt > now - CHARACTER_RETENTION_MS);
    if (recent.length >= this.dailyJobs || recent.filter(job => job.owner === owner).length >= 10) throw new JobError(429, 'Today’s photo-generation limit has been reached. Your existing Dads still work.');
    const job: CharacterJob = { id: randomUUID(), owner, idempotencyKey, fingerprint, name, status: 'queued', createdAt: now, expiresAt: player?.expiresAt ?? now + CHARACTER_RETENTION_MS,
      ...(player ? { playerRoomId: player.roomId } : {}), baseRevision: 0, baseApproved: false, sourcePresent: true, completed: {}, currentExpression: player ? 'laugh' : 'grin', stepAttempts: {}, attempts: 0,
      skin: DEFAULT_SKIN, atlasRevision: 0, error: null, usage: [], unmeteredRequests: 0, requestIds: [], model: this.provider.model, testMode: this.provider.testMode };
    // Reserve the idempotency key before yielding to disk I/O.
    job.status = 'uploading'; this.store.save(job);
    try { await this.assets.write(job.id, 'source.jpg', photo); job.status = 'queued'; this.store.save(job); }
    catch { job.status = 'failed'; job.sourcePresent = false; job.error = { code: 'storage', message: 'The photo could not be saved. Choose it again.', canRetry: false, uncertain: false }; this.store.save(job); }
    this.kick(); return job;
  }
  approve(id: string, owner: string, revision: number) {
    const job = this.get(id, owner);
    if (job.playerRoomId) throw new JobError(409, 'Your game face is handled automatically.');
    if (revision !== job.baseRevision) throw new JobError(409, 'Dad’s preview changed. Check the latest face first.');
    if (job.baseApproved) return job;
    if (job.status !== 'awaiting_approval') throw new JobError(409, 'Wait for Dad’s first face to finish.');
    job.baseApproved = true; job.status = 'queued'; job.error = null; job.currentExpression = 'serious'; this.store.save(job); this.kick(); return job;
  }
  retry(id: string, owner: string, expression: Expression, revision: number) {
    const job = this.get(id, owner);
    if (job.playerRoomId) throw new JobError(409, 'The original photo has been deleted. Choose a new photo or use your preset.');
    if (revision !== job.baseRevision) throw new JobError(409, 'The preview changed. Check Dad’s latest face.');
    if (['uploading', 'queued', 'generating'].includes(job.status)) return job;
    if (job.error && !this.view(job).error?.canRetry) throw new JobError(409, job.error.message);
    if (!this.view(job).retryableExpressions.includes(expression)) throw new JobError(409, 'This Dad has used his retry allowance. Use the existing preview or choose a new photo.');
    job.status = 'queued'; job.error = null; job.currentExpression = expression; this.store.save(job); this.kick(); return job;
  }
  async finalize(id: string, owner: string, name: string, skin: string) {
    const job = this.get(id, owner);
    if (job.playerRoomId) throw new JobError(409, 'Your game face is handled automatically.');
    if (job.status === 'ready') return job;
    if (!['preview', 'failed'].includes(job.status) || !job.baseApproved || EXPRESSIONS.some(e => !job.completed[e])) throw new JobError(409, 'Finish all six faces before starting the hunt.');
    // Remove the source before publishing. A failed deletion can safely be retried.
    await this.assets.remove(job.id, 'source.jpg');
    job.name = name; job.skin = skin; job.sourcePresent = false; job.status = 'ready'; job.error = null; job.currentExpression = null; this.store.save(job); return job;
  }
  async asset(id: string, owner: string, name: string) {
    const job = this.get(id, owner);
    if (job.playerRoomId) { if (name !== 'laugh.png' || job.status !== 'ready') throw new JobError(404, 'Face not available.'); return this.assets.read(id, name); }
    if (!['source.jpg', 'atlas.png'].includes(name) || (name === 'source.jpg' && !job.sourcePresent)) throw new JobError(404, 'Image not found.');
    return this.assets.read(id, name);
  }
  private kick() {
    if (this.running || this.stopping) return;
    this.running = true;
    this.task = this.pump().finally(() => {
      this.running = false;
      if (!this.stopping && this.store.list().some(job => job.status === 'queued' && job.expiresAt > this.clock())) this.kick();
    });
    // Errors outside provider work are recorded without logging photos, names or secrets.
    this.task.catch(error => console.error('Character worker stopped:', error instanceof Error ? error.name : 'unknown'));
  }
  private async pump() {
    while (!this.stopping) {
      const job = this.store.list().find(job => job.status === 'queued' && job.expiresAt > this.clock());
      if (!job) return;
      await this.step(job);
    }
  }
  private async step(job: CharacterJob): Promise<void> {
    const expression = job.currentExpression ?? generationOrder.find(e => !job.completed[e]) ?? 'grin';
    if (job.attempts >= MAX_ATTEMPTS || (job.stepAttempts[expression] ?? 0) >= 2) {
      job.status = 'failed'; job.error = { code: 'attempt_limit', message: 'Dad has used his retry allowance. Use the existing preview or choose another photo.', canRetry: false, uncertain: false }; this.store.save(job); return;
    }
    job.status = 'generating'; job.currentExpression = expression; job.attempts++; job.stepAttempts[expression] = (job.stepAttempts[expression] ?? 0) + 1; this.store.save(job);
    try {
      const photo = await this.assets.read(job.id, 'source.jpg');
      const base = job.baseApproved ? await this.assets.read(job.id, 'base.png') : undefined;
      const result = await this.provider.generate({ photo, base, expression, correction: job.error?.code === 'invalid_art' ? job.error.message : undefined });
      if (result.usage) job.usage.push(result.usage); else job.unmeteredRequests++;
      if (result.requestId) job.requestIds.push(result.requestId);
      this.store.save(job);
      const normalized = await normalizeHead(result.image);
      if (job.expiresAt <= this.clock()) { await this.expire(job); return; }
      await this.assets.write(job.id, `${expression}.png`, normalized.image);
      job.completed[expression] = `${expression}.png`;
      if (job.playerRoomId) {
        await this.assets.remove(job.id, 'source.jpg'); job.sourcePresent = false; job.skin = normalized.skin; job.atlasRevision = 1;
        job.status = 'ready'; job.error = null; job.currentExpression = null; this.store.save(job);
        await this.onPlayerReady?.(job).catch(() => {}); return;
      }
      if (!job.baseApproved) {
        await this.assets.write(job.id, 'base.png', result.image);
        job.baseRevision++; job.skin = normalized.skin;
      }
      const heads: Partial<Record<Expression, Buffer>> = {};
      for (const e of EXPRESSIONS) if (job.completed[e]) heads[e] = await this.assets.read(job.id, job.completed[e]!);
      await this.assets.write(job.id, 'atlas.png', await assembleAtlas(heads, true)); job.atlasRevision++;
      job.error = null;
      const next = generationOrder.find(e => !job.completed[e]);
      job.currentExpression = job.baseApproved ? next ?? null : null;
      job.status = !job.baseApproved ? 'awaiting_approval' : next ? 'queued' : 'preview';
      this.store.save(job);
    } catch (error) {
      const fault = error instanceof GenerationError ? error : new GenerationError('storage', 'Dad could not be saved. Your completed faces are safe; retry this step.', { canRetry: true });
      // The budget rejected this step before any provider call. It is not an
      // image attempt and must not consume the face's redraw allowance.
      if (['development_budget', 'access', 'quota', 'service_paused', 'not_configured'].includes(fault.code)) { job.attempts--; job.stepAttempts[expression] = Math.max(0, (job.stepAttempts[expression] ?? 1) - 1); }
      job.error = { code: fault.code, message: fault.code === 'invalid_art' ? 'This face came out cropped or without a clean background. We can redraw just this face.' : fault.message, canRetry: fault.canRetry, uncertain: fault.uncertain };
      if (job.playerRoomId) job.error.canRetry = false;
      const canAutoRetry = !job.playerRoomId && fault.automatic && !fault.uncertain && (fault.retryDelayMs ?? 0) <= 30_000 && job.attempts < MAX_ATTEMPTS && (job.stepAttempts[expression] ?? 0) < 2;
      job.status = fault.uncertain ? 'interrupted' : 'failed'; this.store.save(job);
      if (canAutoRetry && !this.stopping) {
        await new Promise(resolve => setTimeout(resolve, Math.max(this.retryDelayMs, fault.retryDelayMs ?? 0)));
        job.status = 'queued'; this.store.save(job);
      }
    } finally {
      if (job.playerRoomId) { await this.assets.remove(job.id, 'source.jpg'); job.sourcePresent = false; this.store.save(job); if (job.expiresAt <= this.clock()) await this.expire(job); }
    }
  }
  private async expire(job: CharacterJob) {
    await this.assets.remove(job.id); job.status = 'expired'; job.sourcePresent = false; job.completed = {}; job.atlasRevision = 0; job.error = null; job.name = ''; job.fingerprint = ''; this.store.save(job);
  }
  async cleanup() {
    for (const job of this.store.list()) {
      if (job.expiresAt <= this.clock() && job.status !== 'generating') await this.expire(job);
      // Recover deletion after a crash between final publication and cleanup.
      if (job.status === 'ready' || job.playerRoomId && ['failed', 'interrupted'].includes(job.status)) { await this.assets.remove(job.id, 'source.jpg'); if (job.sourcePresent) { job.sourcePresent = false; this.store.save(job); } }
    }
  }
  async idle() { await this.task; }
  async close() { this.stopping = true; await this.task; this.store.close(); }
}

export function characterJobView(job: CharacterJob, affordable: boolean): CharacterJobView {
    if (job.playerRoomId) return { id: job.id, name: job.name, status: job.status, completed: job.completed.laugh ? ['laugh'] : [], currentExpression: job.currentExpression,
      baseRevision: 0, baseApproved: false, attempts: job.attempts, remainingAttempts: 0, retryableExpressions: [], expiresAt: job.expiresAt, sourceUrl: null,
      preview: job.status === 'ready' ? { id: job.id, name: job.name, version: 1, atlas: `/api/characters/${job.id}/assets/laugh.png`, columns: 1, rows: 1, expressions: { serious: 0, grin: 0, laugh: 0, giggle: 0, bonked: 0, dizzy: 0 }, expiresAt: job.expiresAt } : null,
      error: job.error ? { ...job.error, canRetry: false } : null, testMode: job.testMode };
    const remainingAttempts = Math.max(0, MAX_ATTEMPTS - job.attempts);
    const idle = !['uploading', 'queued', 'generating', 'ready', 'expired'].includes(job.status);
    const retryableExpressions = idle && affordable && remainingAttempts ? EXPRESSIONS.filter(expression => (job.stepAttempts[expression] ?? 0) < 2 && (job.baseApproved ? expression !== 'grin' && (Boolean(job.completed[expression]) || expression === job.currentExpression) : expression === 'grin')) : [];
    const error = job.error && { ...job.error, canRetry: affordable && (['development_budget', 'quota', 'access', 'service_paused', 'not_configured'].includes(job.error.code) || job.error.canRetry) && remainingAttempts > 0 && (job.stepAttempts[job.currentExpression ?? 'grin'] ?? 0) < 2 };
    return {
      id: job.id, name: job.name, status: job.status, completed: EXPRESSIONS.filter(e => job.completed[e]), currentExpression: job.currentExpression,
      baseRevision: job.baseRevision, baseApproved: job.baseApproved, attempts: job.attempts, remainingAttempts, retryableExpressions,
      expiresAt: job.expiresAt, sourceUrl: job.sourcePresent ? `/api/characters/${job.id}/assets/source.jpg` : null,
      preview: job.atlasRevision ? { id: job.id, name: job.name, version: 1, atlas: `/api/characters/${job.id}/assets/atlas.png?v=${job.atlasRevision}`, columns: 3, rows: 2, expressions: { ...EXPRESSION_FRAMES }, palette: { skin: job.skin }, expiresAt: job.expiresAt } : null,
      error, testMode: job.testMode,
    };
  }
