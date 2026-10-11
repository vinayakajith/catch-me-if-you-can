import type { SharedMessage, SharedRequest, SharedView } from '@catch-me-if-you-can/game-core';
import { roomRequest } from './room-api.ts';
import { uploadKey } from './character-api.ts';

type Pending = { message: SharedRequest; sentAt: number; resolve: (m: SharedMessage) => void; reject: (e: Error) => void };
export class SharedClient {
  readonly id: string;
  private state: { view: SharedView | null; connected: boolean; error: string } = { view: null, connected: false, error: '' };
  private listeners = new Set<() => void>();
  private ws?: WebSocket; private pending = new Map<string, Pending>(); private stopped = false;
  private timer?: ReturnType<typeof setTimeout>; private pulse?: ReturnType<typeof setInterval>; private connecting = false; private failures = 0;
  private latestState = 0; private lastMessage = 0; offset = 0;
  atlas?: string;
  private artwork?: Promise<void>;
  constructor(id: string) { this.id = id; }
  time = () => Date.now() + this.offset;
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.listeners.forEach(fn => fn()); }
  async initialize() {
    try {
      const view = await roomRequest<SharedView>(`/api/rooms/${this.id}/shared`); this.offset = view.serverNow - Date.now(); this.accept(view);
      if (view.me && view.phase !== 'closed') void this.connect();
    } catch (error) { this.state = { ...this.state, error: (error as Error).message }; this.emit(); }
  }
  async join(name: string) { await roomRequest(`/api/rooms/${this.id}/join`, { name }); await this.initialize(); }
  prepare() {
    return this.artwork ??= (async () => {
      const father = this.state.view?.father; if (!father) throw new Error('Join the room first.');
      const [response] = await Promise.all([fetch(father.atlas, { credentials: 'same-origin' }), import('phaser'), import('./game/HouseScene')]);
      if (!response.ok) throw new Error('The house artwork could not load. Try again.');
      const url = URL.createObjectURL(await response.blob());
      try { const image = new Image(); image.src = url; await image.decode(); if (this.stopped) URL.revokeObjectURL(url); else this.atlas = url; }
      catch { URL.revokeObjectURL(url); throw new Error('The house artwork could not load. Try again.'); }
    })().catch(error => { this.artwork = undefined; throw error; });
  }
  private accept(view: SharedView) {
    const old = this.state.view;
    if (old) {
      const newer = view.serverNow > this.latestState || view.serverNow === this.latestState && (view.round?.id !== old.round?.id || (view.round?.revision ?? 0) >= (old.round?.revision ?? 0));
      const players = (newer ? view.players : old.players).map(p => {
        const other = (newer ? old.players : view.players).find(o => o.id === p.id);
        return other && other.revision > p.revision ? other : p;
      });
      view = { ...(newer ? view : old), players };
    }
    this.latestState = Math.max(this.latestState, view.serverNow); this.state = { ...this.state, view }; this.emit();
  }
  private receive = (event: MessageEvent) => {
    let m: SharedMessage; try { m = JSON.parse(event.data); } catch { return; }
    this.lastMessage = Date.now();
    const waiting = m.requestId ? this.pending.get(m.requestId) : undefined;
    if (waiting) this.pending.delete(m.requestId!);
    if (m.type === 'error') {
      waiting?.reject(Object.assign(new Error(m.message), { retryable: m.retryable }));
      if (!m.retryable && /another tab/.test(m.message)) { this.stopped = true; this.ws?.close(); }
      this.state = { ...this.state, error: m.message }; this.emit(); return;
    }
    const now = m.type === 'state' ? m.view.serverNow : m.serverNow;
    if (waiting) this.offset = now - (waiting.sentAt + Date.now()) / 2;
    this.state = { ...this.state, connected: true, error: '' }; this.failures = 0;
    if (m.type === 'state') { this.accept(m.view); if (m.view.phase === 'closed') { this.stopped = true; clearInterval(this.pulse); this.ws?.close(); } }
    else if (this.state.view?.round?.id === m.roundId) {
      const view = this.state.view;
      this.state = { ...this.state, view: { ...view, players: view.players.map(p => p.id === m.player.id && m.player.revision > p.revision ? m.player : p) } }; this.emit();
    }
    waiting?.resolve(m);
  };
  private async connect() {
    if (this.stopped || this.connecting || this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    this.connecting = true;
    try {
      const { ticket, endpoint } = await roomRequest<{ ticket: string; endpoint: string }>(`/api/rooms/${this.id}/ticket`, {});
      if (this.stopped) return;
      const url = new URL(endpoint, location.origin); url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:'; url.searchParams.set('ticket', ticket);
      const ws = new WebSocket(url); this.ws = ws; this.lastMessage = Date.now();
      ws.onmessage = this.receive;
      ws.onopen = () => {
        this.state = { ...this.state, connected: true, error: '' }; this.emit();
        for (const p of this.pending.values()) { p.sentAt = Date.now(); ws.send(JSON.stringify(p.message)); }
        if (!this.pending.size) void this.request({ kind: 'hello' }).catch(() => {});
      };
      ws.onclose = () => {
        this.state = { ...this.state, connected: false, error: this.stopped ? this.state.error : 'Reconnecting… your place is saved.' }; this.emit(); this.schedule();
      };
      ws.onerror = () => ws.close();
      this.pulse ??= setInterval(() => {
        if (Date.now() - this.lastMessage > 8000) this.ws?.close();
        if (this.ws?.readyState === WebSocket.OPEN) {
          for (const p of this.pending.values()) if (Date.now() - p.sentAt > 2000) { p.sentAt = Date.now(); this.ws.send(JSON.stringify(p.message)); }
          if (!this.pending.size) void this.request({ kind: 'ping' }).catch(() => {});
        }
      }, 2000);
    } catch (error) { this.state = { ...this.state, error: (error as Error).message }; this.emit(); this.schedule(); }
    finally { this.connecting = false; }
  }
  private schedule() {
    clearTimeout(this.timer); if (this.stopped || this.state.view?.phase === 'closed') return;
    this.timer = setTimeout(() => void this.connect(), Math.min(5000, 250 * 2 ** this.failures++) + Math.random() * 150);
  }
  request(data: Omit<SharedRequest, 'requestId'>): Promise<SharedMessage> {
    if (this.stopped || this.pending.size > 16) return Promise.reject(new Error('Reconnect to continue.'));
    const message = { ...data, requestId: uploadKey() };
    return new Promise((resolve, reject) => {
      this.pending.set(message.requestId, { message, resolve, reject, sentAt: Date.now() });
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
    });
  }
  dispose() { this.stopped = true; clearTimeout(this.timer); clearInterval(this.pulse); this.ws?.close(); if (this.atlas) URL.revokeObjectURL(this.atlas); for (const p of this.pending.values()) p.reject(new Error('This view has closed.')); this.pending.clear(); this.listeners.clear(); }
}
