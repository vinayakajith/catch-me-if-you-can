import test from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE, HINT_MS, LocalHuntSession, ROUND_MS, canReach, clearPath, distance, findPath, isWalkable, placeTargets, peekProgress, freshHuntSeed, CASES, drawCase } from '../src/index.ts';
import type { Point } from '../src/types.ts';

function fixture(seed = seedWith('bathroom-toilet')) {
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

function seedWith(slotId: string) {
  for (let i = 0; i < 1000; i++) if (placeTargets(`fixture-${i}`).some(t => t.slotId === slotId)) return `fixture-${i}`;
  throw new Error(`No seed for ${slotId}`);
}

test('six unique dads: three searches, three peeks, at least four rooms, at most two per room', () => {
  const used = new Set<string>(); let commodeAbsent = false;
  for (let i = 0; i < 500; i++) {
    const targets = placeTargets(`round-${i}`), slots = targets.map(t => HOUSE.slots.find(s => s.id === t.slotId)!);
    assert.equal(targets.length, 6); assert.equal(new Set(targets.map(t => t.slotId)).size, 6);
    assert.equal(slots.filter(s => s.mode === 'peek').length, 3); assert.equal(slots.filter(s => s.mode === 'search').length, 3);
    assert.ok(new Set(slots.map(s => s.roomId)).size >= 4);
    for (const room of HOUSE.rooms) assert.ok(slots.filter(s => s.roomId === room.id).length <= 2);
    for (const slot of slots) used.add(slot.id);
    commodeAbsent ||= !targets.some(t => t.slotId === 'bathroom-toilet');
  }
  assert.equal(used.size, 20); assert.ok(commodeAbsent);
  assert.deepEqual(placeTargets('same'), placeTargets('same'));
  assert.notDeepEqual(placeTargets('same'), placeTargets('different'));
  const next = freshHuntSeed('same', 'same');
  assert.notDeepEqual(placeTargets('same').map(t => t.slotId).sort(), placeTargets(next).map(t => t.slotId).sort());
});

test('all eight case stories appear once before the deck resets, including after serialization', () => {
  let seen: string[] = [], picked: string[] = [];
  for (let i = 0; i < 8; i++) { const result = drawCase(JSON.parse(JSON.stringify(seen)), () => .42); seen = result.seen; picked.push(result.story.id); }
  assert.equal(new Set(picked).size, CASES.length);
  const next = drawCase(seen, () => 0); assert.equal(next.seen.length, 1);
  assert.equal(drawCase(['obsolete-case'], () => 0).story.id, CASES[0].id);
});

test('all twenty hiding slots are reachable through physical doorways, with clear interaction positions', () => {
  assert.equal(HOUSE.slots.length, 20);
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
  assert.equal(f.session.getSnapshot().activity[0].text, 'Balaji uncovered.');
  assert.equal(f.session.getSnapshot().player.score, 0);
  assert.equal(f.session.catch(slot.id).ok, true);
  assert.equal(f.session.getSnapshot().player.score, 1);
  assert.equal(f.session.catch(slot.id).ok, false); assert.equal(f.session.getSnapshot().player.score, 1);
});

test('a father cannot be caught from another room or through his furniture', () => {
  const { session } = fixture(), slot = HOUSE.slots.find(s => s.id === 'living-cushion')!;
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

test('empty searches stay factual and never award a point', () => {
  const f = fixture();
  const empty = HOUSE.slots.find(s => !f.session.getSnapshot().targets.some(t => t.slotId === s.id))!;
  walkTo(f.session, empty.anchor); f.session.search(empty.id); f.advance(1000); f.session.tick();
  assert.equal(f.session.getSnapshot().activity[0].text, 'Checked. Empty.'); assert.equal(f.session.getSnapshot().player.score, 0);
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

test('finding all six ends the game and prevents further scoring', () => {
  const f = fixture();
  for (const target of f.session.getSnapshot().targets) {
    const slot = HOUSE.slots.find(s => s.id === target.slotId)!;
    walkTo(f.session, slot.anchor);
    assert.equal(f.session.search(slot.id).ok, true); f.advance(1000); f.session.tick();
    assert.equal(f.session.catch(slot.id).ok, true, slot.id);
  }
  assert.equal(f.session.getSnapshot().player.score, 6); assert.equal(f.session.getSnapshot().finishReason, 'complete');
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

test('hidden peeks reject blind catches; a visible spot survives ducking during the approach', () => {
  const f = fixture();
  const slot = HOUSE.slots.find(s => s.mode === 'peek' && f.session.getSnapshot().targets.some(t => t.slotId === s.id))!;
  walkTo(f.session, slot.anchor);
  const start = f.session.getSnapshot().startedAt;
  const findPhase = (visible: boolean) => {
    for (let ms = 0; ms < 10_000; ms += 50) if ((peekProgress(f.session.getSnapshot().seed, slot, ms) >= .2) === visible) return start + ms;
    throw new Error('Missing peek phase');
  };
  f.setTime(findPhase(false)); assert.equal(f.session.spot(slot.id).ok, false); assert.equal(f.session.catch(slot.id).ok, false);
  f.setTime(findPhase(true)); assert.equal(f.session.spot(slot.id).ok, true); assert.ok(f.session.getSnapshot().spotted.includes(slot.id));
  f.setTime(findPhase(false)); assert.equal(f.session.catch(slot.id).ok, true); assert.equal(f.session.catch(slot.id).ok, false);
});

test('spotting cannot see other rooms and remembers no nonexistent dads', () => {
  const f = fixture();
  const target = f.session.getSnapshot().targets[0];
  assert.equal(f.session.spot(target.slotId).ok, false);
  const empty = HOUSE.slots.find(s => !f.session.getSnapshot().targets.some(t => t.slotId === s.id))!;
  walkTo(f.session, empty.anchor); f.session.search(empty.id); f.advance(1000); f.session.tick();
  assert.equal(f.session.spot(empty.id).ok, false); assert.deepEqual(f.session.getSnapshot().spotted, []);
});

test('a remembered peeker cannot award a point after the round expires during approach', () => {
  const f = fixture();
  const slot = HOUSE.slots.find(s => s.mode === 'peek' && f.session.getSnapshot().targets.some(t => t.slotId === s.id))!;
  walkTo(f.session, slot.anchor); f.session.search(slot.id); f.advance(1000); f.session.tick();
  assert.equal(f.session.spot(slot.id).ok, true);
  f.setTime(f.session.getSnapshot().expiresAt); assert.equal(f.session.catch(slot.id).ok, false); assert.equal(f.session.getSnapshot().player.score, 0);
});

test('peek schedules are deterministic, staggered, and inspect can uncover a hidden peeker', () => {
  const f = fixture(), peeks = HOUSE.slots.filter(s => s.mode === 'peek');
  const schedules = peeks.map(s => Array.from({ length: 60 }, (_, i) => peekProgress('clock', s, i * 100)).join(','));
  assert.equal(new Set(schedules).size, peeks.length);
  assert.equal(peekProgress('clock', peeks[0], 999), peekProgress('clock', peeks[0], 999));
  const slot = peeks.find(s => f.session.getSnapshot().targets.some(t => t.slotId === s.id))!;
  walkTo(f.session, slot.anchor); f.session.search(slot.id); f.advance(1000); f.session.tick();
  assert.equal(f.session.catch(slot.id).ok, true);
});
