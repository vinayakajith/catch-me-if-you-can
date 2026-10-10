import test from 'node:test';
import assert from 'node:assert/strict';
import { balancedTargets, placementMix, placeTargets, targetSignature, LocalHuntSession, ROUND_MS, HOUSE, isDadExposed, type HuntCheckpoint } from '../src/index.ts';

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

test('network spotting accepts a recently visible face, but never extends the attempt deadline', () => {
  let now = 10_000;
  const session = new LocalHuntSession('Alan', 'peek-latency', () => now);
  const checkpoint = session.checkpoint();
  const target = checkpoint.snapshot.targets.find(t => t.kind === 'hidden' && HOUSE.slots.find(s => s.id === t.slotId)!.mode === 'peek')!;
  assert.equal(target.kind, 'hidden'); if (target.kind !== 'hidden') return;
  const slot = HOUSE.slots.find(s => s.id === target.slotId)!;
  checkpoint.snapshot.player.position = slot.anchor; checkpoint.snapshot.player.roomId = slot.roomId;
  for (let elapsed = 100; elapsed < 15000; elapsed += 10) {
    now = checkpoint.snapshot.startedAt + elapsed;
    if (!isDadExposed(checkpoint.snapshot, slot, now) && isDadExposed(checkpoint.snapshot, slot, now - 100)) break;
  }
  const restored = LocalHuntSession.restore(checkpoint, () => now);
  assert.equal(restored.spot(target.id).ok, false);
  assert.equal(restored.spot(target.id, now - 100).ok, true);
  now = checkpoint.snapshot.endsAt;
  assert.equal(LocalHuntSession.restore(checkpoint, () => now).spot(target.id, now - 100).ok, false);
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
