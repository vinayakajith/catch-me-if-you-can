import { HOUSE } from './house.ts';
import { createBroomRoute } from './broom.ts';
import { random, shuffled } from './random.ts';
import { ROUND_MS } from './session.ts';
import type { ActionResult, CharacterPack, HuntSnapshot, Point, Target } from './types.ts';

export const MAX_PLAYERS = 5;
// Bound prediction and server catch-up equally, while tolerating mobile RTTs.
// Credit still accrues from server wall time; extra packets cannot add speed.
export const MOVEMENT_BUFFER_MS = 1000;
export const RESULTS_MS = 24 * 60 * 60 * 1000;
export interface PlacementMix { visible: number; peek: number; search: number }
export const targetSignature = (targets: Target[]) => targets.filter(t => t.kind === 'hidden').map(t => t.slotId).sort().join('|');
export function placementMix(targets: Target[]): PlacementMix {
  const mix = { visible: 0, peek: 0, search: 0 };
  for (const target of targets) if (target.kind === 'hidden') mix[HOUSE.slots.find(s => s.id === target.slotId)!.mode]++;
  return mix;
}
// Every attempt has the room's cast size and exposure mix, but its own copies.
export function balancedTargets(seed: string, mix: PlacementMix, previous = ''): Target[] {
  const rng = random(seed), statue = HOUSE.slots.find(s => s.kind === 'statue')!;
  const pools = (['visible', 'search', 'peek'] as const).map(mode => ({
    slots: HOUSE.slots.filter(s => s.mode === mode && s !== statue),
    count: mix[mode] - (mode === 'visible' ? 1 : 0),
  }));
  // Some dense mixes fill every eligible slot. They have no alternative
  // layout; replay must still work, with fresh claims and a new broom route.
  const canReshuffle = pools.some(pool => pool.count > 0 && pool.count < pool.slots.length);
  for (let attempt = 0; attempt < 2048; attempt++) {
    const chosen = [statue];
    for (const pool of pools) chosen.push(...shuffled(pool.slots, rng).slice(0, pool.count));
    if (new Set(chosen.map(s => s.roomId)).size !== 5) continue;
    const targets: Target[] = chosen.map((slot, i) => ({ kind: 'hidden', id: `dad-${i + 1}`, slotId: slot.id, claimedBy: null, claimedAt: null }));
    if (canReshuffle && targetSignature(targets) === previous) continue;
    targets.push({ kind: 'broom', id: 'broom-dad', route: createBroomRoute(seed, ROUND_MS), lockedPosition: null, claimedBy: null, claimedAt: null });
    return targets;
  }
  throw new Error('Could not create a fresh balanced house');
}

export type HuntCommand = { seq: number } & (
  { kind: 'move'; direction: Point; deltaMs: number } |
  { kind: 'search' | 'spot' | 'catch'; id: string; seenAt?: number } | { kind: 'hint' }
);
export interface GameRoomInfo {
  id: string; fatherName: string; createdAt: number; expiresAt: number; resultsExpireAt: number;
  status: 'open' | 'closed'; playerCount: number; capacity: number; targetCount: number;
}
export interface PlayerStanding {
  id: string; name: string; bestScore: number; currentScore: number; rank: number; playing: boolean;
}
export interface CatchEvent { id: number; playerId: string; attemptId: string; text: string; at: number }
export interface RoomView {
  room: GameRoomInfo; me: { id: string; name: string } | null; father: CharacterPack | null;
  reusableFather: CharacterPack | null;
  standings: PlayerStanding[]; events: CatchEvent[]; cursor: number; revision: number; serverNow: number;
  attempt: { id: string; snapshot: HuntSnapshot; ack: number } | null;
}
export interface CommandResponse { view: RoomView; results: { seq: number; result: ActionResult }[] }
export interface ControlledAttempt { view: RoomView; controller: string }
