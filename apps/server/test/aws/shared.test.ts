import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { fixture } from './fixture.ts';
import { Rooms } from '../../src/rooms.ts';
import { SharedRooms } from '../../src/shared-rooms.ts';
import { DynamoRoomStore } from '../../src/aws/room-store.ts';
import { DynamoSocketStore } from '../../src/aws/socket-store.ts';
import { HOUSE, type SharedRequest } from '../../../../packages/game-core/src/index.ts';
import { portrait } from '../fixtures.ts';

test('DynamoDB shared claims survive five writers, receipt retries and connection replacement', async () => {
  const f = await fixture();
  try {
    const store = new DynamoRoomStore(f.db, f.clock), rooms = new Rooms(store, f.assets, f.jobs(), f.clock);
    const id = (await rooms.create('owner0', { name: 'Alan', fatherName: 'Suresh', characterId: 'sample-balaji', mode: 'shared' }, randomUUID())).room.id;
    for (let i = 1; i < 5; i++) await rooms.join(id, 'owner' + i, 'Agent ' + i);
    const services = Array.from({ length: 5 }, () => new SharedRooms(new DynamoRoomStore(f.db, f.clock), f.clock));
    const send = (i: number, command: Omit<SharedRequest, 'requestId'>) => services[i].handle(id, 'owner' + i, 'socket' + i, { requestId: randomUUID(), ...command });
    for (let i = 0; i < 5; i++) { await services[i].connect(id, 'owner' + i, 'socket' + i); await send(i, { kind: 'ready', ready: true }); }
    const view = (await send(0, { kind: 'start' })).view, round = view.round!;
    f.advance(3200); await send(0, { kind: 'ping' });
    const version = (await f.db.get('ROOM#' + id, 'SHARED'))!.version;
    await Promise.all(services.map((_, i) => send(i, { kind: 'input', roundId: round.id, commands: [{ seq: 1, kind: 'move', direction: { x: 1, y: 0 }, deltaMs: 40 }] })));
    assert.equal((await f.db.get('ROOM#' + id, 'SHARED'))!.version, version, 'Walking updates separate player rows, not the shared targets');
    const slot = HOUSE.slots.find(s => s.kind === 'statue')!, target = round.targets.find(t => t.kind === 'hidden' && t.slotId === slot.id)!;
    await services[0].change(id, r => { for (const p of r.players) { p.shared!.position = slot.anchor; p.shared!.roomId = slot.roomId; } });
    const caught = await Promise.all(services.map((_, i) => send(i, { kind: 'input', roundId: round.id, commands: [{ seq: 2, kind: 'catch', id: target.id }] })));
    assert.equal(caught.filter(c => c.results[0].result.ok).length, 1);
    const retry = await send(0, { kind: 'input', roundId: round.id, commands: [{ seq: 2, kind: 'catch', id: target.id }] }); assert.equal(retry.view.events.length, 1);
    assert.equal(retry.view.players.reduce((s, p) => s + p.score, 0), 1);
    await services[0].connect(id, 'owner0', 'new-socket'); await services[0].disconnect(id, 'owner0', 'socket0');
    assert.equal((await services[0].view(id, 'owner0')).players[0].connected, true);
    await assert.rejects(send(0, { kind: 'ready', ready: false }), /another tab/);
    const sockets = new DynamoSocketStore(f.db), hash = createHash('sha256').update('ticket').digest('hex');
    await sockets.ticket(hash, { owner: 'owner0', roomId: id, origin: 'https://game.example', expiresAt: f.clock() + 30000 });
    const tickets = await Promise.all(Array.from({ length: 5 }, () => sockets.consume(hash, f.clock()))); assert.equal(tickets.filter(Boolean).length, 1);
    f.advance(3600000); await rooms.cleanup();
    const closed = await services[0].view(id, 'owner0'); assert.equal(closed.phase, 'closed'); assert.equal(closed.lastScores.reduce((s, p) => s + p.score, 0), 1);
  } finally { await f.close(); }
});

test('cloud player portraits make one image, reuse the budget, and delete late output at room expiry', async () => {
  const f = await fixture();
  try {
    const photo = await portrait(), digest = createHash('sha256').update(photo).digest('hex');
    const job = await f.jobs().beginUpload('owner', randomUUID(), 'Alan', digest, { roomId: randomUUID(), expiresAt: f.clock() + 3600000 });
    await f.assets.write(job.job.id, 'upload.jpg', photo); const queued = await f.jobs().completeUpload(job.job.id, 'owner');
    await Promise.all([f.jobs().process({ jobId: queued.id, revision: queued.revision }), f.jobs().process({ jobId: queued.id, revision: queued.revision })]);
    const result = await f.jobs().get(queued.id, 'owner'); assert.equal(result.status, 'ready'); assert.equal(f.provider.calls.length, 1); assert.equal(f.provider.calls[0].expression, 'laugh');
    assert.deepEqual([...f.assets.objects.keys()], [result.id + '/laugh.png']); assert.equal((await f.db.get('IMAGE_BUDGET'))!.used, 54780);
    await assert.rejects(f.jobs().characterBytes(result.id, 'owner'), /original room/); await assert.rejects(f.jobs().asset(result.id, 'owner', 'source.jpg'), /available/);
    const late = await f.jobs().beginUpload('owner', randomUUID(), 'Meera', digest, { roomId: randomUUID(), expiresAt: f.clock() + 200 });
    await f.assets.write(late.job.id, 'upload.jpg', photo); const lateQueued = await f.jobs().completeUpload(late.job.id, 'owner');
    f.provider.delayMs = 100;
    const working = f.jobs().process({ jobId: lateQueued.id, revision: lateQueued.revision });
    while (f.provider.calls.length < 2) await new Promise(r => setTimeout(r, 5));
    f.advance(3600001); await working; await f.jobs().cleanup();
    assert.equal(f.assets.objects.size, 0, 'No raw upload, recovery image or game face survives expiry, including a late provider response');
    assert.equal((await f.db.get('IMAGE_BUDGET'))!.used, 109560, 'Cleanup never erases paid accounting');
  } finally { await f.close(); }
});
