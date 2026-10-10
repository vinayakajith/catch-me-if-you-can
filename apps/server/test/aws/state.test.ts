import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './fixture.ts';
import { DynamoRoomStore } from '../../src/aws/room-store.ts';
import { DynamoBudget, DynamoRateLimiter } from '../../src/aws/limits.ts';
import { Rooms } from '../../src/rooms.ts';
import { HOUSE, EXPIRY_MS, RESULTS_MS, ROUND_MS, findPath, distance, type RoomView, type HuntCommand } from '../../../../packages/game-core/src/index.ts';

test('DynamoDB holds five independent hunts across concurrent writers and restarts', async () => {
  const f = await fixture();
  try {
    const services = [0, 1].map(() => new Rooms(new DynamoRoomStore(f.db, f.clock), f.assets, f.jobs(), f.clock));
    const host = 'owner0', key = randomUUID(), data = { name: 'Alan', fatherName: 'Suresh', characterId: 'sample-balaji' };
    const rooms = await Promise.all(services.map(s => s.create(host, data, key)));
    assert.equal(rooms[0].room.id, rooms[1].room.id); const id = rooms[0].room.id;
    const joins = await Promise.allSettled(Array.from({ length: 7 }, (_, i) => services[i % 2].join(id, `owner${i + 1}`, `Player ${i + 1}`)));
    assert.equal(joins.filter(j => j.status === 'fulfilled').length, 4);
    assert.ok(joins.filter(j => j.status === 'rejected').every(j => j.reason.status === 409));
    const owners = [host, ...joins.flatMap((j, i) => j.status === 'fulfilled' ? [`owner${i + 1}`] : [])];
    const clients = await Promise.all(owners.map(async (owner, i) => {
      const control = randomUUID(), service = services[i % 2];
      const start = await service.start(id, owner, randomUUID(), control);
      return { owner, service, control, seq: 0, view: start.view };
    }));
    const metaVersion = (await f.db.get(`ROOM#${id}`))!.version;
    f.advance(100);
    await Promise.all(clients.map(async c => { const r = await c.service.commands(id, c.owner, c.view.attempt!.id, c.control, [{ seq: ++c.seq, kind: 'move', direction: { x: 0, y: -1 }, deltaMs: 40 }]); c.view = r.view; }));
    assert.equal((await f.db.get(`ROOM#${id}`))!.version, metaVersion, 'Movement must not rewrite shared metadata');
    const slot = HOUSE.slots.find(s => s.kind === 'statue')!;
    const paths = clients.map(c => findPath(c.view.attempt!.snapshot.player.position, slot.anchor));
    for (let step = 0; paths.some(p => p.length) && step < 200; step++) {
      f.advance(40);
      await Promise.all(clients.map(async (c, index) => {
        const path = paths[index]; if (!path.length) return;
        const p = c.view.attempt!.snapshot.player.position, target = path[0], d = distance(p, target);
        if (d < .1) { path.shift(); return; }
        const r = await c.service.commands(id, c.owner, c.view.attempt!.id, c.control, [{ seq: ++c.seq, kind: 'move', direction: { x: (target.x - p.x) / d, y: (target.y - p.y) / d }, deltaMs: Math.min(40, d / 210 * 1000) }]); c.view = r.view;
      }));
    }
    assert.ok(paths.every(p => !p.length), 'All five arrive at the statue');
    const catches = await Promise.all(clients.map(c => {
      const target = c.view.attempt!.snapshot.targets.find(t => t.kind === 'hidden' && t.slotId === slot.id)!;
      return c.service.commands(id, c.owner, c.view.attempt!.id, c.control, [{ seq: ++c.seq, kind: 'catch', id: target.id }]);
    }));
    assert.ok(catches.every(r => r.results[0].result.ok));
    const restarted = new Rooms(new DynamoRoomStore(f.db, f.clock), f.assets, f.jobs(), f.clock);
    const view = await restarted.view(id, host); assert.deepEqual(view.standings.map(p => p.bestScore), [1, 1, 1, 1, 1]); assert.equal(view.cursor, 5);
    const duplicate = await restarted.commands(id, host, clients[0].view.attempt!.id, clients[0].control, [{ seq: clients[0].seq, kind: 'catch', id: 'ignored-receipt-replay' }]);
    assert.equal(duplicate.view.cursor, 5); assert.equal(duplicate.results[0].result.ok, true);
    f.advance(ROUND_MS);
    await restarted.start(id, host, randomUUID(), clients[0].control);
    assert.equal((await restarted.view(id, host)).standings[0].bestScore, 1);
    f.advance(EXPIRY_MS); await restarted.cleanup();
    const closed = await restarted.view(id, host); assert.equal(closed.room.status, 'closed'); assert.equal(closed.attempt, null);
    const children = await Promise.all(clients.map(c => restarted.create(c.owner, { name: c.owner, fatherName: 'Suresh', sourceRoomId: id }, randomUUID())));
    assert.equal(new Set(children.map(c => c.room.id)).size, 5);
    assert.ok(children.every(c => c.room.expiresAt === f.clock() + EXPIRY_MS && c.standings[0].bestScore === 0));
    f.advance(RESULTS_MS); await restarted.cleanup(); assert.equal(await f.db.get(`ROOM#${id}`), undefined);
    assert.equal(f.provider.calls.length, 0);
  } finally { await f.close(); }
});

test('distributed image reservations never exceed the cap and settlements are idempotent', async () => {
  const f = await fixture();
  try {
    const budgets = Array.from({ length: 20 }, () => new DynamoBudget(f.db, 1000000));
    const reserved = await Promise.allSettled(budgets.map(b => b.reserve()));
    const good = reserved.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
    assert.equal(good.length, 5); assert.equal((await f.db.get('IMAGE_BUDGET'))!.used, 1000000);
    assert.equal((await f.db.get('IMAGE_BUDGET'))!.ttl, undefined);
    await Promise.all(Array.from({ length: 10 }, () => budgets[0].settle(good[0], .05)));
    assert.equal((await f.db.get('IMAGE_BUDGET'))!.used, 850000);
    await assert.rejects(new DynamoBudget(f.db, 1000000).reserve(), /budget/);
    await budgets[0].settle(good[1], 0);
    const same = new DynamoBudget(f.db, 1000000, 'one-paid-request'); await same.reserve();
    await assert.rejects(new DynamoBudget(f.db, 1000000, 'one-paid-request').reserve(), /already started/);
    assert.equal((await f.db.get('IMAGE_BUDGET'))!.used, 850000, 'An uncertain request retains its full reservation');
    assert.ok((await f.db.get(good[2]))!.ttl === undefined, 'Job expiration never deletes financial records');
  } finally { await f.close(); }
});

test('public rate limits are atomic across API instances and reset only at the next window', async () => {
  const f = await fixture();
  try {
    const replies = await Promise.all(Array.from({ length: 25 }, () => new DynamoRateLimiter(f.db).take('room:test', 5, 60000, f.clock())));
    assert.equal(replies.filter(Boolean).length, 5);
    assert.equal(await new DynamoRateLimiter(f.db).take('room:test', 5, 60000, f.clock() + 60000), true);
  } finally { await f.close(); }
});
