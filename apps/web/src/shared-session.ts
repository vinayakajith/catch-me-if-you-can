import { LocalHuntSession, MOVEMENT_BUFFER_MS, sharedSnapshot, type ActionResult, type HuntCommand, type HuntSession, type HuntSnapshot, type Point } from '@catch-me-if-you-can/game-core';
import { SharedClient } from './shared-client.ts';
const failed = (message: string): ActionResult => ({ ok: false, kind: 'error', message });

export class SharedSession implements HuntSession {
  readonly client: SharedClient; private local: LocalHuntSession; private snapshot: HuntSnapshot;
  private listeners = new Set<() => void>(); private pending: HuntCommand[] = []; private resolvers = new Map<number, (r: ActionResult) => void>();
  private sequence: number; private flight = false; private closed = false; private stamp = ''; private roundId: string;
  private timer: ReturnType<typeof setInterval>; private unsubscribe: () => void; private localUnsubscribe?: () => void;
  constructor(client: SharedClient) {
    this.client = client; const v = client.getSnapshot().view!, p = v.players.find(p => p.id === v.me)!;
    this.roundId = v.round!.id; this.sequence = p.ack;
    this.local = LocalHuntSession.restore({ snapshot: sharedSnapshot(v.round!, p, v.father!, v.room.expiresAt, client.time(), p.search), lastHintAt: null }, this.time);
    this.snapshot = this.local.getSnapshot(); this.watch();
    this.unsubscribe = client.subscribe(this.reconcile); this.timer = setInterval(() => { this.tick(); void this.flush(); }, 200);
  }
  time = () => this.client.time();
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private emit = () => { const c = this.client.getSnapshot(); this.snapshot = { ...this.local.getSnapshot(), connection: c.connected ? 'online' : 'reconnecting', connectionMessage: c.error, pendingActions: this.resolvers.size }; this.listeners.forEach(f => f()); };
  private watch() { this.localUnsubscribe?.(); this.localUnsubscribe = this.local.subscribe(this.emit); }
  private reconcile = () => {
    const v = this.client.getSnapshot().view, p = v?.players.find(p => p.id === v.me); if (!v?.round || !p || v.round.id !== this.roundId || !v.father) return;
    const stamp = `${p.revision}:${v.round.revision}:${this.time() >= v.round.startedAt}:${v.phase}`;
    if (stamp === this.stamp) { this.emit(); return; } this.stamp = stamp;
    // Keep unacknowledged actions until their receipts arrive. They are safely
    // replayed after a lost response; movement already acknowledged is not predicted twice.
    this.local = LocalHuntSession.restore({ snapshot: sharedSnapshot(v.round, p, v.father, v.room.expiresAt, this.time(), p.search), lastHintAt: null }, this.time);
    for (const c of this.pending) if (c.seq > p.ack && c.kind === 'move') this.local.move(c.direction, c.deltaMs);
    this.watch(); this.emit();
  };
  start() { return Promise.resolve(); }
  move(direction: Point, deltaMs: number) {
    if (!this.client.getSnapshot().connected || this.local.getSnapshot().status !== 'playing' || Math.hypot(direction.x, direction.y) < .05) return;
    const ack = this.client.getSnapshot().view!.players.find(p => p.id === this.client.getSnapshot().view!.me)!.ack;
    const used = this.pending.reduce((n, c) => n + (c.seq > ack && c.kind === 'move' ? c.deltaMs : 0), 0);
    const ms = Math.min(40, Math.max(0, deltaMs), MOVEMENT_BUFFER_MS - used); if (!Number.isFinite(ms) || ms <= 0) return;
    this.local.move(direction, ms); this.pending.push({ seq: ++this.sequence, kind: 'move', direction: { ...direction }, deltaMs: ms }); this.emit();
  }
  private action(kind: 'search' | 'spot' | 'catch' | 'hint', id = '') {
    if (!this.client.getSnapshot().connected) return Promise.resolve(failed('Reconnecting… your place is saved.'));
    const seq = ++this.sequence, promise = new Promise<ActionResult>(resolve => this.resolvers.set(seq, resolve));
    this.pending.push(kind === 'hint' ? { seq, kind } : { seq, kind, id, ...(kind === 'spot' ? { seenAt: this.time() } : {}) }); void this.flush(); return promise;
  }
  search = (id: string) => this.action('search', id);
  spot = (id: string) => this.action('spot', id);
  catch = (id: string) => this.action('catch', id);
  hint = () => this.action('hint');
  private async flush() {
    if (this.closed || this.flight || !this.pending.length || !this.client.getSnapshot().connected) return;
    this.flight = true; const commands = this.pending.slice(0, 128);
    try {
      const message = await this.client.request({ kind: 'input', roundId: this.roundId, commands });
      if (this.closed) return;
      if (message.type === 'error') throw new Error(message.message);
      this.pending = this.pending.filter(c => c.seq > commands.at(-1)!.seq);
      if (message.type === 'state') for (const r of message.results ?? []) { this.resolvers.get(r.seq)?.(r.result); this.resolvers.delete(r.seq); }
      this.stamp = ''; this.reconcile();
    } catch (error) {
      if (!(error as { retryable?: boolean }).retryable) {
        for (const resolve of this.resolvers.values()) resolve(failed((error as Error).message)); this.resolvers.clear(); this.pending = [];
        const v = this.client.getSnapshot().view; this.sequence = v?.players.find(p => p.id === v.me)?.ack ?? this.sequence;
      }
    } finally { this.flight = false; if (!this.closed && this.pending.some(c => c.kind !== 'move')) setTimeout(() => void this.flush(), 50); }
  }
  tick() { if (this.local.getSnapshot().status === 'ready') this.reconcile(); this.local.tick(); }
  dispose() { this.closed = true; clearInterval(this.timer); this.unsubscribe(); this.localUnsubscribe?.(); this.local.dispose(); for (const resolve of this.resolvers.values()) resolve(failed('This hunt has ended.')); this.resolvers.clear(); this.listeners.clear(); }
}
