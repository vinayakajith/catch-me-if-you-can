import { HOUSE, canReach, isWalkable, roomAt } from './house';
import type { ActionResult, Activity, HuntSession, HuntSnapshot, Point, Target } from './types';

export const ROUND_MS = 10 * 60 * 1000;
export const EXPIRY_MS = 60 * 60 * 1000;
export const SEARCH_MS = 1000;
export const HINT_MS = 60 * 1000;

function random(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h += 0x6D2B79F5; let t = Math.imul(h ^ h >>> 15, 1 | h); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function placeTargets(seed: string): Target[] {
  const rng = random(seed);
  const shuffle = <T,>(list: T[]): T[] => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const selected: string[] = [];
  for (const room of HOUSE.rooms.filter(r => r.id !== 'hall')) {
    const slots = HOUSE.slots.filter(s => s.roomId === room.id);
    selected.push(shuffle(slots.filter(s => s.mode === 'peek'))[0].id);
    // The commode reveal is a signature joke in this house, present on every run.
    selected.push(room.id === 'bathroom' ? 'bathroom-toilet' : shuffle(slots.filter(s => s.mode === 'search'))[0].id);
  }
  selected.push(...shuffle(HOUSE.slots.filter(s => s.mode === 'peek' && !selected.includes(s.id))).slice(0, 2).map(s => s.id));
  return selected.map((slotId, i) => ({ id: `dad-${i + 1}`, slotId, claimedBy: null, claimedAt: null }));
}

export class LocalHuntSession implements HuntSession {
  private state: HuntSnapshot;
  private listeners = new Set<() => void>();
  private sequence = 1;
  private lastSecond = -1;
  private lastHintAt = -Infinity;
  constructor(name: string, seed: string, private clock: () => number = Date.now) {
    const now = clock();
    this.state = { id: `solo-${seed}`, seed, status: 'playing', finishReason: null, startedAt: now, endsAt: now + ROUND_MS, expiresAt: now + EXPIRY_MS, now, lastCatchAt: now,
      player: { id: 'hunter-1', name: name.trim().slice(0, 24) || 'Detective', position: { ...HOUSE.spawn }, roomId: 'hall', score: 0 },
      targets: placeTargets(seed), opened: [], search: null,
      activity: [{ id: 0, text: 'Balaji is missing. In twelve separate places.', kind: 'welcome', at: now }] };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  dispose() { this.listeners.clear(); }
  private emit() { this.listeners.forEach(f => f()); }
  private addActivity(text: string, kind: Activity['kind'], slotId?: string) {
    const event: Activity = { id: this.sequence++, text, kind, slotId, at: this.clock() };
    this.state = { ...this.state, activity: [event, ...this.state.activity].slice(0, 30) };
  }
  private error(message: string): ActionResult { return { ok: false, message, kind: 'error' }; }
  private finish(reason: HuntSnapshot['finishReason']) {
    this.state = { ...this.state, status: reason === 'expired' ? 'expired' : 'finished', finishReason: reason, search: null, now: this.clock() };
  }
  tick() {
    const now = this.clock();
    if (this.state.status !== 'playing') return;
    let changed = false;
    if (now >= this.state.expiresAt) { this.finish('expired'); changed = true; }
    else if (now >= this.state.endsAt) { this.finish('timeout'); changed = true; }
    else if (this.state.search && now >= this.state.search.endsAt) {
      const slot = HOUSE.slots.find(s => s.id === this.state.search!.slotId)!;
      this.state = { ...this.state, search: null };
      if (canReach(this.state.player.position, slot)) {
        this.state = { ...this.state, opened: [...this.state.opened, slot.id] };
        const occupied = this.state.targets.some(t => t.slotId === slot.id && !t.claimedBy);
        this.addActivity(occupied ? (slot.kind === 'toilet' ? 'The lid is up. WHY IS HE IN THERE?! Tap Balaji!' : 'Well, well, well. Tap Balaji to catch him!') : slot.empty, 'search', slot.id);
      } else this.addActivity('You walked away. The mystery remains.', 'search');
      changed = true;
    }
    const second = Math.floor(now / 1000);
    if (changed || second !== this.lastSecond) { this.lastSecond = second; this.state = { ...this.state, now }; this.emit(); }
  }
  move(direction: Point, deltaMs: number) {
    this.tick();
    if (this.state.status !== 'playing' || !Number.isFinite(direction.x + direction.y + deltaMs)) return;
    const len = Math.hypot(direction.x, direction.y);
    if (len < .05) return;
    const step = 210 * Math.min(Math.max(deltaMs, 0), 40) / 1000;
    const pos = { ...this.state.player.position };
    const x = pos.x + direction.x / Math.max(1, len) * step;
    if (isWalkable({ x, y: pos.y })) pos.x = x;
    const y = pos.y + direction.y / Math.max(1, len) * step;
    if (isWalkable({ x: pos.x, y })) pos.y = y;
    const roomId = roomAt(pos);
    const roomChanged = roomId !== this.state.player.roomId;
    this.state = { ...this.state, player: { ...this.state.player, position: pos, roomId } };
    if (roomChanged) this.emit();
  }
  search(slotId: string): ActionResult {
    this.tick();
    if (this.state.status !== 'playing') return this.error('This hunt has finished.');
    const slot = HOUSE.slots.find(s => s.id === slotId);
    if (!slot || !canReach(this.state.player.position, slot)) return this.error('Walk to the front of it to investigate.');
    if (this.state.search) return this.error('One very suspicious thing at a time.');
    if (this.state.opened.includes(slotId)) return this.error('Already checked. Look closely for a face.');
    const now = this.clock();
    this.state = { ...this.state, search: { slotId, startedAt: now, endsAt: now + SEARCH_MS } };
    this.emit();
    return { ok: true, message: slot.kind === 'toilet' ? 'Opening the commode lid…' : `Checking the ${slot.name}…`, kind: 'search', slotId };
  }
  catch(slotId: string): ActionResult {
    this.tick();
    if (this.state.status !== 'playing') return this.error('This hunt has finished.');
    const slot = HOUSE.slots.find(s => s.id === slotId);
    if (!slot || !canReach(this.state.player.position, slot)) return this.error('Get a little closer. No catching through walls!');
    const target = this.state.targets.find(t => t.slotId === slotId);
    if (!target) return this.error('Suspicious, but not your father.');
    if (target.claimedBy) return this.error('Already caught. One Balaji, one point.');
    if (slot.mode === 'search' && !this.state.opened.includes(slotId)) return this.error('Open it first. Something is definitely in there.');
    const now = this.clock();
    this.state = { ...this.state, lastCatchAt: now,
      targets: this.state.targets.map(t => t.id === target.id ? { ...t, claimedBy: this.state.player.id, claimedAt: now } : t),
      player: { ...this.state.player, score: this.state.player.score + 1 } };
    const room = HOUSE.rooms.find(r => r.id === slot.roomId)!;
    this.addActivity(`${this.state.player.name} found Balaji ${slot.kind === 'toilet' ? 'inside the commode' : `by the ${slot.name} in the ${room.name.toLowerCase()}`}.`, 'catch', slotId);
    if (this.state.targets.every(t => t.claimedBy)) this.finish('complete');
    this.emit();
    return { ok: true, message: slot.reaction, kind: 'catch', slotId };
  }
  hint(): ActionResult {
    this.tick();
    const now = this.clock();
    if (this.state.status !== 'playing') return this.error('This hunt has finished.');
    if (now - this.state.lastCatchAt < HINT_MS || now - this.lastHintAt < HINT_MS) return this.error('Give your detective instincts a minute.');
    const target = this.state.targets.find(t => !t.claimedBy);
    if (!target) return this.error('All dads accounted for.');
    const room = HOUSE.rooms.find(r => r.id === HOUSE.slots.find(s => s.id === target.slotId)!.roomId)!;
    this.lastHintAt = now;
    const message = `A suspicious dad noise came from the ${room.name.toLowerCase()}.`;
    this.addActivity(message, 'hint'); this.emit();
    return { ok: true, message, kind: 'hint' };
  }
}
