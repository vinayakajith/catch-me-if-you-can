import { HOUSE, distance, isWalkable } from './house.ts';
import type { Point } from './types.ts';

const CELL = 16;
const cols = Math.ceil(HOUSE.width / CELL);
const rows = Math.ceil(HOUSE.height / CELL);
let grid: Uint8Array | undefined;
const pointAt = (n: number): Point => ({ x: n % cols * CELL, y: Math.floor(n / cols) * CELL });
function cells(): Uint8Array {
  if (!grid) { grid = new Uint8Array(cols * rows); for (let n = 0; n < grid.length; n++) grid[n] = Number(isWalkable(pointAt(n))); }
  return grid;
}

export function clearPath(a: Point, b: Point): boolean {
  const steps = Math.max(1, Math.ceil(distance(a, b) / 6));
  for (let i = 0; i <= steps; i++) if (!isWalkable({ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps })) return false;
  return true;
}

function nearest(p: Point): number {
  const available = cells();
  const cx = Math.round(p.x / CELL), cy = Math.round(p.y / CELL);
  let best = -1, bestDistance = Infinity;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const x = cx + dx, y = cy + dy, n = y * cols + x;
    if (x < 0 || y < 0 || x >= cols || y >= rows || !available[n]) continue;
    const d = distance(p, pointAt(n));
    if (d < bestDistance && (!isWalkable(p) || clearPath(p, pointAt(n)))) { best = n; bestDistance = d; }
  }
  return best;
}

/** Routes through the same collision geometry used by movement. No teleporting. */
export function findPath(from: Point, to: Point): Point[] {
  if (clearPath(from, to)) return [to];
  const available = cells(), start = nearest(from), goal = nearest(to);
  if (start < 0 || goal < 0) return [];
  const previous = new Int32Array(available.length).fill(-1);
  const queue = new Int32Array(available.length);
  let head = 0, tail = 0;
  queue[tail++] = start; previous[start] = start;
  while (head < tail && previous[goal] < 0) {
    const n = queue[head++];
    const x = n % cols;
    for (const next of [x > 0 ? n - 1 : -1, x < cols - 1 ? n + 1 : -1, n - cols, n + cols]) {
      if (next < 0 || next >= available.length || !available[next] || previous[next] >= 0) continue;
      if (!clearPath(pointAt(n), pointAt(next))) continue;
      previous[next] = n; queue[tail++] = next;
    }
  }
  if (previous[goal] < 0) return [];
  const route: Point[] = [];
  for (let n = goal; n !== start; n = previous[n]) route.push(pointAt(n));
  route.push(pointAt(start)); route.reverse();
  if (isWalkable(to) && clearPath(route.at(-1)!, to)) route.push(to);
  const smooth: Point[] = [];
  let current = from, index = 0;
  while (index < route.length) {
    let farthest = index;
    while (farthest + 1 < route.length && clearPath(current, route[farthest + 1])) farthest++;
    smooth.push(route[farthest]); current = route[farthest]; index = farthest + 1;
  }
  return smooth;
}
