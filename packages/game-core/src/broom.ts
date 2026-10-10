import { distance } from './house.ts';
import { findPath } from './navigation.ts';
import { random, shuffled } from './random.ts';
import type { BroomLeg, BroomTarget, Point } from './types.ts';

export const BROOM_SPEED = 160;
export const BROOM_START: Point = { x: 920, y: 550 };
const stops: Point[] = [{ x: 594, y: 324 }, { x: 902, y: 350 }, { x: 269, y: 858 }, { x: 762, y: 861 }, { x: 1234, y: 862 }];
const paths = new Map<string, Point[]>();
function routeBetween(from: Point, to: Point): Point[] {
  const key = `${from.x},${from.y}:${to.x},${to.y}`;
  if (!paths.has(key)) paths.set(key, findPath(from, to));
  return paths.get(key)!;
}
// Absolute offsets from the round start, not frame-count movement. Both a later
// server and a throttled/background browser can evaluate exactly the same route.
export function createBroomRoute(seed: string, durationMs: number): BroomLeg[] {
  const rng = random(`${seed}:broom`), destinations = shuffled(stops, rng);
  const route: BroomLeg[] = [];
  let from = { ...BROOM_START }, elapsed = 0, next = 0;
  while (elapsed < durationMs) {
    elapsed += 6000 + Math.floor(rng() * 4001);
    const destination = destinations[next++ % destinations.length];
    for (const to of routeBetween(from, destination)) {
      const arriveAt = elapsed + distance(from, to) / BROOM_SPEED * 1000;
      route.push({ from: { ...from }, to: { ...to }, departAt: elapsed, arriveAt });
      from = to; elapsed = arriveAt;
    }
  }
  return route;
}
export function broomPosition(target: BroomTarget, elapsedMs: number): Point {
  if (target.lockedPosition) return { ...target.lockedPosition };
  let position: Point = target.route[0]?.from ?? BROOM_START;
  for (const leg of target.route) {
    if (elapsedMs <= leg.departAt) return { ...position };
    if (elapsedMs < leg.arriveAt) {
      const t = (elapsedMs - leg.departAt) / (leg.arriveAt - leg.departAt);
      return { x: leg.from.x + (leg.to.x - leg.from.x) * t, y: leg.from.y + (leg.to.y - leg.from.y) * t };
    }
    position = leg.to;
  }
  return { ...position };
}
