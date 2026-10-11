import test from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE, HINT_MS, LocalHuntSession, ROUND_MS, canReach, clearPath, distance, findPath, isWalkable, placeTargets, peekProgress, freshHuntSeed, createFatherProfile, BALAJI, broomPosition, isDadExposed } from '../src/index.ts';
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
      if (d < .1) break;
      session.move({ x: (waypoint.x - p.x) / d, y: (waypoint.y - p.y) / d }, Math.min(16, d / 210 * 1000));
    }
    assert.ok(distance(session.getSnapshot().player.position, waypoint) < .2, 'Must physically traverse every path segment');
  }
}
function seedWith(slotId: string) {
  for (let i = 0; i < 1000; i++) if (placeTargets(`fixture-${i}`).some(t => t.kind === 'hidden' && t.slotId === slotId)) return `fixture-${i}`;
  throw new Error(`No seed for ${slotId}`);
}
function targetAt(session: LocalHuntSession, slotId: string) { return session.getSnapshot().targets.find(t => t.kind === 'hidden' && t.slotId === slotId)!; }

test('seeded hunts have 12–20 targets, one broom, distinct slots, every room, and the spotlight statue', () => {
  const used = new Set<string>(), counts = new Set<number>(); let commodeAbsent = false;
  for (let i = 0; i < 500; i++) {
    const targets = placeTargets(`round-${i}`), hidden = targets.filter(t => t.kind === 'hidden');
    const slots = hidden.map(t => HOUSE.slots.find(s => s.id === t.slotId)!);
    assert.ok(targets.length >= 12 && targets.length <= 20); counts.add(targets.length);
    assert.equal(targets.filter(t => t.kind === 'broom').length, 1);
    assert.equal(new Set(hidden.map(t => t.slotId)).size, targets.length - 1);
    assert.equal(new Set(targets.map(t => t.id)).size, targets.length);
    assert.equal(new Set(slots.map(s => s.roomId)).size, 5);
    assert.ok(slots.some(s => s.kind === 'statue'));
    for (const slot of slots) used.add(slot.id);
    commodeAbsent ||= !slots.some(t => t.kind === 'toilet');
  }
  assert.equal(used.size, 20); assert.equal(counts.size, 9); assert.ok(commodeAbsent);
  assert.deepEqual(placeTargets('same'), placeTargets('same'));
  const signature = (seed: string) => placeTargets(seed).filter(t => t.kind === 'hidden').map(t => t.slotId).sort();
  assert.notDeepEqual(signature('same'), signature(freshHuntSeed('same', 'same')));
});

test('names and independent expression metadata stay personal across all five intro scenes and scoring', () => {
  let now = 100_000;
  const father = createFatherProfile('  Suresh   Kumar  ', { ...BALAJI, id: 'custom', atlas: '/generated/dad.png' });
  const session = new LocalHuntSession('Vinayak', seedWith('bathroom-toilet'), () => now, true, father);
  father.name = 'Changed elsewhere'; father.expressions.bonked = 99;
  const state = session.getSnapshot();
  assert.equal(state.father.name, 'Suresh Kumar'); assert.equal(state.father.atlas, '/generated/dad.png');
  assert.equal(state.father.expressions.bonked, BALAJI.expressions.bonked);
  assert.ok(state.case.story.includes('Suresh Kumar') && state.case.story.includes('Vinayak'));
  assert.equal(JSON.stringify(state.case).includes('Balaji'), false);
  assert.equal(state.case.beats.length, 5); assert.doesNotMatch(JSON.stringify(state.case), /six|20 copies|12 copies/i);
  const slot = HOUSE.slots.find(s => s.id === 'bathroom-toilet')!;
  walkTo(session, slot.anchor); session.search(slot.id); now += 1000; session.tick(); session.catch(targetAt(session, slot.id).id);
  assert.equal(session.getSnapshot().activity[0].text, 'Vinayak found Suresh Kumar inside the commode.');
  assert.equal(createFatherProfile('   ').name, 'Balaji'); assert.equal(createFatherProfile('x'.repeat(100)).name.length, 32);
});

