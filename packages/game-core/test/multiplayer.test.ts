import test from 'node:test';
import assert from 'node:assert/strict';
import { balancedTargets, placementMix, placeTargets, targetSignature, LocalHuntSession, ROUND_MS, HOUSE, type HuntCheckpoint } from '../src/index.ts';

test('balanced retries retain cast size and exposure mix, cover every room, and reshuffle', () => {
  for (let i = 0; i < 500; i++) {
    const template = placeTargets(`room-${i}`), mix = placementMix(template);
    const first = balancedTargets(`a-${i}`, mix), next = balancedTargets(`b-${i}`, mix, targetSignature(first));
    assert.equal(first.length, template.length); assert.deepEqual(placementMix(next), mix);
    assert.notEqual(targetSignature(first), targetSignature(next));
    const slots = next.filter(t => t.kind === 'hidden').map(t => HOUSE.slots.find(s => s.id === t.slotId)!);
    assert.equal(new Set(slots.map(s => s.roomId)).size, 5);
    assert.ok(slots.some(s => s.kind === 'statue')); assert.equal(next.filter(t => t.kind === 'broom').length, 1);
    assert.deepEqual(first, balancedTargets(`a-${i}`, mix));
  }
});

test('saved attempts preserve deadlines and hint cooldown across restore', () => {
  let now = 10_000;
  const session = new LocalHuntSession('Alan', 'recover', () => now, true, undefined, { id: 'attempt', playerId: 'alan', expiresAt: 90_000 });
  now += 21_000; assert.ok(session.hint().ok);
  const saved = JSON.parse(JSON.stringify(session.checkpoint())) as HuntCheckpoint;
  const restored = LocalHuntSession.restore(saved, () => now);
  assert.equal(restored.hint().ok, false); assert.equal(restored.getSnapshot().id, 'attempt');
  assert.equal(restored.getSnapshot().player.id, 'alan'); assert.equal(restored.getSnapshot().endsAt, 10_000 + ROUND_MS);
  now = 90_000; restored.tick(); assert.equal(restored.getSnapshot().finishReason, 'expired');
  assert.equal(session.getSnapshot().status, 'playing', 'Restore owns an independent snapshot');
});
