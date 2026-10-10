import { random } from './random.ts';
import type { HidingSlot, HuntSnapshot } from './types.ts';

export function peekProgress(seed: string, slot: HidingSlot, elapsedMs: number): number {
  const { visibleMs, hiddenMs } = slot.peek, period = visibleMs + hiddenMs;
  const offset = Math.floor(random(`${seed}:peek:${slot.id}`)() * period);
  const phase = ((elapsedMs + offset) % period + period) % period;
  if (phase >= visibleMs) return 0;
  return Math.min(1, phase / 220, (visibleMs - phase) / 220);
}
export function isDadExposed(state: HuntSnapshot, slot: HidingSlot, now: number): boolean {
  const target = state.targets.find(t => t.kind === 'hidden' && t.slotId === slot.id);
  if (slot.mode === 'visible' || state.opened.includes(slot.id) || target && state.spotted.includes(target.id)) return true;
  return slot.mode === 'peek' && peekProgress(state.seed, slot, now - state.startedAt) >= .2;
}
