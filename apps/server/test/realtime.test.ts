import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import WebSocket from 'ws';
import { buildApp } from '../src/app.ts';
import { FixtureProvider } from './fixtures.ts';
import { HOUSE, type SharedMessage, type SharedRequest } from '../../../packages/game-core/src/index.ts';

test('five real sockets authenticate once, broadcast movement and award one shared catch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shared-sockets-')); let now = Date.now();
  const server = await buildApp({ directory, provider: new FixtureProvider(), clock: () => now });
  const address = await server.app.listen({ host: '127.0.0.1', port: 0 });
  const sockets: WebSocket[] = [], inbox: SharedMessage[][] = [];
  try {
    const room = await server.rooms.create('owner-0', { name: 'Alan', fatherName: 'Suresh', characterId: 'sample-balaji', mode: 'shared' }, randomUUID());
    const id = room.room.id;
    for (let i = 1; i < 5; i++) await server.rooms.join(id, 'owner-' + i, 'Player ' + i);
    for (let i = 0; i < 5; i++) {
      const ticket = await server.realtime.issue(id, 'owner-' + i, address);
      const ws = new WebSocket(address.replace('http:', 'ws:') + '/api/realtime?ticket=' + ticket, { origin: address });
      inbox[i] = []; ws.on('message', data => inbox[i].push(JSON.parse(data.toString()))); sockets.push(ws); await once(ws, 'open');
      await assert.rejects(server.realtime.connect('replay', ticket, address), /reconnect/);
    }
    const send = async (i: number, data: Omit<SharedRequest, 'requestId'>) => {
      const requestId = randomUUID(); sockets[i].send(JSON.stringify({ requestId, ...data }));
      const until = Date.now() + 5000;
      while (Date.now() < until) { const reply = inbox[i].find(m => m.requestId === requestId); if (reply) return reply; await new Promise(r => setTimeout(r, 5)); }
      throw new Error('Socket response timed out');
    };
    for (let i = 0; i < 5; i++) await send(i, { kind: 'ready', ready: true });
    const start = await send(0, { kind: 'start' }); assert.equal(start.type, 'state'); if (start.type !== 'state') return;
    const round = start.view.round!;
    now += 3200;
    const move = await send(0, { kind: 'input', roundId: round.id, commands: [{ seq: 1, kind: 'move', direction: { x: 1, y: 0 }, deltaMs: 40 }] });
    assert.equal(move.type, 'motion'); await new Promise(r => setTimeout(r, 30));
    for (const messages of inbox) assert.ok(messages.some(m => m.type === 'motion' && m.player.ack === 1));
    const target = round.targets.find(t => t.kind === 'hidden' && t.slotId === 'living-statue')!, slot = HOUSE.slots.find(s => s.id === 'living-statue')!;
    await server.shared.change(id, r => { for (const member of r.players) { member.shared!.position = slot.anchor; member.shared!.roomId = slot.roomId; } });
    const caught = await Promise.all(sockets.map((_, i) => send(i, { kind: 'input', roundId: round.id, commands: [{ seq: i === 0 ? 2 : 1, kind: 'catch', id: target.id }] })));
    assert.equal(caught.filter(m => m.type === 'state' && m.results?.[0].result.ok).length, 1);
    for (let i = 0; i < 5; i++) { const m = await send(i, { kind: 'ping' }); assert.equal(m.type === 'state' && m.view.players.reduce((a, p) => a + p.score, 0), 1); }
    const malformed = await send(0, { kind: 'input', roundId: round.id, commands: [{ seq: 3, kind: 'move', direction: { x: 1, y: 0 }, deltaMs: 10000 }] });
    assert.equal(malformed.type, 'error');
    const originalSend = server.realtime.send; let failedDelivery = false;
    const delivery = mock.method(server.realtime, 'send', async (id: string, message: SharedMessage) => {
      if (!failedDelivery) { failedDelivery = true; throw Object.assign(new Error('Fixture gateway outage'), { name: 'LimitExceededException' }); }
      return originalSend(id, message);
    });
    const interrupted = await send(0, { kind: 'ping' });
    assert.equal(interrupted.type, 'error'); assert.equal(interrupted.type === 'error' && interrupted.retryable, true);
    assert.equal((await server.realtime.store.list(id)).length, 5, 'Transient delivery errors retain all five connections');
    assert.equal((await send(0, { kind: 'ping' })).type, 'state');
    delivery.mock.restore();
    const token = await server.realtime.issue(id, 'owner-0', address);
    await assert.rejects(server.realtime.connect('wrong-origin', token, 'https://elsewhere.example'), /reconnect/);
  } finally { for (const ws of sockets) ws.terminate(); await new Promise(r => setTimeout(r, 50)); await server.app.close(); await rm(directory, { recursive: true, force: true }); }
});
