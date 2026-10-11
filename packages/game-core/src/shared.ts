import { HOUSE } from './house.ts';
import { LocalHuntSession, ROUND_MS } from './session.ts';
import { createBroomRoute } from './broom.ts';
import { random, shuffled } from './random.ts';
import { createTimeMachineCase } from './cases.ts';
import type { ActionResult, CharacterPack, HuntSnapshot, Point, Target } from './types.ts';
import type { CatchEvent, GameRoomInfo, HuntCommand } from './multiplayer.ts';

export const PLAYER_COLOURS = ['#8652c7', '#199c97', '#e88932', '#448cdb', '#cf5c9b'] as const;
export const COUNTDOWN_MS = 3000;
export interface SharedPlayer {
  id: string; name: string; colour: string; ready: boolean; connected: boolean; lastSeen: number;
  position: Point; roomId: HuntSnapshot['player']['roomId']; score: number; roundId: string | null;
  ack: number; revision: number; avatar?: string;
  search?: HuntSnapshot['search'];
}
export interface SharedPlayerRecord extends SharedPlayer {
  connectionId?: string; controller?: string; credit: number; creditAt: number;
  search: HuntSnapshot['search']; lastHintAt: number | null;
  receipts: { seq: number; result: ActionResult }[];
  controls?: string[];
}
export interface SharedRound {
  id: string; seed: string; startedAt: number; endsAt: number; finishedAt: number | null;
  targets: Target[]; opened: string[]; spotted: string[]; revision: number;
}
export interface SharedState {
  hostId: string; phase: 'lobby' | 'countdown' | 'playing' | 'results' | 'closed';
  round: SharedRound | null; events: CatchEvent[]; cursor: number;
  lastScores: { id: string; name: string; colour: string; score: number }[];
}
export interface SharedView {
  protocol: 2; room: GameRoomInfo; hostId: string; phase: SharedState['phase'];
  me: string | null; players: SharedPlayer[]; father: CharacterPack | null;
  round: SharedRound | null; events: CatchEvent[]; cursor: number; serverNow: number;
  lastScores: SharedState['lastScores']; revision: number;
}
export type SharedRequest = { requestId: string; kind: 'hello' | 'ping' | 'ready' | 'start' | 'rematch' | 'leave' | 'input'; ready?: boolean; roundId?: string; commands?: HuntCommand[] };
export type SharedMessage =
  | { type: 'state'; view: SharedView; requestId?: string; results?: { seq: number; result: ActionResult }[] }
  | { type: 'motion'; roundId: string; player: SharedPlayer; serverNow: number; requestId?: string }
  | { type: 'error'; message: string; requestId?: string; retryable: boolean };

export function sharedPlayer(id: string, name: string, index: number, now: number): SharedPlayerRecord {
  return { id, name, colour: PLAYER_COLOURS[index % 5], ready: false, connected: false, lastSeen: now,
    position: { ...HOUSE.spawn }, roomId: 'hall', score: 0, roundId: null, ack: 0, revision: 0,
    credit: 0, creditAt: now, search: null, lastHintAt: null, receipts: [] };
}
export function createSharedRound(id: string, seed: string, now: number, previous = ''): SharedRound {
  const rng = random(seed), statue = HOUSE.slots.find(s => s.kind === 'statue')!;
  let selected = [statue];
  for (let attempt = 0; attempt < 100; attempt++) {
    selected = [statue];
    for (const room of HOUSE.rooms.filter(r => r.id !== 'hall')) {
      selected.push(...shuffled(HOUSE.slots.filter(s => s.roomId === room.id && s !== statue), rng).slice(0, room.id === 'living' ? 2 : 3));
    }
    selected.push(...shuffled(HOUSE.slots.filter(s => !selected.includes(s)), rng).slice(0, 19 - selected.length));
    if (selected.map(s => s.id).sort().join('|') !== previous) break;
  }
  const targets: Target[] = selected.map((s, i) => ({ kind: 'hidden', id: 'dad-' + (i + 1), slotId: s.id, claimedBy: null, claimedAt: null }));
  targets.push({ kind: 'broom', id: 'broom-dad', route: createBroomRoute(seed, ROUND_MS), lockedPosition: null, claimedBy: null, claimedAt: null });
  return { id, seed, startedAt: now + COUNTDOWN_MS, endsAt: now + COUNTDOWN_MS + ROUND_MS, finishedAt: null, targets, opened: [], spotted: [], revision: 1 };
}
export function sharedSnapshot(round: SharedRound, player: SharedPlayer, father: CharacterPack, expiresAt: number, now: number, search: HuntSnapshot['search'] = null): HuntSnapshot {
  const ended = now >= expiresAt || now >= round.endsAt || round.targets.every(t => t.claimedBy);
  return { id: round.id, seed: round.seed, father, case: createTimeMachineCase(father.name, player.name),
    status: now >= expiresAt ? 'expired' : ended ? 'finished' : now < round.startedAt ? 'ready' : 'playing',
    finishReason: now >= expiresAt ? 'expired' : round.targets.every(t => t.claimedBy) ? 'complete' : ended ? 'timeout' : null,
    startedAt: round.startedAt, endsAt: round.endsAt, expiresAt, now, lastCatchAt: Math.max(round.startedAt, ...round.targets.filter(t => t.claimedBy === player.id).map(t => t.claimedAt ?? 0)),
    player: { id: player.id, name: player.name, position: { ...player.position }, roomId: player.roomId, score: player.score },
    targets: round.targets, opened: round.opened, spotted: round.spotted, search, activity: [] };
}
export function sharedSession(round: SharedRound, player: SharedPlayerRecord, father: CharacterPack, expiresAt: number, now: number) {
  return LocalHuntSession.restore({ snapshot: sharedSnapshot(round, player, father, expiresAt, now, player.search), lastHintAt: player.lastHintAt }, () => now);
}
