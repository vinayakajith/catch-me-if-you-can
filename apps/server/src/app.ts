import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { createHash, randomBytes } from 'node:crypto';
import { EXPRESSIONS, type Expression } from '../../../packages/game-core/src/index.ts';
import { GenerationError, type ImageProvider } from './contracts.ts';
import { MAX_UPLOAD_BYTES } from './images.ts';
import { CharacterJobs, JobError } from './jobs.ts';
import { DiskAssetStore, SqliteJobStore } from './storage.ts';

function owner(token?: string) { return createHash('sha256').update(token ?? '').digest('hex'); }
function validName(value: unknown) {
  if (typeof value !== 'string') throw new JobError(400, 'Enter Dad’s name.');
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 32) throw new JobError(400, 'Dad’s name must be between 1 and 32 characters.');
  return name;
}
function bodyObject(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }

export async function buildApp(options: { directory: string; provider: ImageProvider; dailyJobs?: number; clock?: () => number; retryDelayMs?: number }) {
  const app = Fastify({ logger: false, bodyLimit: MAX_UPLOAD_BYTES + 16384 });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 1, parts: 2 } });
  const jobs = new CharacterJobs({ ...options, store: new SqliteJobStore(options.directory), assets: new DiskAssetStore(options.directory) });
  await jobs.initialize();
  const cleanup = setInterval(() => { jobs.cleanup().catch(() => console.error('Character cleanup will retry.')); }, 60_000); cleanup.unref();
  app.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      if (request.headers['x-fh-request'] !== '1') throw new JobError(403, 'Please use Father Hunter to create your Dad.');
      const origin = request.headers.origin;
      if (origin) {
        let host: string; try { host = new URL(origin).host; } catch { throw new JobError(403, 'Invalid origin.'); }
        if (host !== request.headers.host) throw new JobError(403, 'Open this page from the Father Hunter address.');
      }
    }
    if (!/^[a-f0-9]{64}$/.test(request.cookies['fh-owner'] ?? '')) {
      const token = randomBytes(32).toString('hex'); request.cookies['fh-owner'] = token;
      reply.setCookie('fh-owner', token, { path: '/api', httpOnly: true, sameSite: 'strict', maxAge: 7 * 86400, secure: request.protocol === 'https' });
    }
    reply.header('Cache-Control', 'private, no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
  });
  app.get('/api/characters/config', async () => ({ available: options.provider.available, testMode: options.provider.testMode, maxUploadBytes: MAX_UPLOAD_BYTES,
    message: options.provider.available ? undefined : 'Photo generation is not connected yet. Sample Balaji is ready to play.' }));
  app.post('/api/characters', async (request, reply) => {
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) throw new JobError(400, 'Choose your photo again to start a fresh upload.');
    let photo: Buffer | undefined, name: string | undefined;
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'photo') throw new JobError(400, 'Choose one portrait photo.');
        photo = await part.toBuffer();
      } else if (part.fieldname === 'name') name = validName(part.value);
    }
    if (!photo || !name) throw new JobError(400, 'Add Dad’s photo and name.');
    const job = await jobs.create(owner(request.cookies['fh-owner']), key, name, photo);
    reply.code(202); return jobs.view(job);
  });
  app.get<{ Params: { id: string } }>('/api/characters/:id', async request => jobs.view(jobs.get(request.params.id, owner(request.cookies['fh-owner']))));
  app.post<{ Params: { id: string } }>('/api/characters/:id/approve', async request => {
    const data = bodyObject(request.body);
    return jobs.view(jobs.approve(request.params.id, owner(request.cookies['fh-owner']), Number(data.baseRevision)));
  });
  app.post<{ Params: { id: string } }>('/api/characters/:id/retry', async request => {
    const data = bodyObject(request.body);
    if (!EXPRESSIONS.includes(data.expression as Expression)) throw new JobError(400, 'Choose the expression to retry.');
    return jobs.view(jobs.retry(request.params.id, owner(request.cookies['fh-owner']), data.expression as Expression, Number(data.baseRevision)));
  });
  app.post<{ Params: { id: string } }>('/api/characters/:id/finalize', async request => {
    const data = bodyObject(request.body), name = validName(data.name);
    if (typeof data.skin !== 'string' || !/^#[0-9a-f]{6}$/i.test(data.skin)) throw new JobError(400, 'Choose a body colour.');
    return jobs.view(await jobs.finalize(request.params.id, owner(request.cookies['fh-owner']), name, data.skin));
  });
  app.get<{ Params: { id: string; name: string } }>('/api/characters/:id/assets/:name', async (request, reply) => {
    const bytes = await jobs.asset(request.params.id, owner(request.cookies['fh-owner']), request.params.name);
    return reply.type(request.params.name.endsWith('.jpg') ? 'image/jpeg' : 'image/png').send(bytes);
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof JobError) return reply.code(error.status).send({ message: error.message });
    if (error instanceof GenerationError) return reply.code(400).send({ message: error.message });
    const detail = error as { statusCode?: number; code?: string };
    if (detail.statusCode === 413 || detail.code?.includes('LIMIT')) return reply.code(413).send({ message: 'Choose one photo under 10 MB.' });
    if (detail.code === 'ENOENT') return reply.code(404).send({ message: 'This image is no longer available. Create a fresh Dad.' });
    return reply.code(500).send({ message: 'Dad’s paperwork got stuck. Your completed faces are saved; try again.' });
  });
  app.addHook('onClose', async () => { clearInterval(cleanup); await jobs.close(); });
  return { app, jobs };
}
