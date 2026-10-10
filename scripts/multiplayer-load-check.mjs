import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { buildApp } from '../apps/server/src/app.ts';
import { FixtureProvider } from '../apps/server/test/fixtures.ts';
import { HOUSE, LocalHuntSession, findPath, distance, canReach, isDadExposed } from '../packages/game-core/src/index.ts';
import { fixture as cloudFixture } from '../apps/server/test/aws/fixture.ts';
import { DynamoRoomStore } from '../apps/server/src/aws/room-store.ts';
import { DynamoRateLimiter } from '../apps/server/src/aws/limits.ts';

const seconds = Math.max(5, Number(process.env.FATHER_HUNTER_LOAD_SECONDS) || 600);
const directory = await mkdtemp(join(tmpdir(), 'father-load-'));
const cloud = process.env.FH_LOAD_STORAGE === 'dynamo' ? await cloudFixture() : null;
const storage = cloud ? 'dynamo' : 'sqlite';
const provider = cloud?.provider ?? new FixtureProvider(), { app } = await buildApp({ directory, provider,
  ...(cloud ? { jobs: cloud.jobs(), assets: cloud.assets, roomStore: new DynamoRoomStore(cloud.db), limiter: new DynamoRateLimiter(cloud.db), background: false } : {}),
});
const latencies = [], broadcasts = [], seenEvents = new Set(); let failures = 0, requests = 0, catchCount = 0, finishedAttempts = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0;
let progress, stopped = false;
try {
  const base = await app.listen({ host: '127.0.0.1', port: 0 });
  const bots = Array.from({ length: 5 }, (_, index) => ({ name: `Agent ${index + 1}`, cookie: '', controller: randomUUID(), view: null, seq: 0, cursor: 0, target: null, path: [], coolUntil: 0, rounds: 0, catches: 0, completed: 0 }));
  async function request(bot, path, data, idem = randomUUID()) {
    const begin = performance.now();
    const response = await fetch(`${base}${path}`, { method: data ? 'POST' : 'GET', headers: { 'x-fh-request': '1', 'idempotency-key': idem, ...(bot.cookie ? { cookie: bot.cookie } : {}), ...(data ? { 'content-type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined });
    if (response.headers.get('set-cookie')) bot.cookie = response.headers.get('set-cookie').split(';')[0];
    const result = await response.json(); requests++; latencies.push(performance.now() - begin);
    if (!response.ok) { failures++; throw new Error(`${response.status} ${path}: ${result.message}`); }
    return result;
  }
  const created = await request(bots[0], '/api/rooms', { name: bots[0].name, fatherName: 'Load Balaji', characterId: 'sample-balaji' }); const id = created.room.id;
  await Promise.all(bots.slice(1).map(bot => request(bot, `/api/rooms/${id}/join`, { name: bot.name })));
  async function start(bot) {
    const result = await request(bot, `/api/rooms/${id}/attempts`, { controller: bot.controller });
    bot.view = result.view; bot.seq = result.view.attempt.ack; bot.target = null; bot.path = []; bot.rounds++;
  }
  await Promise.all(bots.map(start));
  const started = Date.now(), until = started + seconds * 1000;
  progress = setInterval(() => console.log(`LOAD ${Math.round((Date.now() - started) / 1000)}s: ${requests} requests, ${catchCount} catches, ${finishedAttempts} completed attempts, p95 ${percentile(latencies, .95).toFixed(1)}ms`), 30000);
  async function poll(bot) {
    while (!stopped && Date.now() < until) {
      const view = await request(bot, `/api/rooms/${id}/state?after=${bot.cursor}`); bot.cursor = view.cursor;
      for (const event of view.events) {
        seenEvents.add(event.id);
        if (event.playerId !== bot.view.me.id) broadcasts.push(Date.now() - event.at);
      }
      await sleep(500);
    }
  }
  async function play(bot) {
    while (!stopped && Date.now() < until) {
      const began = Date.now(), snapshot = bot.view.attempt.snapshot;
      if (snapshot.status !== 'playing') { finishedAttempts++; bot.completed++; await start(bot); continue; }
      const local = LocalHuntSession.restore({ snapshot, lastHintAt: null }, Date.now); local.tick();
      const commands = [], add = command => commands.push({ seq: ++bot.seq, ...command });
      if (Date.now() >= bot.coolUntil && local.getSnapshot().status === 'playing') {
        if (!bot.target || local.getSnapshot().targets.find(t => t.id === bot.target.id)?.claimedBy) {
          bot.target = local.getSnapshot().targets.filter(t => t.kind === 'hidden' && !t.claimedBy).map(t => ({ ...t, slot: HOUSE.slots.find(s => s.id === t.slotId) })).sort((a, b) => distance(local.getSnapshot().player.position, a.slot.anchor) - distance(local.getSnapshot().player.position, b.slot.anchor))[0];
          bot.path = bot.target ? findPath(local.getSnapshot().player.position, bot.target.slot.anchor) : [];
        }
        if (bot.target) {
          for (let i = 0; i < 5; i++) {
            const pos = local.getSnapshot().player.position;
            while (bot.path.length && distance(pos, bot.path[0]) < .1) bot.path.shift();
            if (!bot.path.length) break;
            const goal = bot.path[0], d = distance(pos, goal), direction = { x: (goal.x - pos.x) / d, y: (goal.y - pos.y) / d }, deltaMs = Math.min(20, d / 210 * 1000);
            add({ kind: 'move', direction, deltaMs }); local.move(direction, deltaMs);
          }
          const state = local.getSnapshot(), slot = bot.target.slot;
          if (!bot.path.length && canReach(state.player.position, slot)) {
            if (isDadExposed(state, slot, Date.now())) add({ kind: 'catch', id: bot.target.id });
            else if (!state.search) add({ kind: 'search', id: slot.id });
          }
        }
      }
      const result = await request(bot, `/api/rooms/${id}/attempts/${snapshot.id}/commands`, { controller: bot.controller, commands });
      for (const receipt of result.results) if (receipt.result.kind === 'catch' && receipt.result.ok) { catchCount++; bot.catches++; bot.coolUntil = Date.now() + 1300; }
      const previousScore = snapshot.player.score;
      const acceptedCatches = result.results.filter(r => r.result.kind === 'catch' && r.result.ok).length;
      assert.equal(result.view.attempt.snapshot.player.score, previousScore + acceptedCatches, 'Only accepted catches change the score');
      assert.ok(result.view.standings.find(p => p.id === result.view.me.id).bestScore >= result.view.attempt.snapshot.player.score);
      bot.view = result.view;
      await sleep(Math.max(0, 100 - (Date.now() - began)));
    }
  }
  const workers = bots.flatMap(bot => [poll(bot), play(bot)]);
  try { await Promise.all(workers); }
  catch (error) { stopped = true; await Promise.allSettled(workers); throw error; }
  clearInterval(progress);
  const final = await request(bots[0], `/api/rooms/${id}/state`);
  assert.equal(final.room.playerCount, 5); assert.equal(final.cursor, catchCount); assert.equal(failures, 0); assert.equal(provider.calls.length, 0);
  assert.ok(bots.every(bot => bot.catches > 0), 'Every agent should catch at least one target');
  assert.ok(percentile(latencies, .95) < 250, 'Local API p95 under 250ms');
  assert.ok(percentile(broadcasts, .95) < 1000, 'Other players observe catches within one second at p95');
  if (seconds >= 600) assert.ok(bots.every(bot => bot.completed >= 4), 'At least four complete two-minute attempts per agent');
  const report = { timestamp: new Date().toISOString(), storage, durationSeconds: seconds, clients: 5, requests, failures, catches: catchCount, completedAttempts: finishedAttempts,
    apiP95Ms: +percentile(latencies, .95).toFixed(2), apiP99Ms: +percentile(latencies, .99).toFixed(2), peerUpdateP95Ms: +percentile(broadcasts, .95).toFixed(2), observedEvents: seenEvents.size,
    agents: bots.map(bot => ({ name: bot.name, catches: bot.catches, completedAttempts: bot.completed })), standings: final.standings };
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await writeFile(new URL(`../artifacts/multiplayer-load-${storage}.json`, import.meta.url), JSON.stringify(report, null, 2));
  console.log(`PASS ${JSON.stringify(report)}`);
} finally { clearInterval(progress); await app.close(); await cloud?.close(); await rm(directory, { recursive: true, force: true }); }
