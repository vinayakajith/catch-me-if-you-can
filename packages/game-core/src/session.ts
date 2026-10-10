import { HOUSE, canReach, isWalkable, roomAt, distance } from './house.ts';
import { broomPosition, createBroomRoute } from './broom.ts';
import { clearPath } from './navigation.ts';
import { random, shuffled } from './random.ts';
import { createFatherProfile, createTimeMachineCase } from './cases.ts';
import { isDadExposed } from './peeking.ts';
import type { ActionResult, Activity, CharacterPack, HuntSession, HuntSnapshot, Point, Target } from './types.ts';

export const ROUND_MS = 2 * 60 * 1000;
export const EXPIRY_MS = 60 * 60 * 1000;
export const SEARCH_MS = 1000;
export const HINT_MS = 20 * 1000;

export function placeTargets(seed: string): Target[] {
  const rng = random(seed), count = 12 + Math.floor(rng() * 9);
  const candidates = shuffled(HOUSE.slots, rng);
  // A spotlighted deadpan statue is the welcoming easy catch. Other disguises
  // shuffle, with at least one hidden target in every room and one broom rider.
  const chosen = [HOUSE.slots.find(s => s.kind === 'statue')!];
  for (const room of HOUSE.rooms.filter(r => r.id !== 'hall' && r.id !== 'living')) chosen.push(candidates.find(s => s.roomId === room.id)!);
  for (const slot of candidates) if (chosen.length < count - 1 && !chosen.includes(slot)) chosen.push(slot);
  const hidden: Target[] = chosen.map((s, i) => ({ kind: 'hidden', id: `dad-${i + 1}`, slotId: s.id, claimedBy: null, claimedAt: null }));
  return [...hidden, { kind: 'broom', id: 'broom-dad', route: createBroomRoute(seed, ROUND_MS), lockedPosition: null, claimedBy: null, claimedAt: null }];
}
const signature = (seed: string) => placeTargets(seed).filter(t => t.kind === 'hidden').map(t => t.slotId).sort().join('|');
export function freshHuntSeed(previous: string | undefined, entropy: string): string {
  let seed = entropy, attempt = 0;
  while (previous && signature(seed) === signature(previous)) seed = `${entropy}-${++attempt}`;
  return seed;
}

export interface HuntCheckpoint { snapshot: HuntSnapshot; lastHintAt: number | null }
export interface HuntOptions { id?: string; playerId?: string; expiresAt?: number; targets?: Target[] }

