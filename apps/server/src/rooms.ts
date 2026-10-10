import { createHash, randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { BALAJI, EXPIRY_MS, HOUSE, LocalHuntSession, MAX_PLAYERS, RESULTS_MS, ROUND_MS, balancedTargets, createFatherProfile, placementMix, placeTargets, targetSignature,
  type ActionResult, type CharacterPack, type CommandResponse, type ControlledAttempt, type HuntCommand, type RoomView } from '../../../packages/game-core/src/index.ts';
import type { AssetStore } from './contracts.ts';
import { CharacterJobs, JobError } from './jobs.ts';
import type { RoomPlayer, RoomRecord, RoomStore } from './room-store.ts';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const identity = (request: FastifyRequest) => hash(request.cookies['fh-owner'] ?? '');
const body = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
function name(value: unknown, limit = 24) {
  if (typeof value !== 'string') throw new JobError(400, 'Enter a name first.');
  const clean = value.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > limit || /[\u0000-\u001f\u007f]/.test(clean)) throw new JobError(400, `Use a name between 1 and ${limit} characters.`);
  return clean;
}
function key(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(value)) throw new JobError(400, 'Please retry from the game page.');
  return value;
}
const errorResult = (message: string): ActionResult => ({ ok: false, kind: 'error', message });

