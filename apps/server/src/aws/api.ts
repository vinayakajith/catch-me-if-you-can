import awsLambdaFastify from '@fastify/aws-lambda';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { buildApp } from '../app.ts';
import { JobError } from '../jobs.ts';
import { runtime, required } from './runtime.ts';
import type { CloudJobs } from './jobs.ts';
import type { FastifyInstance } from 'fastify';
import { DynamoSocketStore } from './socket-store.ts';

export function registerUploads(app: FastifyInstance, jobs: CloudJobs) {
  const owner = (cookie?: string) => createHash('sha256').update(cookie ?? '').digest('hex');
  app.post('/api/characters/uploads', { bodyLimit: 4096 }, async (request, reply) => {
    const data = request.body as { name?: unknown; digest?: unknown } | null, key = request.headers['idempotency-key'];
    if (!data || typeof data.name !== 'string' || typeof data.digest !== 'string' || typeof key !== 'string') throw new JobError(400, 'Choose a photo and enter a name.');
    return reply.code(202).send(await jobs.beginUpload(owner(request.cookies['fh-owner']), key, data.name, data.digest));
  });
  app.post<{ Params: { id: string } }>('/api/characters/uploads/:id/complete', { bodyLimit: 1024 }, async (request, reply) => reply.code(202).send(await jobs.view(await jobs.completeUpload(request.params.id, owner(request.cookies['fh-owner'])))));
}
// CloudFront overwrites the origin header; a direct gateway call must not bypass
// edge limits or provide a spoofed client IP. No provider key is loaded by this API.
export function authenticateOrigin(headers: Record<string, string | undefined>, secret: string) {
  const value = headers['x-fh-origin'] ?? '', expected = Buffer.from(secret), received = Buffer.from(value);
  return expected.length >= 32 && received.length === expected.length && timingSafeEqual(expected, received);
}
export function viewerIp(value?: string) {
  if (!value) return undefined;
  const candidate = value.startsWith('[') ? value.slice(1, value.indexOf(']')) : value.slice(0, value.lastIndexOf(':'));
  return isIP(candidate) ? candidate : undefined;
}
type Proxy = (event: any, context: any) => Promise<unknown>;
let prepared: Promise<Proxy> | undefined;
async function prepare() {
  const state = runtime();
  const provider = { available: false, testMode: false, model: 'server-managed', async generate(): Promise<never> { throw new Error('Image calls belong to the worker.'); } };
  const { app } = await buildApp({ directory: '/tmp/father-hunter', provider, jobs: state.jobs, assets: state.assets, roomStore: state.rooms, limiter: state.limiter, background: false, publicOrigin: required('FATHER_HUNTER_PUBLIC_ORIGIN'), socketStore: new DynamoSocketStore(state.db), socketEndpoint: required('FH_SOCKET_ENDPOINT') });
  registerUploads(app, state.jobs);
  const proxy = awsLambdaFastify(app, { serializeLambdaArguments: false, decorateRequest: false }); await app.ready(); return proxy;
}
export async function handler(event: any, context: any) {
  const headers = Object.fromEntries(Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  if (!authenticateOrigin(headers, required('FH_ORIGIN_SECRET'))) return { statusCode: 403, headers: { 'cache-control': 'no-store' }, body: JSON.stringify({ message: 'Open the game from its public address.' }) };
  const ip = viewerIp(headers['cloudfront-viewer-address']);
  if (!ip) return { statusCode: 403, body: JSON.stringify({ message: 'Invalid request origin.' }) };
  // Fastify's inject remote address is supplied by the trusted Lambda event.
  event.requestContext.http.sourceIp = ip;
  delete headers['x-forwarded-for']; delete headers['x-fh-origin']; event.headers = headers;
  prepared ??= prepare().catch(error => { prepared = undefined; throw error; });
  return (await prepared)(event, context);
}