export class LocalHuntSession implements HuntSession {
  private state: HuntSnapshot;
  private listeners = new Set<() => void>();
  private sequence = 1;
  private lastSecond = -1;
  private lastHintAt = -Infinity;
  private clock: () => number;
  private hardExpiry?: number;
  constructor(name: string, seed: string, clock: () => number = Date.now, autoStart = true, father: CharacterPack = createFatherProfile('Balaji'), options: HuntOptions = {}) {
    this.clock = clock;
    this.hardExpiry = options.expiresAt;
    const now = clock();
    const playerName = name.trim().slice(0, 24) || 'Detective';
    const profile = createFatherProfile(father.name, father);
    this.state = { id: options.id ?? `solo-${seed}`, seed, father: profile, case: createTimeMachineCase(profile.name, playerName), status: autoStart ? 'playing' : 'ready', finishReason: null, startedAt: now, endsAt: now + ROUND_MS, expiresAt: options.expiresAt ?? now + EXPIRY_MS, now, lastCatchAt: now,
      player: { id: options.playerId ?? 'hunter-1', name: playerName, position: { ...HOUSE.spawn }, roomId: 'hall', score: 0 },
      targets: structuredClone(options.targets ?? placeTargets(seed)), opened: [], spotted: [], search: null, activity: [] };
  }
  checkpoint(): HuntCheckpoint { return { snapshot: structuredClone(this.state), lastHintAt: Number.isFinite(this.lastHintAt) ? this.lastHintAt : null }; }
  static restore(saved: HuntCheckpoint, clock: () => number = Date.now): LocalHuntSession {
    const s = saved.snapshot;
    const session = new LocalHuntSession(s.player.name, s.seed, clock, false, s.father);
    session.state = structuredClone(s); session.hardExpiry = s.expiresAt;
    session.lastHintAt = saved.lastHintAt ?? -Infinity;
    session.sequence = Math.max(0, ...s.activity.map(a => a.id)) + 1;
    return session;
  }
  getSnapshot = () => this.state;
  time = () => this.clock();
  start() {
    if (this.state.status !== 'ready') return;
    const now = this.clock();
    this.state = { ...this.state, status: 'playing', startedAt: now, endsAt: now + ROUND_MS, expiresAt: this.hardExpiry ?? now + EXPIRY_MS, lastCatchAt: now, now };
    this.emit();
  }
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
        const occupied = this.state.targets.some(t => t.kind === 'hidden' && t.slotId === slot.id && !t.claimedBy);
        this.addActivity(occupied ? `${this.state.father.name} uncovered.` : 'Checked. Empty.', 'search', slot.id);
      }
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
  spot(targetId: string): ActionResult {
    this.tick();
    if (this.state.status !== 'playing') return this.error('This hunt has finished.');
    const target = this.state.targets.find(t => t.id === targetId);
    if (!target || target.claimedBy) return this.error('Already gone. Keep looking.');
    if (target.kind === 'hidden') {
      const slot = HOUSE.slots.find(s => s.id === target.slotId)!;
      if (slot.roomId !== this.state.player.roomId || !isDadExposed(this.state, slot, this.clock())) return this.error('Check the furniture to uncover him.');
    } else {
      const position = broomPosition(target, this.clock() - this.state.startedAt);
      if (roomAt(position) !== this.state.player.roomId) return this.error('Walk into his room first.');
      this.state = { ...this.state, targets: this.state.targets.map(t => t.id === targetId ? { ...target, lockedPosition: position } : t) };
    }
    if (!this.state.spotted.includes(targetId)) this.state = { ...this.state, spotted: [...this.state.spotted, targetId] };
    this.emit();
    return { ok: true, message: '', kind: 'spot', targetId };
  }
  catch(targetId: string): ActionResult {
    this.tick();
    if (this.state.status !== 'playing') return this.error('This hunt has finished.');
    const target = this.state.targets.find(t => t.id === targetId);
    if (!target) return this.error('Suspicious, but not your father.');
    if (target.claimedBy) return this.error('Already caught. One dad, one point.');
    let location: string, slotId: string | undefined;
    if (target.kind === 'hidden') {
      const slot = HOUSE.slots.find(s => s.id === target.slotId)!;
      if (!canReach(this.state.player.position, slot)) return this.error('Get a little closer. No catching through walls!');
      if (!isDadExposed(this.state, slot, this.clock())) return this.error(`Check it first to uncover ${this.state.father.name}.`);
      const room = HOUSE.rooms.find(r => r.id === slot.roomId)!;
      slotId = slot.id;
      location = slot.kind === 'toilet' ? 'inside the commode' : `by the ${slot.name} in the ${room.name.toLowerCase()}`;
    } else {
      const position = broomPosition(target, this.clock() - this.state.startedAt), player = this.state.player.position;
      if (!target.lockedPosition || roomAt(position) !== this.state.player.roomId || distance(position, player) > 100 || !clearPath(player, position, 4)) return this.error('Tap the broom rider and walk over to bag him.');
      location = 'joyriding on a broom';
    }
    const now = this.clock();
    this.state = { ...this.state, lastCatchAt: now,
      targets: this.state.targets.map(t => t.id === target.id ? { ...t, claimedBy: this.state.player.id, claimedAt: now } : t),
      player: { ...this.state.player, score: this.state.player.score + 1 } };
    this.addActivity(`${this.state.player.name} found ${this.state.father.name} ${location}.`, 'catch', slotId);
    if (this.state.targets.every(t => t.claimedBy)) this.finish('complete');
    this.emit();
    return { ok: true, message: '', kind: 'catch', targetId, slotId };
  }
  hint(): ActionResult {
    this.tick();
    const now = this.clock();
    if (this.state.status !== 'playing') return this.error('This hunt has finished.');
    if (now - this.state.lastCatchAt < HINT_MS || now - this.lastHintAt < HINT_MS) return this.error('Give your detective instincts a moment.');
    const target = this.state.targets.find(t => !t.claimedBy);
    if (!target) return this.error('All dads accounted for.');
    const roomId = target.kind === 'hidden' ? HOUSE.slots.find(s => s.id === target.slotId)!.roomId : roomAt(broomPosition(target, now - this.state.startedAt));
    const room = HOUSE.rooms.find(r => r.id === roomId)!;
    this.lastHintAt = now;
    const message = `A suspicious dad noise came from the ${room.name.toLowerCase()}.`;
    this.addActivity(message, 'hint'); this.emit();
    return { ok: true, message, kind: 'hint' };
  }
}