export class Rooms {
  private store: RoomStore; private assets: AssetStore; private jobs: CharacterJobs; private clock: () => number;
  constructor(store: RoomStore, assets: AssetStore, jobs: CharacterJobs, clock: () => number = Date.now) {
    this.store = store; this.assets = assets; this.jobs = jobs; this.clock = clock;
  }
  private async get(id: string) {
    const room = await this.store.get(id);
    if (!room) throw new JobError(404, 'This invite does not exist. Check the link.');
    if (this.clock() >= room.resultsExpireAt) throw new JobError(410, 'This case and its results have expired.');
    return room;
  }
  private open(room: RoomRecord) { if (this.clock() >= room.expiresAt) throw new JobError(410, 'This case is closed. The final scores are ready.'); }
  private member(room: RoomRecord, owner: string) {
    const player = room.players.find(p => p.owner === owner);
    if (!player) throw new JobError(403, 'Join this hunt before playing.');
    return player;
  }
  private async change<T>(id: string, action: (room: RoomRecord) => T): Promise<T> {
    for (let n = 0; n < 5; n++) {
      const room = await this.get(id), revision = room.revision, value = action(room);
      if (await this.store.save(room, revision)) return value;
      await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 20));
    }
    throw new JobError(503, 'The room is busy. Reconnecting shortly…');
  }
  private session(player: RoomPlayer) { return player.attempt ? LocalHuntSession.restore(player.attempt.checkpoint, this.clock) : null; }
  async create(owner: string, data: Record<string, unknown>, idem: string): Promise<RoomView> {
    const playerName = name(data.name), fatherName = name(data.fatherName, 32);
    if (data.sourceRoomId !== undefined && (typeof data.sourceRoomId !== 'string' || data.characterId !== undefined)) throw new JobError(400, 'Choose one character for the new game.');
    const fingerprint = hash(JSON.stringify([playerName, fatherName, data.sourceRoomId ?? null, data.characterId ?? null]));
    const old = await this.store.find(owner, idem);
    if (old) { if (old.creationFingerprint && old.creationFingerprint !== fingerprint) throw new JobError(409, 'This creation request changed. Start a fresh game.'); return this.view(old.id, owner); }
    const id = randomUUID();
    let father: CharacterPack = createFatherProfile(fatherName, BALAJI);
    if (typeof data.sourceRoomId === 'string') {
      const source = await this.get(data.sourceRoomId); this.member(source, owner);
      if (!source.father.atlas) throw new JobError(410, 'This character is no longer available. Choose another photo or sample artwork.');
      if (source.father.atlas.startsWith('/api/rooms/')) {
        await this.assets.write(id, 'atlas.png', await this.assets.read(source.id, 'atlas.png'));
        father = createFatherProfile(fatherName, { ...source.father, atlas: `/api/rooms/${id}/assets/atlas.png` });
      }
    } else if (data.characterId !== 'sample-balaji') {
      if (typeof data.characterId !== 'string') throw new JobError(400, `Choose ${fatherName}’s character for this room.`);
      const job = this.jobs.get(data.characterId, owner), preview = this.jobs.view(job).preview;
      if (job.status !== 'ready' || !preview) throw new JobError(409, `Finish making ${fatherName} before creating his room.`);
      await this.assets.write(id, 'atlas.png', await this.jobs.asset(job.id, owner, 'atlas.png'));
      father = createFatherProfile(fatherName, { ...preview, atlas: `/api/rooms/${id}/assets/atlas.png` });
    }
    const now = this.clock(); father.expiresAt = now + EXPIRY_MS;
    const room: RoomRecord = { id, owner, key: idem, creationFingerprint: fingerprint, revision: 1, father, createdAt: now, expiresAt: now + EXPIRY_MS, resultsExpireAt: now + EXPIRY_MS + RESULTS_MS,
      mix: placementMix(placeTargets(id)), players: [{ id: randomUUID(), owner, name: playerName, joinedAt: now, bestScore: 0, attempt: null }], events: [], cursor: 0, cleaned: false };
    try {
      if (!await this.store.insert(room)) { await this.assets.remove(id); return this.create(owner, data, idem); }
    } catch (error) { await this.assets.remove(id); throw error; }
    return this.view(id, owner);
  }
  async join(id: string, owner: string, playerName: unknown) {
    await this.change(id, room => {
      this.open(room);
      if (room.players.some(p => p.owner === owner)) return;
      if (room.players.length >= MAX_PLAYERS) throw new JobError(409, 'All five player seats are taken.');
      const clean = name(playerName);
      if (room.players.some(p => p.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) throw new JobError(409, 'That name is taken. Add a nickname.');
      room.players.push({ id: randomUUID(), owner, name: clean, joinedAt: this.clock(), bestScore: 0, attempt: null });
    });
    return this.view(id, owner);
  }
  async view(id: string, owner: string, after = 0): Promise<RoomView> {
    const room = await this.get(id), now = this.clock(), closed = now >= room.expiresAt, me = room.players.find(p => p.owner === owner);
    const standings = room.players.map(p => {
      const session = this.session(p); session?.tick(); const snapshot = session?.getSnapshot();
      return { id: p.id, name: p.name, bestScore: p.bestScore, currentScore: snapshot?.player.score ?? 0, playing: !closed && snapshot?.status === 'playing', rank: 0 };
    }).sort((a, b) => b.bestScore - a.bestScore);
    standings.forEach(p => { p.rank = 1 + standings.filter(other => other.bestScore > p.bestScore).length; });
    const session = me && !closed ? this.session(me) : null; session?.tick();
    return { room: { id, fatherName: room.father.name, createdAt: room.createdAt, expiresAt: room.expiresAt, resultsExpireAt: room.resultsExpireAt, status: closed ? 'closed' : 'open', playerCount: room.players.length, capacity: MAX_PLAYERS, targetCount: Object.values(room.mix).reduce((a, b) => a + b, 1) },
      me: me ? { id: me.id, name: me.name } : null, father: me && !closed ? room.father : null,
      reusableFather: me && room.father.atlas ? { ...room.father, expiresAt: room.resultsExpireAt } : null,
      standings: me || closed ? standings : [], events: me && !closed ? room.events.filter(e => e.id > after) : [], cursor: room.cursor, revision: room.revision, serverNow: now,
      attempt: session && me?.attempt ? { id: me.attempt.id, snapshot: session.getSnapshot(), ack: me.attempt.ack } : null };
  }
  async start(id: string, owner: string, idem: string, controller: string): Promise<ControlledAttempt> {
    await this.change(id, room => {
      this.open(room); const player = this.member(room, owner);
      if (player.attempt?.key === idem) {
        if (player.attempt.controller !== hash(controller)) throw new JobError(409, 'Resume the current attempt on this device.');
        return;
      }
      const previous = this.session(player); previous?.tick();
      if (previous?.getSnapshot().status === 'playing') throw new JobError(409, 'Your hunt is still running. Resume it to keep playing.');
      const now = this.clock();
      if (room.expiresAt - now < ROUND_MS) throw new JobError(410, 'Less than two minutes remain. Final scores are coming up.');
      const attemptId = randomUUID(), seed = randomUUID();
      const targets = balancedTargets(seed, room.mix, previous ? targetSignature(previous.getSnapshot().targets) : '');
      const session = new LocalHuntSession(player.name, seed, this.clock, true, room.father, { id: attemptId, playerId: player.id, expiresAt: room.expiresAt, targets });
      player.attempt = { id: attemptId, key: idem, controller: hash(controller), checkpoint: session.checkpoint(), ack: 0, moveCredit: 0, creditAt: now, receipts: [] };
    });
    return { view: await this.view(id, owner), controller };
  }
  async resume(id: string, owner: string, attemptId: string, controller: string): Promise<ControlledAttempt> {
    await this.change(id, room => {
      this.open(room); const attempt = this.member(room, owner).attempt;
      if (!attempt || attempt.id !== attemptId) throw new JobError(409, 'This attempt has been replaced. Open the latest hunt.');
      attempt.controller = hash(controller);
    });
    return { view: await this.view(id, owner), controller };
  }
  async commands(id: string, owner: string, attemptId: string, controller: string, commands: HuntCommand[]): Promise<CommandResponse> {
    if (!Array.isArray(commands) || commands.length > 128 || commands.some(c => !c || !Number.isSafeInteger(c.seq) || c.seq < 1)) throw new JobError(400, 'Invalid command batch.');
    const results = await this.change(id, room => {
      this.open(room); const player = this.member(room, owner), attempt = player.attempt;
      if (!attempt || attempt.id !== attemptId) throw new JobError(409, 'This attempt has been replaced.');
      if (attempt.controller !== hash(controller)) throw new JobError(409, 'This hunt is now controlled by another tab. Resume here to take over.');
      const session = this.session(player)!, now = this.clock(); session.tick();
      attempt.moveCredit = Math.min(300, attempt.moveCredit + Math.max(0, now - attempt.creditAt)); attempt.creditAt = now;
      const replies: CommandResponse['results'] = [];
      for (const command of commands) {
        if (command.seq <= attempt.ack) { const receipt = attempt.receipts.find(r => r.seq === command.seq); if (receipt) replies.push(receipt); continue; }
        if (command.seq !== attempt.ack + 1) throw new JobError(409, 'Movement arrived out of order. Reconnect to continue.');
        let result: ActionResult | undefined;
        if (command.kind === 'move') {
          if (!command.direction || !Number.isFinite(command.direction.x) || !Number.isFinite(command.direction.y) || !Number.isFinite(command.deltaMs) || command.deltaMs < 0 || command.deltaMs > 40) throw new JobError(400, 'Invalid movement.');
          const allowed = Math.min(command.deltaMs, attempt.moveCredit); attempt.moveCredit -= allowed;
          session.move(command.direction, allowed);
        } else if (command.kind === 'hint') result = session.hint();
        else if (['search', 'spot', 'catch'].includes(command.kind) && typeof command.id === 'string' && command.id.length < 100) {
          result = command.kind === 'spot' ? session.spot(command.id, command.seenAt) : session[command.kind](command.id);
          if (command.kind === 'catch' && result.ok) {
            const snapshot = session.getSnapshot(), target = snapshot.targets.find(t => t.id === command.id)!;
            const slot = target.kind === 'hidden' ? HOUSE.slots.find(s => s.id === target.slotId) : null;
            const location = slot ? slot.kind === 'toilet' ? 'from the commode. The witch wants a refund.' : `from ${slot.kind === 'bed' ? 'under the bed' : `the ${slot.name}`}.` : 'off a flying broom. No licence.';
            room.events.push({ id: ++room.cursor, playerId: player.id, attemptId, text: `${player.name} bagged a ${room.father.name} ${location}`, at: now });
            room.events = room.events.slice(-100); player.bestScore = Math.max(player.bestScore, snapshot.player.score);
          }
        } else result = errorResult('Unknown game action.');
        attempt.ack = command.seq;
        if (result) { const receipt = { seq: command.seq, result }; replies.push(receipt); attempt.receipts = [...attempt.receipts, receipt].slice(-128); }
      }
      attempt.checkpoint = session.checkpoint(); return replies;
    });
    return { view: await this.view(id, owner), results };
  }
  async asset(id: string, owner: string, filename: string) {
    const room = await this.get(id); this.member(room, owner);
    if (filename !== 'atlas.png' || !room.father.atlas.startsWith('/api/rooms/')) throw new JobError(404, 'Image not found.');
    return this.assets.read(id, filename);
  }
  async cleanup() {
    for (const room of await this.store.list()) {
      if (this.clock() < room.expiresAt) continue;
      if (this.clock() >= room.resultsExpireAt) { await this.assets.remove(room.id); await this.store.remove(room.id); continue; }
      if (!room.cleaned) await this.change(room.id, current => { current.cleaned = true; current.events = []; for (const p of current.players) p.attempt = null; });
    }
  }
  async close() { await this.store.close(); }
}