test('all twenty-nine hideouts and every pair of return routes are reachable without clipping walls', () => {
  assert.equal(HOUSE.slots.length, 29); const { session } = fixture();
  for (const from of HOUSE.slots) for (const to of HOUSE.slots) {
    if (from === to) continue;
    assert.ok(isWalkable(from.anchor), from.id); walkTo(session, from.anchor); walkTo(session, to.anchor);
    assert.ok(canReach(session.getSnapshot().player.position, to), `${from.id} -> ${to.id}`);
  }
});

test('the serious portrait, feet and spotlight statue are immediately catchable; glass containers need opening', () => {
  for (const kind of ['portrait', 'bed', 'statue', 'washer', 'microwave', 'wardrobe']) {
    const slot = HOUSE.slots.find(s => s.kind === kind)!, f = fixture(seedWith(slot.id));
    walkTo(f.session, slot.anchor);
    assert.equal(isDadExposed(f.session.getSnapshot(), slot, 100000), ['portrait', 'bed', 'statue'].includes(kind));
    if (slot.mode === 'search') { assert.equal(f.session.catch(targetAt(f.session, slot.id).id).ok, false); f.session.search(slot.id); f.advance(1000); f.session.tick(); }
    assert.equal(f.session.catch(targetAt(f.session, slot.id).id).ok, true, slot.id);
  }
});

test('commode must open; revealing gives no point; target IDs claim exactly once', () => {
  const f = fixture(), slot = HOUSE.slots.find(s => s.id === 'bathroom-toilet')!, id = targetAt(f.session, slot.id).id;
  walkTo(f.session, slot.anchor); assert.equal(f.session.catch(id).ok, false); assert.equal(f.session.search(slot.id).ok, true);
  f.advance(999); f.session.tick(); assert.equal(f.session.getSnapshot().opened.includes(slot.id), false);
  f.advance(1); f.session.tick(); assert.equal(f.session.getSnapshot().player.score, 0);
  assert.equal(f.session.catch(slot.id).ok, false, 'Slot IDs cannot claim a target');
  assert.equal(f.session.catch(id).ok, true); assert.equal(f.session.catch(id).ok, false); assert.equal(f.session.getSnapshot().player.score, 1);
});

test('no catching from another room, and no reaching through furniture', () => {
  const { session } = fixture(), slot = HOUSE.slots.find(s => s.id === 'living-cushion')!;
  assert.equal(session.catch(targetAt(session, 'bathroom-toilet').id).ok, false);
  assert.equal(canReach({ x: slot.prop.x + slot.prop.w / 2, y: slot.prop.y - 20 }, slot), false);
});

test('walking away cancels a search; parallel searches cannot bypass duration; empty props give no score', () => {
  const f = fixture(), slot = HOUSE.slots.find(s => s.id === 'bathroom-toilet')!;
  walkTo(f.session, slot.anchor); assert.equal(f.session.search(slot.id).ok, true); assert.equal(f.session.search(slot.id).ok, false);
  walkTo(f.session, HOUSE.spawn); f.advance(1001); f.session.tick(); assert.equal(f.session.getSnapshot().opened.includes(slot.id), false);
  const empty = HOUSE.slots.find(s => !targetAt(f.session, s.id))!;
  walkTo(f.session, empty.anchor); f.session.search(empty.id); f.advance(1000); f.session.tick();
  assert.equal(f.session.getSnapshot().activity[0].text, 'Checked. Empty.'); assert.equal(f.session.getSnapshot().player.score, 0);
});

test('two minutes is exact, with catches rejected at the boundary without a timer callback', () => {
  assert.equal(ROUND_MS, 120000);
  const f = fixture(), slot = HOUSE.slots.find(s => s.kind === 'statue')!, id = targetAt(f.session, slot.id).id;
  walkTo(f.session, slot.anchor); f.setTime(f.session.getSnapshot().endsAt - 1); assert.equal(f.session.spot(id).ok, true);
  f.setTime(f.session.getSnapshot().endsAt); assert.equal(f.session.catch(id).ok, false);
  assert.equal(f.session.getSnapshot().finishReason, 'timeout'); assert.equal(f.session.getSnapshot().player.score, 0);
});

