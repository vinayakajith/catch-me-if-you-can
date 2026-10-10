import test from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE, HINT_MS, LocalHuntSession, ROUND_MS, canReach, clearPath, distance, findPath, isWalkable, placeTargets } from '../src/index.ts';
import type { Point } from '../src/types.ts';

function fixture(seed = 'test-house') {
  let now = 100_000;
  return { session: new LocalHuntSession('Alan', seed, () => now), advance(ms: number) { now += ms; }, setTime(value: number) { now = value; } };
}

function walkTo(session: LocalHuntSession, destination: Point) {
  const path = findPath(session.getSnapshot().player.position, destination);
  assert.ok(path.length, `No path to ${JSON.stringify(destination)}`);
  for (const waypoint of path) {
    for (let i = 0; i < 1200; i++) {
      const p = session.getSnapshot().player.position, d = distance(p, waypoint);
      if (d < 1) break;
      session.move({ x: (waypoint.x - p.x) / d, y: (waypoint.y - p.y) / d }, Math.min(16, d / 210 * 1000));
    }
    assert.ok(distance(session.getSnapshot().player.position, waypoint) < 2, 'Movement must actually traverse each path segment');
  }
}

test('seeds generate exactly twelve unique targets, seven peekers, five searches, and two per room', () => {
  for (let i = 0; i < 100; i++) {
    const targets = placeTargets(`round-${i}`), slots = targets.map(t => HOUSE.slots.find(s => s.id === t.slotId)!);
    assert.equal(targets.length, 12); assert.equal(new Set(targets.map(t => t.slotId)).size, 12);
    assert.equal(slots.filter(s => s.mode === 'peek').length, 7); assert.equal(slots.filter(s => s.mode === 'search').length, 5);
    for (const room of HOUSE.rooms.filter(r => r.id !== 'hall')) assert.ok(slots.filter(s => s.roomId === room.id).length >= 2);
    assert.ok(targets.some(t => t.slotId === 'bathroom-toilet'));
  }
  assert.deepEqual(placeTargets('same'), placeTargets('same'));
  assert.notDeepEqual(placeTargets('same'), placeTargets('different'));
});

test('all thirty hiding slots are reachable through physical doorways, with clear interaction positions', () => {
  assert.equal(HOUSE.slots.length, 30);
  const { session } = fixture();
  for (const slot of HOUSE.slots) {
    assert.ok(isWalkable(slot.anchor), slot.id);
    walkTo(session, slot.anchor);
    assert.ok(canReach(session.getSnapshot().player.position, slot), slot.id);
  }
});

test('navigation never takes a diagonal shortcut through a wall or prop', () => {
  const anchors = HOUSE.slots.map(s => s.anchor);
  for (let i = 0; i < anchors.length - 1; i++) {
    let from = anchors[i];
    for (const next of findPath(from, anchors[i + 1])) { assert.ok(clearPath(from, next)); from = next; }
  }
});

test('commode lid must be opened before Balaji can be caught; revealing alone gives no point', () => {
  const f = fixture(), slot = HOUSE.slots.find(s => s.id === 'bathroom-toilet')!;
  walkTo(f.session, slot.anchor);
  assert.equal(f.session.catch(slot.id).ok, false);
  assert.equal(f.session.search(slot.id).ok, true);
  f.advance(999); f.session.tick(); assert.equal(f.session.getSnapshot().opened.includes(slot.id), false);
  f.advance(1); f.session.tick(); assert.equal(f.session.getSnapshot().opened.includes(slot.id), true);
  assert.match(f.session.getSnapshot().activity[0].text, /WHY IS HE IN THERE/);
  assert.equal(f.session.getSnapshot().player.score, 0);
  assert.equal(f.session.catch(slot.id).message, 'OCCUPIED MEANS OCCUPIED!');
  assert.equal(f.session.getSnapshot().player.score, 1);
  assert.equal(f.session.catch(slot.id).ok, false); assert.equal(f.session.getSnapshot().player.score, 1);
});

test('a father cannot be caught from another room or through his furniture', () => {
  const { session } = fixture(), slot = HOUSE.slots.find(s => s.id === 'living-papers')!;
  assert.equal(session.catch('bathroom-toilet').ok, false);
  assert.equal(canReach({ x: slot.prop.x + slot.prop.w / 2, y: slot.prop.y - 20 }, slot), false);
});

test('walking away cancels a pending search, and parallel searches cannot bypass its duration', () => {
  const f = fixture(), slot = HOUSE.slots.find(s => s.id === 'bathroom-toilet')!;
  walkTo(f.session, slot.anchor); assert.equal(f.session.search(slot.id).ok, true);
  assert.equal(f.session.search(slot.id).ok, false);
  walkTo(f.session, HOUSE.spawn); f.advance(1001); f.session.tick();
  assert.equal(f.session.getSnapshot().opened.includes(slot.id), false); assert.equal(f.session.getSnapshot().search, null);
});

