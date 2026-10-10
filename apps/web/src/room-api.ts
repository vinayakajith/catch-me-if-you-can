import type { CommandResponse, ControlledAttempt, HuntCommand, RoomView } from '@father-hunter/game-core';
import { uploadKey } from './character-api';

export class RoomApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export async function roomRequest<T>(url: string, data?: object, key?: string): Promise<T> {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, { credentials: 'same-origin', signal: controller.signal, method: data ? 'POST' : 'GET',
      headers: { 'x-fh-request': '1', ...(data ? { 'content-type': 'application/json' } : {}), ...(key ? { 'idempotency-key': key } : {}) }, body: data ? JSON.stringify(data) : undefined });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new RoomApiError(response.status, result.message || 'The room could not update. Try again.');
    return result as T;
  } catch (error) { if (error instanceof RoomApiError) throw error; throw new RoomApiError(0, 'Reconnecting… your timer is still running.'); }
  finally { clearTimeout(timeout); }
}
export const createRoom = (name: string, fatherName: string, character: { characterId: string } | { sourceRoomId: string }, key: string) => roomRequest<RoomView>('/api/rooms', { name, fatherName, ...character }, key);
export const roomConfig = () => roomRequest<{ shareOrigin: string; public: boolean; lanAvailable: boolean }>('/api/rooms/config');

export class RoomClient {
  readonly id: string;
  private state: { view: RoomView | null; error: string } = { view: null, error: '' };
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  constructor(id: string) { this.id = id; }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.listeners.forEach(fn => fn()); }
  accept(view: RoomView) {
    if (this.closed) return;
    const old = this.state.view;
    if (old && (view.revision < old.revision || view.revision === old.revision && view.serverNow < old.serverNow)) return;
    this.state = { view, error: '' }; this.emit();
  }
  startPolling() { void this.poll(); document.addEventListener('visibilitychange', this.visible); }
  private visible = () => { if (!document.hidden) { clearTimeout(this.timer); void this.poll(); } };
  private polling = false;
  private async poll() {
    if (this.closed || this.polling) return;
    this.polling = true;
    try { this.accept(await roomRequest<RoomView>(`/api/rooms/${this.id}/state?after=${this.state.view?.cursor ?? 0}`)); }
    catch (error) { this.state = { ...this.state, error: (error as Error).message }; this.emit(); }
    finally { this.polling = false; if (!this.closed) this.timer = setTimeout(() => { if (document.hidden) { this.timer = setTimeout(() => void this.poll(), 3000); } else void this.poll(); }, 500); }
  }
  async join(name: string) { const view = await roomRequest<RoomView>(`/api/rooms/${this.id}/join`, { name }); this.accept(view); }
  async begin(key: string, controller: string) { const result = await roomRequest<ControlledAttempt>(`/api/rooms/${this.id}/attempts`, { controller }, key); this.accept(result.view); return result; }
  async resume() {
    const id = this.state.view?.attempt?.id; if (!id) throw new Error('There is no attempt to resume.');
    const result = await roomRequest<ControlledAttempt>(`/api/rooms/${this.id}/attempts/${id}/resume`, { controller: uploadKey() }); this.accept(result.view); return result;
  }
  commands(id: string, controller: string, commands: HuntCommand[]) { return roomRequest<CommandResponse>(`/api/rooms/${this.id}/attempts/${id}/commands`, { controller, commands }); }
  dispose() { this.closed = true; clearTimeout(this.timer); document.removeEventListener('visibilitychange', this.visible); this.listeners.clear(); }
}