test('background recovery honours wall time and one-hour hard expiry', () => {
  const f = fixture(); f.advance(ROUND_MS + 1); f.session.tick(); assert.equal(f.session.getSnapshot().finishReason, 'timeout');
  const expired = fixture(); expired.setTime(expired.session.getSnapshot().expiresAt); expired.session.tick();
  assert.equal(expired.session.getSnapshot().status, 'expired'); assert.equal(expired.session.search('bathroom-toilet').ok, false);
});

test('bagging the entire randomized cast ends early and permanently closes scoring', () => {
  const f = fixture(), count = f.session.getSnapshot().targets.length;
  const broom = f.session.getSnapshot().targets.find(t => t.kind === 'broom')!;
  walkTo(f.session, broomPosition(broom, 0));
  assert.equal(f.session.spot(broom.id).ok, true); assert.equal(f.session.catch(broom.id).ok, true);
  for (const target of f.session.getSnapshot().targets.filter(t => t.kind === 'hidden')) {
    const slot = HOUSE.slots.find(s => s.id === target.slotId)!;
    walkTo(f.session, slot.anchor); f.session.search(slot.id); f.advance(1000); f.session.tick();
    assert.equal(f.session.catch(target.id).ok, true, slot.id);
  }
  assert.equal(f.session.getSnapshot().player.score, count); assert.equal(f.session.getSnapshot().finishReason, 'complete');
  assert.equal(f.session.catch(broom.id).ok, false);
});

test('hints unlock after twenty seconds, name only a room, and have a cooldown', () => {
  assert.equal(HINT_MS, 20000); const f = fixture(); assert.equal(f.session.hint().ok, false);
  f.advance(HINT_MS); const hint = f.session.hint(); assert.equal(hint.ok, true);
  assert.ok(HOUSE.rooms.some(r => hint.message.includes(r.name.toLowerCase()))); assert.equal(f.session.hint().ok, false);
});

test('large frame delays, NaN and diagonal movement cannot teleport through walls', () => {
  const { session } = fixture(), before = session.getSnapshot().player.position;
  session.move({ x: 1, y: 1 }, 10_000); assert.ok(distance(before, session.getSnapshot().player.position) <= 8.40001);
  const valid = session.getSnapshot().player.position; session.move({ x: NaN, y: 1 }, 16); assert.deepEqual(session.getSnapshot().player.position, valid);
  for (let i = 0; i < 1500; i++) session.move({ x: -1, y: 0 }, 16);
  assert.ok(isWalkable(session.getSnapshot().player.position));
});

test('loading and intro consume no time; start cannot reset a running deadline', () => {
  let now = 1000; const session = new LocalHuntSession('Alan', 'loading', () => now, false);
  now += 90_000; session.tick(); assert.equal(session.getSnapshot().status, 'ready');
  session.start(); assert.equal(session.getSnapshot().endsAt - now, 120000);
  const endsAt = session.getSnapshot().endsAt; now += 9000; session.start(); assert.equal(session.getSnapshot().endsAt, endsAt);
});

test('hidden peeks reject blind clicks; a spotted laugh survives ducking during approach', () => {
  const f = fixture(), slot = HOUSE.slots.find(s => s.mode === 'peek' && targetAt(f.session, s.id))!, target = targetAt(f.session, slot.id);
  walkTo(f.session, slot.anchor); const start = f.session.getSnapshot().startedAt;
  const phase = (visible: boolean) => { for (let ms = 0; ms < 10000; ms += 50) if ((peekProgress(f.session.getSnapshot().seed, slot, ms) >= .2) === visible) return start + ms; throw new Error('Missing phase'); };
  f.setTime(phase(false)); assert.equal(f.session.spot(target.id).ok, false); assert.equal(f.session.catch(target.id).ok, false);
  f.setTime(phase(true)); assert.equal(f.session.spot(target.id).ok, true);
  f.setTime(phase(false)); assert.equal(f.session.catch(target.id).ok, true);
});

