import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { JobError } from './jobs.ts';

export interface RateLimiter { take(key: string, limit: number, windowMs: number, now: number): Promise<boolean> | boolean }
export class MemoryRateLimiter implements RateLimiter {
  private entries = new Map<string, { until: number; count: number }>();
  take(key: string, limit: number, windowMs: number, now: number) {
    if (this.entries.size > 10000) for (const [id, value] of this.entries) if (value.until <= now) this.entries.delete(id);
    const id = `${key}:${Math.floor(now / windowMs)}`, entry = this.entries.get(id) ?? { until: (Math.floor(now / windowMs) + 1) * windowMs, count: 0 };
    if (entry.count >= limit) return false;
    entry.count++; this.entries.set(id, entry); return true;
  }
}
export function publicOrigin(value?: string) {
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Public origin must be an HTTPS origin without a path.');
  return url.origin;
}
export function registerSecurity(app: FastifyInstance, options: { publicOrigin?: string; limiter?: RateLimiter; clock?: () => number }) {
  const configured = publicOrigin(options.publicOrigin), limiter = options.limiter ?? new MemoryRateLimiter(), clock = options.clock ?? Date.now;
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    if (configured) reply.header('Strict-Transport-Security', 'max-age=31536000');
    if (!['GET', 'HEAD'].includes(request.method)) {
      if (request.headers['x-fh-request'] !== '1') throw new JobError(403, 'Please use Father Hunter to create your game.');
      const origin = request.headers.origin;
      if (configured && origin !== configured) throw new JobError(403, 'Open this page from the Father Hunter address.');
      if (origin && !configured) {
        let valid = false;
        try { const parsed = new URL(origin); valid = parsed.origin === `${request.protocol}://${request.headers.host}`; } catch {}
        if (!valid) throw new JobError(403, 'Open this page from the Father Hunter address.');
      }
    }
    const ip = createHash('sha256').update(request.ip).digest('hex');
    const owner = createHash('sha256').update(request.cookies['fh-owner'] ?? request.ip).digest('hex');
    const path = request.url.split('?')[0], createRoom = request.method === 'POST' && path === '/api/rooms';
    const createPhoto = request.method === 'POST' && (path === '/api/characters' || path === '/api/characters/uploads');
    const limits: [string, number, number][] = createRoom ? [[`room:owner:${owner}`, 20, 3600000], [`room:ip:${ip}`, 100, 3600000]] : createPhoto ? [[`photo:owner:${owner}`, 10, 86400000], [`photo:ip:${ip}`, 30, 86400000]] : [[`api:owner:${owner}`, 1800, 60000]];
    for (const [key, limit, windowMs] of limits) {
      if (!await limiter.take(key, limit, windowMs, clock())) {
        reply.header('Retry-After', String(Math.ceil((windowMs - clock() % windowMs) / 1000)));
        throw new JobError(429, createPhoto ? 'Photo requests are paused for now. Saved characters and sample games still work.' : createRoom ? 'You have created plenty of games. Try again later, or replay an existing room.' : 'Taking a breath. Reconnecting shortly…');
      }
    }
  });
}
