import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import WebSocket from 'ws';
import { fixture } from '../apps/server/test/aws/fixture.ts';
import { DynamoRoomStore } from '../apps/server/src/aws/room-store.ts';
import { DynamoSocketStore } from '../apps/server/src/aws/socket-store.ts';
import { buildApp } from '../apps/server/src/app.ts';
import { HOUSE, LocalHuntSession, sharedSnapshot, findPath, distance, isDadExposed } from '../packages/game-core/src/index.ts';

// Live mode is opt-in and creates one disposable, sample-artwork room. It never
// uploads a photo or calls the image API; normal CI always uses isolated fixtures.
const liveUrl = process.argv.includes('--live-url') ? new URL(process.argv[process.argv.indexOf('--live-url') + 1]).origin : null;
if (liveUrl && !liveUrl.startsWith('https://')) throw new Error('Live checks require the HTTPS game origin.');
const sleep = ms => new Promise(r => setTimeout(r, ms)), f = liveUrl ? null : await fixture();
const directory = liveUrl ? null : await mkdtemp(join(tmpdir(), 'shared-load-'));
const server = liveUrl ? null : await buildApp({ directory, provider: f.provider, roomStore: new DynamoRoomStore(f.db), socketStore: new DynamoSocketStore(f.db), assets: f.assets, jobs: f.jobs() });
const durations = [], peerDurations = [], sent = new Map(), clients = []; let failures = 0, messages = 0;
if (server) {
  const originalSend = server.realtime.send, originalMessage = server.realtime.message.bind(server.realtime);
  server.realtime.send = async (...args) => { await sleep(75); return originalSend(...args); };
  server.realtime.message = async (...args) => { await sleep(75); return originalMessage(...args); };
}
const cookies = Array(5).fill('');
async function http(index, path, data) {
  const response = await fetch(liveUrl + path, { method: data ? 'POST' : 'GET', headers: { origin: liveUrl, 'x-fh-request': '1', cookie: cookies[index], ...(data ? { 'content-type': 'application/json', 'idempotency-key': randomUUID() } : {}) }, body: data ? JSON.stringify(data) : undefined });
  const cookie = response.headers.getSetCookie().find(c => c.startsWith('fh-owner=')); if (cookie) cookies[index] = cookie.split(';')[0];
  const body = await response.json(); if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.message}`); return body;
}
try {
  const address = liveUrl ?? await server.app.listen({ host: '127.0.0.1', port: 0 });
  const creation = { name: 'Deploy test 1', fatherName: 'Balaji', characterId: 'sample-balaji', mode: 'shared' };
  const id = (liveUrl ? await http(0, '/api/rooms', creation) : await server.rooms.create('owner0', creation, randomUUID())).room.id;
  for (let i = 1; i < 5; i++) {
    if (liveUrl) await http(i, `/api/rooms/${id}/join`, { name: 'Deploy test ' + (i + 1) });
    else await server.rooms.join(id, 'owner' + i, 'Agent ' + i);
  }
  for (let i = 0; i < 5; i++) {
    const issued = liveUrl ? await http(i, `/api/rooms/${id}/ticket`, {}) : { ticket: await server.realtime.issue(id, 'owner' + i, address), endpoint: address.replace('http:', 'ws:') + '/api/realtime' };
    const ws = new WebSocket(issued.endpoint + '?ticket=' + issued.ticket, { origin: address });
    if (liveUrl) {
      ws.on('close', (code, reason) => console.log(`Live socket ${i + 1} closed: ${code} ${reason.toString()}`));
      ws.on('error', error => console.error(`Live socket ${i + 1}: ${error.message}`));
    }
    const c = { ws, view: null, pending: new Map(), seq: 0, round: '', path: [], slot: null, catches: 0 };
    ws.on('message', bytes => {
      const m = JSON.parse(bytes.toString()); messages++;
      if (liveUrl && !['state', 'motion', 'error'].includes(m.type)) console.error('Gateway response:', m.message ?? 'Unknown frame');
      if (liveUrl && m.type === 'error' && !c.pending.has(m.requestId)) console.error('Unmatched game error:', m.message);
      if (m.type === 'state') {
        const old = c.view; c.view = m.view;
        if (old && old.round?.id === m.view.round?.id) c.view.players = c.view.players.map(p => { const previous = old.players.find(o => o.id === p.id); return previous && previous.revision > p.revision ? previous : p; });
      } else if (m.type === 'motion' && c.view?.round?.id === m.roundId) {
        c.view.players = c.view.players.map(p => p.id === m.player.id && p.revision < m.player.revision ? m.player : p);
        if (!m.requestId) { const when = sent.get(m.player.id + ':' + m.player.ack); if (when) peerDurations.push(performance.now() - when); }
      }
      const p = c.pending.get(m.requestId); if (p) { clearTimeout(p.timeout); c.pending.delete(m.requestId); durations.push(performance.now() - p.at); m.type === 'error' ? p.reject(new Error(m.message)) : p.resolve(m); }
    });
    await once(ws, 'open');
    c.send = data => new Promise((resolve, reject) => {
      const requestId = randomUUID(), at = performance.now();
      const timeout = setTimeout(() => { c.pending.delete(requestId); reject(new Error('WebSocket timeout')); }, 5000);
      c.pending.set(requestId, { at, resolve, reject, timeout });
      if (data.commands?.length) sent.set(c.view.me + ':' + data.commands.at(-1).seq, at);
      ws.send(JSON.stringify({ requestId, ...data }));
    });
    clients.push(c); await c.send({ kind: 'hello' }); await c.send({ kind: 'ready', ready: true });
  }
  await clients[0].send({ kind: 'start' });
  if (liveUrl) console.log('Five live sockets connected; shared hunt started.');
  const started = Date.now(), duration = Number(process.env.FH_SHARED_LOAD_SECONDS ?? 180) * 1000;
  let rounds = 1, totalCaught = 0;
  await Promise.all(clients.map(async (c, index) => {
    while (Date.now() - started < duration) {
      const tick = Date.now();
      try {
        const v = c.view;
        if (v.phase === 'results') {
          if (index === 0) { totalCaught += v.players.reduce((s, p) => s + p.score, 0); await c.send({ kind: 'rematch' }); rounds++; }
          else await c.send({ kind: 'ping' });
        } else if (v.phase === 'lobby') {
          const me = v.players.find(p => p.id === v.me);
          if (!me.ready) await c.send({ kind: 'ready', ready: true });
          else if (index === 0 && v.players.every(p => p.ready)) await c.send({ kind: 'start' });
          else await c.send({ kind: 'ping' });
        } else if (v.phase === 'playing') {
          const p = v.players.find(p => p.id === v.me), r = v.round;
          if (c.round !== r.id) { c.round = r.id; c.seq = p.ack; c.slot = null; c.path = []; }
          const local = LocalHuntSession.restore({ snapshot: sharedSnapshot(r, p, v.father, v.room.expiresAt, Date.now(), p.search), lastHintAt: null }, Date.now);
          const choices = r.targets.filter(t => t.kind === 'hidden' && !t.claimedBy);
          const target = choices.find(t => t.slotId === c.slot) ?? choices[index % Math.max(1, choices.length)];
          const slot = target ? HOUSE.slots.find(s => s.id === target.slotId) : HOUSE.slots[(Math.floor((Date.now() - started) / 15000) + index) % HOUSE.slots.length];
          if (c.slot !== slot.id) { c.slot = slot.id; c.path = findPath(p.position, slot.anchor); }
          const commands = [];
          for (let step = 0; step < 5; step++) {
            const pos = local.getSnapshot().player.position;
            while (c.path.length && distance(pos, c.path[0]) < .1) c.path.shift();
            if (!c.path.length) break;
            const next = c.path[0], d = distance(pos, next), direction = { x: (next.x - pos.x) / d, y: (next.y - pos.y) / d }, deltaMs = Math.min(40, d / 210 * 1000);
            commands.push({ seq: ++c.seq, kind: 'move', direction, deltaMs }); local.move(direction, deltaMs);
          }
          if (!commands.length && target) {
            const s = local.getSnapshot();
            if (isDadExposed(s, slot, Date.now())) commands.push({ seq: ++c.seq, kind: 'catch', id: target.id });
            else if (!p.search) commands.push({ seq: ++c.seq, kind: 'search', id: slot.id });
          }
          if (commands.length) await c.send({ kind: 'input', roundId: r.id, commands }); else await c.send({ kind: 'ping' });
        } else await c.send({ kind: 'ping' });
      } catch (error) { failures++; console.error('Shared load error:', error.message); }
      await sleep(Math.max(0, 200 - (Date.now() - tick)));
    }
  }));
  const final = liveUrl ? await http(0, `/api/rooms/${id}/shared`) : await server.shared.view(id, 'owner0'); totalCaught += final.players.reduce((s, p) => s + p.score, 0);
  const p95 = values => [...values].sort((a, b) => a - b)[Math.floor(values.length * .95)] ?? 0;
  const result = { players: 5, storage: liveUrl ? 'AWS DynamoDB / API Gateway WebSocket' : 'DynamoDB Local', seconds: Math.round((Date.now() - started) / 1000), simulatedRttMs: liveUrl ? 0 : 150, responses: durations.length, messages, peerSamples: peerDurations.length, responseP95Ms: Math.round(p95(durations)), peerP95Ms: Math.round(p95(peerDurations)), failures, rounds, totalCaught };
  console.log(JSON.stringify(result, null, 2)); await writeFile(new URL(`../artifacts/${liveUrl ? 'live-' : ''}shared-load.json`, import.meta.url), JSON.stringify(result, null, 2));
  assert.equal(failures, 0); assert.ok(peerDurations.length > 500); assert.ok(p95(peerDurations) < 500, 'Peer update p95 must stay below 500 ms'); assert.ok(totalCaught >= 10, 'Load includes actual catches, not just idle sockets');
  if (f) assert.equal(f.provider.calls.length, 0);
} finally { for (const c of clients) { for (const p of c.pending.values()) clearTimeout(p.timeout); c.ws.terminate(); } await sleep(100); await server?.app.close(); await f?.close(); if (directory) await rm(directory, { recursive: true, force: true }); }