test('spotting cannot see other rooms or nonexistent targets, and a remembered target cannot score after expiry', () => {
  const f = fixture(), slot = HOUSE.slots.find(s => s.kind === 'statue')!, id = targetAt(f.session, slot.id).id;
  assert.equal(f.session.spot(id).ok, false); assert.equal(f.session.spot('ghost-dad').ok, false);
  walkTo(f.session, slot.anchor); assert.equal(f.session.spot(id).ok, true);
  f.setTime(f.session.getSnapshot().endsAt); assert.equal(f.session.catch(id).ok, false);
});

test('a visible peek survives mobile delivery latency but old observations cannot reveal a hidden father', () => {
  const slot = HOUSE.slots.find(s => s.mode === 'peek' && !s.id.includes('-decor-'))!, f = fixture(seedWith(slot.id));
  walkTo(f.session, slot.anchor);
  const state = f.session.getSnapshot(), target = targetAt(f.session, slot.id);
  let seen = -1;
  for (let ms = 0; ms < 20000; ms += 20) {
    if (peekProgress(state.seed, slot, ms) >= .2 && peekProgress(state.seed, slot, ms + 800) < .2 && peekProgress(state.seed, slot, ms + 1200) < .2 && peekProgress(state.seed, slot, ms + 2200) < .2) { seen = state.startedAt + ms; break; }
  }
  assert.ok(seen >= 0);
  f.setTime(seen + 2200);
  assert.equal(f.session.spot(target.id, seen).ok, false, 'A stale observation is clamped to the recent visibility window');
  f.setTime(seen + 800);
  assert.equal(f.session.spot(target.id, seen).ok, true, 'An 800 ms mobile delivery can preserve a face that was visible when tapped');
  f.setTime(state.endsAt);
  assert.equal(f.session.catch(target.id).ok, false, 'Visibility grace never extends the scoring deadline');
});

test('broom follows doorways at 160px/s with 6–10 second rests and no wall crossings', () => {
  for (let seed = 0; seed < 10; seed++) {
    const broom = placeTargets(`broom-${seed}`).find(t => t.kind === 'broom')!;
    let previous = 0;
    for (const leg of broom.route) {
      assert.ok(clearPath(leg.from, leg.to), JSON.stringify(leg));
      assert.ok(Math.abs(distance(leg.from, leg.to) / (leg.arriveAt - leg.departAt) * 1000 - 160) < .001);
      const rest = leg.departAt - previous;
      if (rest > .1) assert.ok(rest >= 6000 && rest <= 10000);
      previous = leg.arriveAt;
    }
    for (let t = 0; t < ROUND_MS; t += 211) assert.ok(isWalkable(broomPosition(broom, t)), `broom at ${t}`);
  }
});

test('one tap locks the broom at its exact position; approach and duplicate taps cannot move it or double score', () => {
  const f = fixture(), broom = f.session.getSnapshot().targets.find(t => t.kind === 'broom')!;
  f.advance(13000); f.session.tick();
  const position = broomPosition(broom, 13000); walkTo(f.session, position);
  assert.equal(f.session.spot(broom.id).ok, true);
  f.advance(25000); f.session.tick(); const locked = f.session.getSnapshot().targets.find(t => t.kind === 'broom')!;
  assert.deepEqual(broomPosition(locked, 38000), position); assert.equal(f.session.spot(broom.id).ok, true);
  assert.equal(f.session.catch(broom.id).ok, true); assert.equal(f.session.catch(broom.id).ok, false);
  assert.equal(f.session.getSnapshot().player.score, 1);
});

test('a broom catch cannot reach through a wall or bypass the deadline', () => {
  const f = fixture(), broom = f.session.getSnapshot().targets.find(t => t.kind === 'broom')!;
  assert.equal(f.session.catch(broom.id).ok, false, 'Spot the rider first');
  f.session.spot(broom.id); walkTo(f.session, HOUSE.slots[0].anchor); assert.equal(f.session.catch(broom.id).ok, false);
  walkTo(f.session, HOUSE.spawn); f.setTime(f.session.getSnapshot().endsAt); assert.equal(f.session.catch(broom.id).ok, false);
});
