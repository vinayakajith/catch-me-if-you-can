import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.ts';
import { FixtureProvider, portrait } from './fixtures.ts';
import { HOUSE, ROUND_MS, EXPIRY_MS, RESULTS_MS, LocalHuntSession, findPath, distance, type RoomView, type HuntCommand } from '../../../packages/game-core/src/index.ts';
import { createHash } from 'node:crypto';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'father-rooms-')); let now = 1_000_000;
  const provider = new FixtureProvider();
  let server = await buildApp({ directory, provider, clock: () => now, retryDelayMs: 1 });
  function client() {
    let cookie = '';
    return { controller: randomUUID(), seq: 0, view: null as RoomView | null,
      async request(method: 'GET' | 'POST', url: string, payload?: object, idem = randomUUID()) {
        const response = await server.app.inject({ method, url, headers: { 'x-fh-request': '1', 'idempotency-key': idem, ...(cookie ? { cookie } : {}) }, payload });
        if (response.cookies[0]) cookie = `${response.cookies[0].name}=${response.cookies[0].value}`;
        return response;
      },
      owner() { return createHash('sha256').update(cookie.split('=')[1]).digest('hex'); },
    };
  }
  return { client, provider, get server() { return server; }, now: () => now, advance: (ms: number) => { now += ms; }, set: (n: number) => { now = n; },
    restart: async () => { await server.app.close(); server = await buildApp({ directory, provider, clock: () => now }); },
    close: async () => { await server.app.close(); await rm(directory, { recursive: true, force: true }); } };
}
type Client = ReturnType<Awaited<ReturnType<typeof fixture>>['client']>;
async function start(c: Client, room: string, idem = randomUUID()) {
  const r = await c.request('POST', `/api/rooms/${room}/attempts`, { controller: c.controller }, idem);
  assert.equal(r.statusCode, 200, r.body); c.view = r.json().view; c.seq = c.view!.attempt!.ack; return r;
}
async function command(c: Client, f: Awaited<ReturnType<typeof fixture>>, item: Omit<HuntCommand, 'seq'> | object, advance = 0) {
  f.advance(advance);
  const r = await c.request('POST', `/api/rooms/${c.view!.room.id}/attempts/${c.view!.attempt!.id}/commands`, { controller: c.controller, commands: [{ ...item, seq: ++c.seq }] });
  assert.equal(r.statusCode, 200, r.body); c.view = r.json().view; return r;
}
async function statue(c: Client, f: Awaited<ReturnType<typeof fixture>>) {
  const slot = HOUSE.slots.find(s => s.kind === 'statue')!;
  for (const waypoint of findPath(c.view!.attempt!.snapshot.player.position, slot.anchor)) {
    for (let i = 0; i < 1000; i++) {
      const p = c.view!.attempt!.snapshot.player.position, d = distance(p, waypoint); if (d < .1) break;
      const deltaMs = Math.min(40, d / 210 * 1000);
      await command(c, f, { kind: 'move', direction: { x: (waypoint.x - p.x) / d, y: (waypoint.y - p.y) / d }, deltaMs }, Math.ceil(deltaMs));
    }
  }
  const id = c.view!.attempt!.snapshot.targets.find(t => t.kind === 'hidden' && t.slotId === slot.id)!.id;
  const response = await command(c, f, { kind: 'catch', id }); assert.equal(response.json().results[0].result.ok, true);
  return id;
}

test('atomic five-seat join, independent catches, receipt retries, restart, best-score replays, and deadlines', async () => {
  const f = await fixture();
  try {
    const host = f.client(), idem = randomUUID();
    const created = await host.request('POST', '/api/rooms', { name: 'Alan', fatherName: 'Suresh', characterId: 'sample-balaji' }, idem);
    assert.equal(created.statusCode, 200, created.body); const room = created.json().room.id;
    assert.equal((await host.request('POST', '/api/rooms', { name: 'Alan', fatherName: 'Suresh', characterId: 'sample-balaji' }, idem)).json().room.id, room);
    const others = Array.from({ length: 7 }, () => f.client());
    const joins = await Promise.all(others.map((c, i) => c.request('POST', `/api/rooms/${room}/join`, { name: `Agent ${i}` })));
    assert.equal(joins.filter(r => r.statusCode === 200).length, 4); assert.equal(joins.filter(r => r.statusCode === 409).length, 3);
    const players = [host, ...others.slice(0, 4)];
    await Promise.all(players.map(c => start(c, room)));
    for (const c of players) await statue(c, f);
    const id = host.view!.attempt!.snapshot.targets.find(t => t.claimedBy)!.id;
    const duplicate = await host.request('POST', `/api/rooms/${room}/attempts/${host.view!.attempt!.id}/commands`, { controller: host.controller, commands: [{ kind: 'catch', id, seq: host.seq }] });
    assert.ok(duplicate.json().results[0].result.ok); assert.equal(duplicate.json().view.cursor, 5);
    const extra = await command(host, f, { kind: 'catch', id }); assert.equal(extra.json().results[0].result.ok, false);
    const state = (await host.request('GET', `/api/rooms/${room}/state`)).json() as RoomView;
    assert.deepEqual(state.standings.map(p => p.bestScore), [1, 1, 1, 1, 1]); assert.ok(state.standings.every(p => p.rank === 1));
    assert.equal(state.events.length, 5); assert.match(state.events[0].text, /Suresh/);
    const expiry = state.room.expiresAt, endsAt = host.view!.attempt!.snapshot.endsAt;
    await f.restart(); const recovered = (await host.request('GET', `/api/rooms/${room}/state`)).json();
    assert.equal(recovered.attempt.snapshot.endsAt, endsAt); assert.equal(recovered.standings[0].bestScore, 1);
    f.set(endsAt); const late = await command(host, f, { kind: 'catch', id }); assert.equal(late.json().results[0].result.ok, false);
    const oldSeed = host.view!.attempt!.snapshot.seed; await start(host, room);
    assert.notEqual(host.view!.attempt!.snapshot.seed, oldSeed); assert.equal(host.view!.standings[0].bestScore, 1); assert.equal(host.view!.attempt!.snapshot.player.score, 0);
    f.set(expiry - ROUND_MS + 1);
    assert.equal((await host.request('POST', `/api/rooms/${room}/attempts`, { controller: host.controller })).statusCode, 410);
    f.set(expiry); assert.equal((await host.request('POST', `/api/rooms/${room}/join`, { name: 'late' })).statusCode, 410);
    assert.equal((await host.request('GET', `/api/rooms/${room}`)).json().room.status, 'closed');
    await f.server.rooms.cleanup(); assert.equal((await host.request('GET', `/api/rooms/${room}`)).json().standings[0].bestScore, 1);
    f.advance(RESULTS_MS); assert.equal((await host.request('GET', `/api/rooms/${room}`)).statusCode, 410);
    await f.server.rooms.cleanup(); assert.equal((await host.request('GET', `/api/rooms/${room}`)).statusCode, 404);
    assert.equal(f.provider.calls.length, 0);
  } finally { await f.close(); }
});