export function registerRooms(app: FastifyInstance, rooms: Rooms, canonicalOrigin?: string) {
  type Params = { id: string; attemptId: string; name: string };
  app.get('/api/rooms/config', async request => {
    const current = new URL(`${request.protocol}://${request.headers.host}`);
    const addresses = Object.values(networkInterfaces()).flat().filter(a => a && !a.internal && a.family === 'IPv4' && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)).map(a => a!.address);
    const configured = canonicalOrigin || process.env.FATHER_HUNTER_SHARE_ORIGIN;
    const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(current.hostname);
    if (localhost && addresses[0]) current.hostname = addresses[0];
    return { shareOrigin: configured || current.origin, public: !!configured && configured.startsWith('https://'), lanAvailable: !localhost || addresses.length > 0 || !!configured };
  });
  app.post('/api/rooms', { bodyLimit: 4096 }, async request => rooms.create(identity(request), body(request.body), key(request.headers['idempotency-key'])));
  app.get<{ Params: Params }>('/api/rooms/:id', async request => rooms.view(request.params.id, identity(request)));
  app.post<{ Params: Params }>('/api/rooms/:id/join', { bodyLimit: 4096 }, async request => rooms.join(request.params.id, identity(request), body(request.body).name));
  app.get<{ Params: Params; Querystring: { after?: string } }>('/api/rooms/:id/state', async request => rooms.view(request.params.id, identity(request), Math.max(0, Number(request.query.after) || 0)));
  app.post<{ Params: Params }>('/api/rooms/:id/attempts', { bodyLimit: 4096 }, async request => rooms.start(request.params.id, identity(request), key(request.headers['idempotency-key']), key(body(request.body).controller)));
  app.post<{ Params: Params }>('/api/rooms/:id/attempts/:attemptId/resume', { bodyLimit: 4096 }, async request => rooms.resume(request.params.id, identity(request), request.params.attemptId, key(body(request.body).controller)));
  app.post<{ Params: Params }>('/api/rooms/:id/attempts/:attemptId/commands', { bodyLimit: 32768 }, async request => {
    const data = body(request.body); return rooms.commands(request.params.id, identity(request), request.params.attemptId, key(data.controller), data.commands as HuntCommand[]);
  });
  app.get<{ Params: Params }>('/api/rooms/:id/assets/:name', async (request, reply) => reply.type('image/png').send(await rooms.asset(request.params.id, identity(request), request.params.name)));
}
