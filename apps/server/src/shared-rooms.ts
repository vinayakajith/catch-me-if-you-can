import { randomUUID } from 'node:crypto';
import { COUNTDOWN_MS, HOUSE, MAX_PLAYERS, MOVEMENT_BUFFER_MS, ROUND_MS, createSharedRound, sharedSession, targetSignature,
  type SharedPlayer, type SharedPlayerRecord, type SharedRequest, type SharedView, type ActionResult } from '../../../packages/game-core/src/index.ts';
import type { RoomRecord, RoomStore } from './room-store.ts';
import { JobError } from './errors.ts';

export function publicPlayer(p: SharedPlayerRecord, now: number, closed = false): SharedPlayer {
  return { id: p.id, name: p.name, colour: p.colour, ready: p.ready, connected: p.connected && now - p.lastSeen < 10000,
    lastSeen: p.lastSeen, position: p.position, roomId: p.roomId, score: p.score, roundId: p.roundId,
    ack: p.ack, revision: p.revision, search: p.search, ...(p.avatar && !closed ? { avatar: p.avatar } : {}) };
}
export class SharedRooms {
  readonly store: RoomStore;
  readonly clock: () => number;
  constructor(store: RoomStore, clock: () => number = Date.now) { this.store = store; this.clock = clock; }
  async get(id: string) {
    const room = await this.store.get(id);
    if (!room?.shared || room.resultsExpireAt <= this.clock()) throw new JobError(404, 'This shared invite has expired.');
    return room;
  }
  member(room: RoomRecord, owner: string) {
    const p = room.players.find(p => p.owner === owner);
    if (!p?.shared) throw new JobError(403, 'Join this room first.');
    return p.shared;
  }
  advance(room: RoomRecord) {
    const state = room.shared!, now = this.clock(), round = state.round;
    for (const p of room.players.map(p => p.shared!)) if (!p.connected || now - p.lastSeen >= 10000) p.ready = false;
    const host = room.players.find(p => p.id === state.hostId)?.shared;
    if (!host || now - host.lastSeen >= 30000) {
      const next = room.players.find(p => p.shared?.connected && now - p.shared.lastSeen < 10000)?.id;
      if (next) state.hostId = next;
    }
    if (round && (state.phase === 'countdown' || state.phase === 'playing')) {
      if (now >= round.startedAt) state.phase = 'playing';
      for (const p of room.players.map(p => p.shared!).filter(p => p.roundId === round.id && p.search)) {
        const session = sharedSession(round, p, room.father, room.expiresAt, now); session.tick();
        const snapshot = session.getSnapshot();
        if (snapshot.opened.some(id => !round.opened.includes(id))) { round.opened = [...new Set([...round.opened, ...snapshot.opened])]; round.revision++; }
        p.search = snapshot.search;
      }
      if (now >= round.endsAt || round.targets.every(t => t.claimedBy) || now >= room.expiresAt) {
        round.finishedAt ??= Math.min(now, round.endsAt, room.expiresAt);
        state.phase = 'results'; round.revision++;
        state.lastScores = room.players.filter(p => p.shared?.roundId === round.id).map(p => ({
          id: p.id, name: p.name, colour: p.shared!.colour, score: p.shared!.score,
        })).sort((a, b) => b.score - a.score);
      }
    }
    if (now >= room.expiresAt) state.phase = 'closed';
  }
  async change<T>(id: string, action: (room: RoomRecord) => T) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const room = await this.get(id), revision = room.revision; this.advance(room);
      const result = action(room);
      if (await this.store.save(room, revision)) return result;
      await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 15));
    }
    throw new JobError(503, 'Catching up with the house…');
  }
  private viewOf(room: RoomRecord, owner: string): SharedView {
    this.advance(room); const state = room.shared!, now = this.clock(), me = room.players.find(p => p.owner === owner);
    return { protocol: 2, room: { mode: 'shared', id: room.id, fatherName: room.father.name, createdAt: room.createdAt, expiresAt: room.expiresAt,
      resultsExpireAt: room.resultsExpireAt, status: state.phase === 'closed' ? 'closed' : 'open', playerCount: room.players.length, capacity: MAX_PLAYERS, targetCount: 20 },
      me: me?.id ?? null, hostId: state.hostId, phase: state.phase, serverNow: now, revision: room.revision,
      players: me ? room.players.map(p => publicPlayer(p.shared!, now, state.phase === 'closed')) : [],
      father: me && state.phase !== 'closed' ? room.father : null, round: me ? state.round : null,
      cursor: state.cursor, events: me ? state.events : [], lastScores: me || state.phase === 'closed' ? state.lastScores : [] };
  }
  async view(id: string, owner: string) { return this.viewOf(await this.get(id), owner); }
  async publishAvatar(id: string, owner: string, jobId: string) {
    await this.change(id, room => {
      const p = this.member(room, owner);
      if (room.expiresAt > this.clock() && p.avatarJob === jobId) { p.avatar = `/api/rooms/${id}/players/${p.id}/face?v=${jobId}`; p.revision++; }
    });
  }
  async connect(id: string, owner: string, connectionId: string) {
    await this.change(id, room => {
      if (room.shared!.phase === 'closed') throw new JobError(410, 'This room has closed.');
      const p = this.member(room, owner); p.connectionId = connectionId; p.connected = true; p.lastSeen = this.clock(); p.revision++;
    });
  }
  async disconnect(id: string, owner: string, connectionId: string) {
    await this.change(id, room => { const p = this.member(room, owner); if (p.connectionId === connectionId) { p.connected = false; p.ready = false; p.revision++; } });
  }
  async handle(id: string, owner: string, connectionId: string, request: SharedRequest) {
    if (!request || typeof request.requestId !== 'string' || !/^[\w-]{1,80}$/.test(request.requestId)) throw new JobError(400, 'Invalid game message.');
    const results = await this.change(id, room => {
      const state = room.shared!, now = this.clock(), p = this.member(room, owner);
      if (p.connectionId !== connectionId) throw new JobError(409, 'Your game is open in another tab.');
      if (state.phase === 'closed' && request.kind !== 'hello' && request.kind !== 'ping') throw new JobError(410, 'This room has closed.');
      p.lastSeen = now; p.connected = true; p.revision++;
      const replies: { seq: number; result: ActionResult }[] = [];
      if (request.kind === 'hello' || request.kind === 'ping') return replies;
      if (request.kind !== 'input') {
        if (p.controls?.includes(request.requestId)) return replies;
        p.controls = [...(p.controls ?? []), request.requestId].slice(-32);
      }
      if (request.kind === 'ready') {
        if (state.phase !== 'lobby') throw new JobError(409, 'Wait for the next lobby.');
        p.ready = request.ready === true; return replies;
      }
      if (request.kind === 'leave') {
        if (state.phase === 'playing' || state.phase === 'countdown') { p.connected = false; p.ready = false; }
        else room.players = room.players.filter(member => member.id !== p.id);
        this.advance(room); return replies;
      }
      if (request.kind === 'start' || request.kind === 'rematch') {
        if (state.hostId !== p.id) throw new JobError(403, 'Only the host can start the hunt.');
        if (request.kind === 'rematch') {
          if (state.phase !== 'results') throw new JobError(409, 'Finish this hunt first.');
          state.phase = 'lobby'; for (const member of room.players) member.shared!.ready = false;
          return replies;
        }
        // A duplicated start must never create another round or reset its timer.
        if (state.phase === 'playing' || state.phase === 'countdown') return replies;
        if (state.phase !== 'lobby') throw new JobError(409, 'Return to the lobby first.');
        const active = room.players.map(p => p.shared!).filter(p => p.connected && now - p.lastSeen < 10000);
        if (active.length < 2 || active.some(p => !p.ready)) throw new JobError(409, 'Wait for at least two players and everyone’s Ready light.');
        if (room.expiresAt - now < ROUND_MS + COUNTDOWN_MS) throw new JobError(410, 'There is not enough time for another full round.');
        state.round = createSharedRound(randomUUID(), randomUUID(), now, state.round ? targetSignature(state.round.targets) : '');
        state.phase = 'countdown'; state.events = [];
        active.forEach((p, i) => {
          p.position = { x: HOUSE.spawn.x + (i - 2) * 70, y: HOUSE.spawn.y + (i % 2) * 18 };
          p.roomId = 'hall'; p.score = 0; p.roundId = state.round!.id; p.ack = 0; p.credit = 0; p.creditAt = state.round!.startedAt;
          p.search = null; p.receipts = []; p.lastHintAt = null; p.revision++;
        });
        return replies;
      }
      if (request.kind !== 'input' || !state.round || request.roundId !== state.round.id || p.roundId !== state.round.id) throw new JobError(409, 'Wait for the next hunt.');
      const commands = request.commands;
      if (!Array.isArray(commands) || commands.length > 128 || commands.some(c => !c || !Number.isSafeInteger(c.seq) || c.seq < 1)) throw new JobError(400, 'Invalid input batch.');
      const round = state.round;
      p.credit = Math.min(MOVEMENT_BUFFER_MS, p.credit + Math.max(0, now - p.creditAt)); p.creditAt = Math.max(now, round.startedAt);
      const session = sharedSession(round, p, room.father, room.expiresAt, now);
      for (const command of commands) {
        if (command.seq <= p.ack) { const receipt = p.receipts.find(r => r.seq === command.seq); if (receipt) replies.push(receipt); continue; }
        if (command.seq !== p.ack + 1) throw new JobError(409, 'Reconnecting your controls…');
        let result: ActionResult | undefined;
        if (command.kind === 'move') {
          if (!command.direction || !Number.isFinite(command.direction.x) || !Number.isFinite(command.direction.y) || !Number.isFinite(command.deltaMs) || command.deltaMs < 0 || command.deltaMs > 40) throw new JobError(400, 'Invalid movement.');
          const allowed = Math.min(p.credit, command.deltaMs); p.credit -= allowed; session.move(command.direction, allowed);
        } else if (command.kind === 'hint') result = session.hint();
        else if (['search', 'spot', 'catch'].includes(command.kind) && typeof command.id === 'string' && command.id.length < 100) {
          result = command.kind === 'spot' ? session.spot(command.id, command.seenAt) : session[command.kind](command.id);
          if (command.kind === 'catch' && result.ok) {
            const target = round.targets.find(t => t.id === command.id)!;
            const slot = target.kind === 'hidden' ? HOUSE.slots.find(s => s.id === target.slotId) : null;
            const where = slot ? slot.kind === 'bed' ? 'from under the bed' : slot.kind === 'toilet' ? 'from the commode. Unbelievable' : 'from the ' + slot.name : 'off a flying broom. No licence';
            state.events.push({ id: ++state.cursor, playerId: p.id, attemptId: round.id, text: p.name + ' bagged a ' + room.father.name + ' ' + where + '.', at: now });
            state.events = state.events.slice(-30);
          }
        } else throw new JobError(400, 'Unknown game action.');
        p.ack = command.seq;
        if (result) { const receipt = { seq: command.seq, result }; replies.push(receipt); p.receipts = [...p.receipts, receipt].slice(-128); }
      }
      const saved = session.checkpoint(), snapshot = saved.snapshot;
      p.position = snapshot.player.position; p.roomId = snapshot.player.roomId; p.score = snapshot.player.score; p.search = snapshot.search; p.lastHintAt = saved.lastHintAt;
      if (commands.some(c => c.kind !== 'move')) {
        round.targets = snapshot.targets; round.opened = snapshot.opened; round.spotted = snapshot.spotted; round.revision++;
      }
      this.advance(room); return replies;
    });
    return { view: await this.view(id, owner), results };
  }
}