test('membership, names, movement budgets, sequence gaps, and tab takeover are enforced', async () => {
  const f = await fixture();
  try {
    const host = f.client(), stranger = f.client();
    const created = await host.request('POST', '/api/rooms', { name: 'Alan', fatherName: 'Balaji', characterId: 'sample-balaji' }); const room = created.json().room.id;
    assert.equal((await stranger.request('POST', `/api/rooms/${room}/attempts`, { controller: stranger.controller })).statusCode, 403);
    assert.equal((await stranger.request('POST', `/api/rooms/${room}/join`, { name: 'alan' })).statusCode, 409);
    await start(host, room); const attempt = host.view!.attempt!, url = `/api/rooms/${room}/attempts/${attempt.id}/commands`;
    const gap = await host.request('POST', url, { controller: host.controller, commands: [{ seq: 2, kind: 'hint' }] }); assert.equal(gap.statusCode, 409);
    f.advance(1000);
    const commands = Array.from({ length: 80 }, (_, i) => ({ seq: i + 1, kind: 'move', direction: { x: 0, y: -1 }, deltaMs: 40 }));
    const flood = await host.request('POST', url, { controller: host.controller, commands });
    assert.equal(flood.statusCode, 200); assert.ok(distance(flood.json().view.attempt.snapshot.player.position, HOUSE.spawn) <= 63.01);
    const newControl = randomUUID(); await host.request('POST', `/api/rooms/${room}/attempts/${attempt.id}/resume`, { controller: newControl });
    assert.equal((await host.request('POST', url, { controller: host.controller, commands: [] })).statusCode, 409);
    assert.equal((await host.request('POST', url, { controller: newControl, commands: [] })).statusCode, 200);
    assert.equal((await stranger.request('GET', `/api/rooms/${room}/state`)).json().attempt, null);
  } finally { await f.close(); }
});

test('room members share a copied atlas beyond original-pack expiry; source remains private', async () => {
  const f = await fixture();
  try {
    const host = f.client(), guest = f.client(); await host.request('GET', '/api/characters/config');
    const job = await f.server.jobs.create(host.owner(), randomUUID(), 'Ajith', await portrait());
    const wait = async (status: string) => { for (let i = 0; i < 300; i++) { if (f.server.jobs.get(job.id, host.owner()).status === status) return; await new Promise(r => setTimeout(r, 20)); } throw new Error('Fixture generation timed out'); };
    await wait('awaiting_approval'); f.server.jobs.approve(job.id, host.owner(), 1); await wait('preview');
    await f.server.jobs.finalize(job.id, host.owner(), 'Ajith', '#865437');
    f.set(job.expiresAt - 1000);
    const created = await host.request('POST', '/api/rooms', { name: 'Alan', fatherName: 'Ajith', characterId: job.id }); assert.equal(created.statusCode, 200, created.body);
    const view = created.json() as RoomView; const atlas = view.father!.atlas;
    assert.equal((await guest.request('GET', atlas)).statusCode, 403);
    await guest.request('POST', `/api/rooms/${view.room.id}/join`, { name: 'Vinayak' });
    f.advance(2000); await f.server.jobs.cleanup(); assert.equal((await guest.request('GET', atlas)).statusCode, 200);
    assert.equal((await guest.request('GET', `/api/characters/${job.id}/assets/source.jpg`)).statusCode, 404);
    f.set(view.room.expiresAt); assert.equal((await guest.request('GET', atlas)).statusCode, 410);
  } finally { await f.close(); }
});