test('empty searches yield jokes and never award a point', () => {
  const f = fixture();
  const empty = HOUSE.slots.find(s => !f.session.getSnapshot().targets.some(t => t.slotId === s.id))!;
  walkTo(f.session, empty.anchor); f.session.search(empty.id); f.advance(1000); f.session.tick();
  assert.equal(f.session.getSnapshot().activity[0].text, empty.empty); assert.equal(f.session.getSnapshot().player.score, 0);
  assert.equal(f.session.catch(empty.id).ok, false);
});

test('the deadline rejects catches immediately, even without a timer callback', () => {
  const f = fixture(), target = f.session.getSnapshot().targets.find(t => HOUSE.slots.find(s => s.id === t.slotId)!.mode === 'peek')!;
  walkTo(f.session, HOUSE.slots.find(s => s.id === target.slotId)!.anchor);
  f.setTime(f.session.getSnapshot().endsAt);
  assert.equal(f.session.catch(target.slotId).ok, false);
  assert.equal(f.session.getSnapshot().status, 'finished'); assert.equal(f.session.getSnapshot().finishReason, 'timeout');
  assert.equal(f.session.getSnapshot().player.score, 0);
});

test('returning from a background tab honours elapsed time and the one-hour hard expiry', () => {
  const f = fixture(); f.advance(ROUND_MS + 1); f.session.tick();
  assert.equal(f.session.getSnapshot().finishReason, 'timeout');
  const expired = fixture(); expired.setTime(expired.session.getSnapshot().expiresAt); expired.session.tick();
  assert.equal(expired.session.getSnapshot().status, 'expired'); assert.equal(expired.session.search('bathroom-toilet').ok, false);
});

test('finding all twelve ends the game and prevents further scoring', () => {
  const f = fixture();
  for (const target of f.session.getSnapshot().targets) {
    const slot = HOUSE.slots.find(s => s.id === target.slotId)!;
    walkTo(f.session, slot.anchor);
    if (slot.mode === 'search') { assert.equal(f.session.search(slot.id).ok, true); f.advance(1000); f.session.tick(); }
    assert.equal(f.session.catch(slot.id).ok, true, slot.id);
  }
  assert.equal(f.session.getSnapshot().player.score, 12); assert.equal(f.session.getSnapshot().finishReason, 'complete');
  assert.equal(f.session.catch(f.session.getSnapshot().targets[0].slotId).ok, false);
});

test('hints name only a room and have a one-minute cooldown', () => {
  const f = fixture(); assert.equal(f.session.hint().ok, false);
  f.advance(HINT_MS); const hint = f.session.hint(); assert.equal(hint.ok, true);
  assert.ok(HOUSE.rooms.some(r => hint.message.includes(r.name.toLowerCase())));
  assert.equal(f.session.hint().ok, false);
});

test('large frame delays, diagonal input, NaN, and wall movement cannot teleport the hunter', () => {
  const { session } = fixture(); const before = session.getSnapshot().player.position;
  session.move({ x: 1, y: 1 }, 10_000);
  assert.ok(distance(before, session.getSnapshot().player.position) <= 8.40001);
  const valid = session.getSnapshot().player.position;
  session.move({ x: NaN, y: 1 }, 16); assert.deepEqual(session.getSnapshot().player.position, valid);
  for (let i = 0; i < 1500; i++) session.move({ x: -1, y: 0 }, 16);
  assert.ok(isWalkable(session.getSnapshot().player.position)); assert.ok(session.getSnapshot().player.position.x >= 62);
});

test('loading assets does not use up play time, and starting twice cannot reset the timer', () => {
  let now = 1000; const session = new LocalHuntSession('Alan', 'loading', () => now, false);
  now += 90_000; session.tick(); assert.equal(session.getSnapshot().status, 'ready');
  session.start(); assert.equal(session.getSnapshot().endsAt - now, ROUND_MS);
  const endsAt = session.getSnapshot().endsAt; now += 9000; session.start(); assert.equal(session.getSnapshot().endsAt, endsAt);
});

test('snapshots are stable between updates and subscriptions can be released', () => {
  const f = fixture(); assert.equal(f.session.getSnapshot(), f.session.getSnapshot());
  let updates = 0; const unsubscribe = f.session.subscribe(() => updates++);
  f.advance(1001); f.session.tick(); assert.equal(updates, 1); unsubscribe();
  f.advance(1001); f.session.tick(); assert.equal(updates, 1);
  f.session.dispose();
});
