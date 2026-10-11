import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { buildApp } from '../src/app.ts';
import { FixtureProvider, portrait } from './fixtures.ts';
import { GenerationError } from '../src/contracts.ts';
import { DiskAssetStore } from '../src/storage.ts';

test('one laughing player face, room-only sharing, private source deletion and expiry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'player-face-')); let now = Date.now();
  const provider = new FixtureProvider(), assets = new DiskAssetStore(directory);
  const s = await buildApp({ directory, provider, clock: () => now, assets });
  try {
    const cookies = Array.from({ length: 3 }, () => randomUUID().replaceAll('-', '').repeat(2)), owners = cookies.map(c => createHash('sha256').update(c).digest('hex'));
    const r = await s.rooms.create(owners[0], { name: 'Alan', fatherName: 'Suresh', characterId: 'sample-balaji', mode: 'shared' }, randomUUID());
    await s.rooms.join(r.room.id, owners[1], 'Meera');
    const request = (i: number, method: 'GET' | 'POST', path: string, payload?: object) => s.app.inject({ method, url: '/api/rooms/' + r.room.id + path, headers: { cookie: 'fh-owner=' + cookies[i], 'x-fh-request': '1' }, payload });
    const job = await s.jobs.create(owners[0], randomUUID(), 'Alan', await portrait(), { roomId: r.room.id, expiresAt: r.room.expiresAt });
    await request(0, 'POST', '/portrait', { jobId: job.id }); await s.jobs.idle();
    const ready = s.jobs.get(job.id, owners[0]); assert.equal(ready.status, 'ready'); assert.equal(provider.calls.length, 1); assert.equal(provider.calls[0].expression, 'laugh');
    assert.equal(s.jobs.view(ready).sourceUrl, null); assert.equal(ready.expiresAt, r.room.expiresAt);
    await assert.rejects(assets.read(job.id, 'source.jpg')); await assert.rejects(s.jobs.asset(job.id, owners[0], 'source.jpg')); await assert.rejects(s.jobs.characterBytes(job.id, owners[0]), /original room/);
    const view = await s.shared.view(r.room.id, owners[1]), face = view.players.find(p => p.id === view.hostId)!.avatar!;
    assert.ok(face, 'A finished face is published even if its owner already entered the round');
    assert.equal((await request(1, 'GET', face.replace('/api/rooms/' + r.room.id, ''))).statusCode, 200);
    assert.equal((await request(2, 'GET', face.replace('/api/rooms/' + r.room.id, ''))).statusCode, 403);
    const other = await s.rooms.create(owners[0], { name: 'Alan', fatherName: 'Suresh', characterId: 'sample-balaji', mode: 'shared' }, randomUUID());
    const foreign = await s.jobs.create(owners[0], randomUUID(), 'Alan', await portrait(), { roomId: other.room.id, expiresAt: other.room.expiresAt });
    assert.equal((await request(0, 'POST', '/portrait', { jobId: foreign.id })).statusCode, 403);
    await s.jobs.idle(); now = r.room.expiresAt;
    assert.equal((await request(1, 'GET', face.replace('/api/rooms/' + r.room.id, ''))).statusCode, 410);
    await s.jobs.cleanup(); await s.rooms.cleanup();
    assert.ok((await s.shared.view(r.room.id, owners[0])).players.every(p => !p.avatar));
    await assert.rejects(assets.read(job.id, 'laugh.png'));
  } finally { await s.app.close(); await rm(directory, { recursive: true, force: true }); }
});

test('player photo failure deletes its source and never retries automatically', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'player-face-fail-')), provider = new FixtureProvider(), assets = new DiskAssetStore(directory);
  provider.failures.push(new GenerationError('quota', 'Budget unavailable.', { automatic: true, canRetry: true }));
  const s = await buildApp({ directory, provider, assets });
  try {
    const job = await s.jobs.create('owner', randomUUID(), 'Meera', await portrait(), { roomId: randomUUID(), expiresAt: Date.now() + 3600000 });
    await s.jobs.idle(); assert.equal(provider.calls.length, 1);
    const saved = s.jobs.get(job.id, 'owner'); assert.equal(saved.status, 'failed'); assert.equal(s.jobs.view(saved).error!.canRetry, false);
    await assert.rejects(assets.read(job.id, 'source.jpg')); assert.throws(() => s.jobs.retry(job.id, 'owner', 'laugh', 0), /deleted/);
  } finally { await s.app.close(); await rm(directory, { recursive: true, force: true }); }
});
