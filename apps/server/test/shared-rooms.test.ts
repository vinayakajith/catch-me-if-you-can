import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Rooms } from '../src/rooms.ts';
import { SharedRooms } from '../src/shared-rooms.ts';
import { SqliteRoomStore } from '../src/room-store.ts';
import { DiskAssetStore } from '../src/storage.ts';
import type { CharacterService } from '../src/contracts.ts';
import { HOUSE, createSharedRound, targetSignature, ROUND_MS, type SharedRequest } from '../../../packages/game-core/src/index.ts';

test('shared placement gives twenty targets, empty hideouts, all rooms, and fresh rematches', () => {
  for (let i = 0; i < 100; i++) {
    const a = createSharedRound('a', 'a-' + i, 1000);
    const b = createSharedRound('b', 'b-' + i, 1000, targetSignature(a.targets));
    assert.equal(a.targets.length, 20); assert.equal(HOUSE.slots.length, 29);
    assert.notEqual(targetSignature(a.targets), targetSignature(b.targets));
    for (const room of HOUSE.rooms.filter(r => r.id !== 'hall')) assert.ok(a.targets.filter(t => t.kind === 'hidden' && HOUSE.slots.find(s => s.id === t.slotId)?.roomId === room.id).length >= 3);
  }
});

test('host countdown, five-way atomic catch, late join, replay, takeover and expiry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shared-rules-')), store = new SqliteRoomStore(dir);
  let now = 100000;
  const rooms = new Rooms(store, new DiskAssetStore(dir), {} as CharacterService, () => now), shared = new SharedRooms(store, () => now);
  try {
    const created = await rooms.create('owner-0', { name: 'Alan', fatherName: 'Suresh', characterId: 'sample-balaji', mode: 'shared' }, randomUUID());
    const id = created.room.id;
    for (let i = 1; i < 5; i++) await rooms.join(id, 'owner-' + i, 'Agent ' + i);
    await assert.rejects(rooms.join(id, 'sixth', 'Sixth'), /five/);
    const send = (i: number, data: Omit<SharedRequest, 'requestId'>) => shared.handle(id, 'owner-' + i, 'socket-' + i, { requestId: randomUUID(), ...data });
    for (let i = 0; i < 5; i++) await shared.connect(id, 'owner-' + i, 'socket-' + i);
    await assert.rejects(send(1, { kind: 'start' }), /host/);
    await assert.rejects(send(0, { kind: 'start' }), /Ready/);
    for (let i = 0; i < 5; i++) await send(i, { kind: 'ready', ready: true });
    const start = await send(0, { kind: 'start' }), round = start.view.round!;
    assert.equal(start.view.phase, 'countdown'); assert.equal(round.startedAt, now + 3000); assert.equal(round.endsAt - round.startedAt, ROUND_MS);
    assert.equal((await send(0, { kind: 'start' })).view.round!.id, round.id);
    const target = round.targets.find(t => t.kind === 'hidden' && t.slotId === 'living-statue')!;
    const slot = HOUSE.slots.find(s => s.id === 'living-statue')!;
    await shared.change(id, r => { for (const member of r.players) { member.shared!.position = slot.anchor; member.shared!.roomId = slot.roomId; } });
    assert.equal((await send(0, { kind: 'input', roundId: round.id, commands: [{ seq: 1, kind: 'catch', id: target.id }] })).results[0].result.ok, false, 'Cannot catch during countdown');
    now += 3100;
    const catches = await Promise.all(Array.from({ length: 5 }, (_, i) => send(i, { kind: 'input', roundId: round.id, commands: [{ seq: i === 0 ? 2 : 1, kind: 'catch', id: target.id }] })));
    assert.equal(catches.filter(r => r.results[0].result.ok).length, 1);
    const result = await shared.view(id, 'owner-0');
    assert.equal(result.players.reduce((n, p) => n + p.score, 0), 1); assert.equal(result.events.length, 1);
    const retried = await send(0, { kind: 'input', roundId: round.id, commands: [{ seq: 2, kind: 'catch', id: target.id }] });
    assert.equal(retried.view.events.length, 1);
    await shared.disconnect(id, 'owner-0', 'socket-0'); now += 31000;
    await send(1, { kind: 'ping' }); await send(2, { kind: 'ping' });
    const transferred = await send(1, { kind: 'ping' });
    assert.equal(transferred.view.hostId, transferred.view.players[1].id);
    now = round.endsAt;
    const ended = await send(1, { kind: 'ping' }); assert.equal(ended.view.phase, 'results'); assert.equal(ended.view.lastScores.length, 5);
    assert.equal((await send(1, { kind: 'rematch' })).view.phase, 'lobby');
    now = created.room.expiresAt;
    assert.equal((await shared.view(id, 'owner-0')).phase, 'closed');
    await assert.rejects(send(1, { kind: 'start' }), /closed/);
  } finally { store.close(); await rm(dir, { recursive: true, force: true }); }
});
