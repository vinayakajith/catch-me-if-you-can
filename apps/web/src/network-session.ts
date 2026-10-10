import { LocalHuntSession, type ActionResult, type ControlledAttempt, type HuntCommand, type HuntSession, type HuntSnapshot, type Point } from '@father-hunter/game-core';
import { uploadKey } from './character-api';
import { RoomApiError, RoomClient } from './room-api';

const failed = (message: string): ActionResult => ({ ok: false, kind: 'error', message });
export class NetworkHuntSession implements HuntSession {
  readonly viewKey = uploadKey();
  private client: RoomClient;
  private local: LocalHuntSession;
  private snapshot: HuntSnapshot;
  private listeners = new Set<() => void>();
  private pending: HuntCommand[] = [];
  private resolvers = new Map<number, (result: ActionResult) => void>();
  private controller = uploadKey();
  private key = uploadKey();
  private sequence = 0;
  private offset = 0;
  private attemptId = '';
  private inFlight = false;
  private disposed = false;
  private connection: 'online' | 'reconnecting' | 'replaced' = 'online';
  private message = '';
  private timer: ReturnType<typeof setInterval>;
  private unsubscribe: () => void;
  private localUnsubscribe?: () => void;
  private starting?: Promise<void>;
  readonly resumed: boolean;
  constructor(client: RoomClient, resumed?: ControlledAttempt) {
    this.client = client; const view = resumed?.view ?? client.getSnapshot().view!;
    this.offset = view.serverNow - Date.now(); this.resumed = !!resumed;
    this.local = new LocalHuntSession(view.me!.name, this.key, this.time, false, view.father!);
    if (resumed?.view.attempt) { this.attemptId = resumed.view.attempt.id; this.controller = resumed.controller; this.sequence = resumed.view.attempt.ack; this.local = LocalHuntSession.restore({ snapshot: resumed.view.attempt.snapshot, lastHintAt: null }, this.time); }
    this.snapshot = this.local.getSnapshot(); this.watchLocal();
    this.timer = setInterval(() => { this.tick(); void this.flush(); }, 100);
    this.unsubscribe = client.subscribe(() => {
      const current = client.getSnapshot().view;
      if (current?.attempt?.id === this.attemptId && !this.inFlight && !this.pending.length) this.hydrate(current.attempt.snapshot);
      if (current?.room.status === 'closed') { this.local.tick(); this.emit(); }
    });
  }
  time = () => Date.now() + this.offset;
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit = () => { this.snapshot = { ...this.local.getSnapshot(), connection: this.connection, connectionMessage: this.message }; this.listeners.forEach(fn => fn()); };
  private watchLocal() { this.localUnsubscribe?.(); this.localUnsubscribe = this.local.subscribe(this.emit); }
  private hydrate(snapshot: HuntSnapshot) {
    this.local = LocalHuntSession.restore({ snapshot, lastHintAt: snapshot.activity.find(e => e.kind === 'hint')?.at ?? null }, this.time);
    for (const command of this.pending) if (command.kind === 'move') this.local.move(command.direction, command.deltaMs);
    this.watchLocal(); this.emit();
  }
  start() {
    if (this.attemptId) return Promise.resolve();
    if (this.starting) return this.starting;
    this.starting = this.client.begin(this.key, this.controller).then(result => {
      if (this.disposed) return;
      this.attemptId = result.view.attempt!.id; this.sequence = result.view.attempt!.ack;
      this.offset = result.view.serverNow - Date.now(); this.hydrate(result.view.attempt!.snapshot);
    }).finally(() => { this.starting = undefined; });
    return this.starting;
  }
  move(direction: Point, deltaMs: number) {
    if (!this.attemptId || this.connection !== 'online' || this.local.getSnapshot().status !== 'playing' || Math.hypot(direction.x, direction.y) < .05) return;
    if (this.pending.reduce((sum, c) => sum + (c.kind === 'move' ? c.deltaMs : 0), 0) >= 250) return;
    const ms = Math.min(40, Math.max(0, deltaMs)); this.local.move(direction, ms);
    this.pending.push({ seq: ++this.sequence, kind: 'move', direction: { ...direction }, deltaMs: ms });
    this.snapshot = { ...this.local.getSnapshot(), connection: this.connection, connectionMessage: this.message };
  }
  private action(kind: 'search' | 'spot' | 'catch' | 'hint', id = ''): Promise<ActionResult> {
    if (!this.attemptId || this.connection !== 'online') return Promise.resolve(failed(this.message || 'Wait for the connection to return.'));
    if (this.local.getSnapshot().status !== 'playing') return Promise.resolve(failed('This hunt has finished.'));
    const seq = ++this.sequence;
    const result = new Promise<ActionResult>(resolve => this.resolvers.set(seq, resolve));
    this.pending.push(kind === 'hint' ? { seq, kind } : { seq, kind, id }); void this.flush(); return result;
  }
  search = (id: string) => this.action('search', id);
  spot = (id: string) => this.action('spot', id);
  catch = (id: string) => this.action('catch', id);
  hint = () => this.action('hint');
  private async flush() {
    if (this.disposed || this.inFlight || !this.attemptId || this.connection === 'replaced' || !this.pending.length) return;
    this.inFlight = true; const batch = this.pending.slice(0, 128);
    try {
      const result = await this.client.commands(this.attemptId, this.controller, batch);
      if (this.disposed) return;
      const ack = result.view.attempt!.ack;
      this.pending = this.pending.filter(c => c.seq > ack); this.connection = 'online'; this.message = '';
      this.hydrate(result.view.attempt!.snapshot);
      for (const receipt of result.results) { this.resolvers.get(receipt.seq)?.(receipt.result); this.resolvers.delete(receipt.seq); }
      this.client.accept(result.view);
    } catch (error) {
      if (this.disposed) return;
      this.message = (error as Error).message;
      this.connection = error instanceof RoomApiError && error.status >= 400 && error.status < 500 ? 'replaced' : 'reconnecting';
      if (this.connection === 'replaced') { this.pending = []; for (const resolve of this.resolvers.values()) resolve(failed(this.message)); this.resolvers.clear(); }
      this.emit();
    } finally { this.inFlight = false; }
  }
  tick() { this.local.tick(); }
  dispose() {
    this.disposed = true; clearInterval(this.timer); this.unsubscribe(); this.localUnsubscribe?.(); this.local.dispose();
    for (const resolve of this.resolvers.values()) resolve(failed('This view has closed.')); this.resolvers.clear(); this.listeners.clear();
  }
}
