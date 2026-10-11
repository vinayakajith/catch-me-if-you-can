import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { FastifyInstance } from 'fastify';
import type { SharedMessage, SharedRequest } from '../../../packages/game-core/src/index.ts';
import { SharedRooms } from './shared-rooms.ts';
import { JobError } from './errors.ts';
import { MemoryRateLimiter, type RateLimiter } from './security.ts';

export interface SocketIdentity { id: string; roomId: string; owner: string; expiresAt: number }
export interface SocketTicket { roomId: string; owner: string; origin: string; expiresAt: number }
export interface SocketStore {
  ticket(hash: string, data: SocketTicket): Promise<void>;
  consume(hash: string, now: number): Promise<SocketTicket | undefined>;
  put(data: SocketIdentity): Promise<void>;
  get(id: string): Promise<SocketIdentity | undefined>;
  list(roomId: string): Promise<SocketIdentity[]>;
  remove(data: SocketIdentity): Promise<void>;
}
export class MemorySocketStore implements SocketStore {
  tickets = new Map<string, SocketTicket>(); connections = new Map<string, SocketIdentity>();
  async ticket(hash: string, data: SocketTicket) {
    for (const [key, value] of this.tickets) if (value.expiresAt <= Date.now()) this.tickets.delete(key);
    this.tickets.set(hash, data);
  }
  async consume(hash: string, now: number) { const t = this.tickets.get(hash); this.tickets.delete(hash); return t && t.expiresAt > now ? t : undefined; }
  async put(data: SocketIdentity) { this.connections.set(data.id, data); }
  async get(id: string) { return this.connections.get(id); }
  async list(roomId: string) { return [...this.connections.values()].filter(c => c.roomId === roomId); }
  async remove(data: SocketIdentity) { this.connections.delete(data.id); }
}
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
type Sender = (id: string, message: SharedMessage) => Promise<void>;
export class Realtime {
  readonly shared: SharedRooms; readonly store: SocketStore; readonly send: Sender; readonly limiter: RateLimiter;
  constructor(shared: SharedRooms, store: SocketStore, send: Sender, limiter: RateLimiter = new MemoryRateLimiter()) {
    this.shared = shared; this.store = store; this.send = send; this.limiter = limiter;
  }
  async issue(roomId: string, owner: string, origin: string) {
    const room = await this.shared.get(roomId); this.shared.member(room, owner);
    if (room.expiresAt <= this.shared.clock()) throw new JobError(410, 'This room has closed.');
    const token = randomBytes(32).toString('hex');
    await this.store.ticket(hash(token), { roomId, owner, origin, expiresAt: this.shared.clock() + 30000 }); return token;
  }
  async connect(id: string, token: string, origin: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new JobError(403, 'Open the invite to connect.');
    const ticket = await this.store.consume(hash(token), this.shared.clock());
    if (!ticket || ticket.origin !== origin) throw new JobError(403, 'Open the invite to reconnect.');
    await this.shared.connect(ticket.roomId, ticket.owner, id);
    const room = await this.shared.get(ticket.roomId);
    await this.store.put({ id, roomId: ticket.roomId, owner: ticket.owner, expiresAt: room.expiresAt });
    // The next hello is sent after the upgrade has completed (also on API Gateway).
  }
  async disconnect(id: string) {
    const c = await this.store.get(id); if (!c) return;
    await this.store.remove(c);
    await this.shared.disconnect(c.roomId, c.owner, id).catch(() => {});
  }
  async message(id: string, raw: string) {
    let request: SharedRequest | undefined;
    try {
      const c = await this.store.get(id); if (!c) throw new JobError(403, 'Reconnect to the room.');
      if (Buffer.byteLength(raw) > 24000) throw new JobError(413, 'Game message is too large.');
      if (!await this.limiter.take('socket:' + c.owner, 900, 60000, this.shared.clock())) throw new JobError(429, 'Give the controls a moment.');
      try { request = JSON.parse(raw); } catch { throw new JobError(400, 'Invalid game message.'); }
      if (!request || !['hello', 'ping', 'ready', 'start', 'rematch', 'leave', 'input'].includes(request.kind)) throw new JobError(400, 'Invalid game message.');
      const { view, results } = await this.shared.handle(c.roomId, c.owner, id, request);
      const connections = await this.store.list(c.roomId);
      const room = await this.shared.store.get(c.roomId);
      const moving = request.kind === 'input' && request.commands?.every(command => command.kind === 'move') && view.phase === 'playing';
      const peers = request.kind === 'ping' ? connections.filter(p => p.id === id) : connections;
      await Promise.all(peers.map(async peer => {
        const record = room?.players.find(p => p.owner === peer.owner);
        if (!record?.shared || record.shared.connectionId !== peer.id) return;
        const own = peer.id === id;
        const message: SharedMessage = moving ? { type: 'motion', roundId: view.round!.id, player: view.players.find(p => p.id === view.me)!, serverNow: view.serverNow, ...(own ? { requestId: request!.requestId } : {}) }
          : { type: 'state', view: { ...view, me: record.id }, ...(own ? { requestId: request!.requestId, results } : {}) };
        try { await this.send(peer.id, message); } catch { await this.disconnect(peer.id); }
      }));
    } catch (error) {
      const e = error instanceof JobError ? error : new JobError(503, 'Reconnecting to the house…');
      const requestId = typeof request?.requestId === 'string' && /^[\w-]{1,80}$/.test(request.requestId) ? request.requestId : undefined;
      await this.send(id, { type: 'error', message: e.message, requestId, retryable: e.status >= 500 || e.status === 429 }).catch(() => {});
    }
  }
}

export function registerShared(app: FastifyInstance, realtime: Realtime, endpoint?: string) {
  const owner = (cookie?: string) => hash(cookie ?? '');
  app.get<{ Params: { id: string } }>('/api/rooms/:id/shared', request => realtime.shared.view(request.params.id, owner(request.cookies['fh-owner'])));
  app.post<{ Params: { id: string } }>('/api/rooms/:id/ticket', { bodyLimit: 1024 }, async request => ({
    ticket: await realtime.issue(request.params.id, owner(request.cookies['fh-owner']), request.headers.origin ?? `${request.protocol}://${request.headers.host}`),
    endpoint: endpoint ?? '/api/realtime',
  }));
}
export function attachLocalSockets(app: FastifyInstance, shared: SharedRooms, store: SocketStore, limiter?: RateLimiter) {
  const sockets = new Map<string, WebSocket>(), wss = new WebSocketServer({ noServer: true, maxPayload: 24000 });
  const realtime = new Realtime(shared, store, async (id, message) => {
    const ws = sockets.get(id); if (ws?.readyState !== WebSocket.OPEN) throw new Error('Closed socket');
    await new Promise<void>((resolve, reject) => ws.send(JSON.stringify(message), error => error ? reject(error) : resolve()));
  }, limiter);
  app.server.on('upgrade', async (request, socket, head) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname !== '/api/realtime') { socket.destroy(); return; }
      const id = randomUUID(); await realtime.connect(id, url.searchParams.get('ticket') ?? '', request.headers.origin ?? '');
      wss.handleUpgrade(request, socket, head, ws => {
        sockets.set(id, ws); let work = Promise.resolve();
        ws.on('message', data => { work = work.then(() => realtime.message(id, data.toString())).catch(() => ws.close()); });
        ws.on('close', () => { sockets.delete(id); void work.then(() => realtime.disconnect(id)); });
        ws.on('error', () => ws.close());
      });
    } catch { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); }
  });
  app.addHook('preClose', async () => { for (const ws of sockets.values()) ws.terminate(); wss.close(); });
  return realtime;
}
