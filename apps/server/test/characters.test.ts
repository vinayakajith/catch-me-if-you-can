import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { CHARACTER_RETENTION_MS, EXPRESSIONS } from '../../../packages/game-core/src/index.ts';
import { CharacterJobs } from '../src/jobs.ts';
import { DiskAssetStore, SqliteJobStore } from '../src/storage.ts';
import { GenerationError } from '../src/contracts.ts';
import { normalizeHead, normalizePhoto } from '../src/images.ts';
import { FixtureProvider, portrait } from './fixtures.ts';
import { buildApp } from '../src/app.ts';
import { OpenAIImageProvider, validateImageRequest } from '../src/provider.ts';

async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const directory = await mkdtemp(join(tmpdir(), 'father-hunter-'));
  const store = new SqliteJobStore(directory), assets = new DiskAssetStore(directory), provider = new FixtureProvider();
  let now = 1000;
  const jobs = new CharacterJobs({ store, assets, provider, clock: () => now, retryDelayMs: 1 });
  await jobs.initialize();
  t.after(async () => { await jobs.close(); await rm(directory, { recursive: true, force: true }); });
  return { jobs, assets, store, provider, advance: (ms: number) => { now += ms; }, directory };
}

test('one paid base, explicit approval, five anchored edits, atlas and private source deletion', async t => {
  const { jobs, assets, provider } = await setup(t);
  const initial = await jobs.create('owner', 'creation-key-1234', 'Ajith', await portrait());
  await jobs.idle();
  let job = jobs.get(initial.id, 'owner');
  assert.equal(job.status, 'awaiting_approval'); assert.equal(provider.calls.length, 1);
  assert.equal(jobs.view(job).preview?.columns, 3);
  assert.throws(() => jobs.approve(job.id, 'owner', 99), /preview changed/);
  jobs.approve(job.id, 'owner', 1); jobs.approve(job.id, 'owner', 1);
  await jobs.idle(); job = jobs.get(job.id, 'owner');
  assert.equal(job.status, 'preview'); assert.equal(provider.calls.length, 6);
  for (const call of provider.calls.slice(1)) {
    assert.deepEqual(call.base, provider.calls[1].base, 'Every expression starts from the same approved base');
    assert.deepEqual(call.photo, provider.calls[0].photo);
  }
  const atlas = await assets.read(job.id, 'atlas.png'), meta = await sharp(atlas).metadata();
  assert.equal(meta.width, 1536); assert.equal(meta.height, 1024); assert.equal(meta.hasAlpha, true);
  assert.equal(job.usage.length, 6);
  job = await jobs.finalize(job.id, 'owner', 'Appa', '#a87048');
  assert.equal(job.status, 'ready'); assert.equal(jobs.view(job).preview?.palette?.skin, '#a87048');
  assert.equal(jobs.view(job).sourceUrl, null); await assert.rejects(assets.read(job.id, 'source.jpg'));
  await jobs.finalize(job.id, 'owner', 'Appa', '#a87048'); assert.equal(provider.calls.length, 6);
});

test('concurrent double uploads use one job, one generation and reject changed payloads', async t => {
  const { jobs, provider } = await setup(t), photo = await portrait();
  const [a, b] = await Promise.all([jobs.create('owner', 'creation-key-1234', 'Dad', photo), jobs.create('owner', 'creation-key-1234', 'Dad', photo)]);
  assert.equal(a.id, b.id); await jobs.idle(); assert.equal(provider.calls.length, 1);
  await assert.rejects(jobs.create('owner', 'creation-key-1234', 'Different', photo), /upload has changed/);
  assert.throws(() => jobs.get(a.id, 'other'), /not be found/);
  assert.equal(jobs.findUpload('owner', 'creation-key-1234').id, a.id);
  assert.throws(() => jobs.findUpload('other', 'creation-key-1234'), /not reached/);
});

test('transient failures retry only their step; quota and uncertain outcomes never auto-retry', async t => {
  const { jobs, provider } = await setup(t);
  provider.failures.push(new GenerationError('temporary', 'busy', { canRetry: true, automatic: true }));
  const initial = await jobs.create('owner', 'retry-key-1234567', 'Dad', await portrait()); await jobs.idle();
  let job = jobs.get(initial.id, 'owner'); assert.equal(job.status, 'awaiting_approval'); assert.equal(job.attempts, 2);
  provider.failures.push(new GenerationError('interrupted', 'uncertain', { canRetry: true, uncertain: true }));
  jobs.approve(job.id, 'owner', 1); await jobs.idle(); job = jobs.get(job.id, 'owner');
  assert.equal(job.status, 'interrupted'); assert.equal(provider.calls.length, 3);
  jobs.retry(job.id, 'owner', 'serious', 1); await jobs.idle(); job = jobs.get(job.id, 'owner');
  assert.equal(job.status, 'preview'); assert.equal(job.attempts, 8);
  assert.equal(jobs.view(job).remainingAttempts, 0); assert.throws(() => jobs.retry(job.id, 'owner', 'laugh', 1), /retry allowance/);
  provider.failures.push(new GenerationError('quota', 'budget reached'));
  const other = await jobs.create('owner', 'quota-key-1234567', 'Dad', await portrait()); await jobs.idle();
  assert.equal(jobs.get(other.id, 'owner').attempts, 1); assert.equal(jobs.view(jobs.get(other.id, 'owner')).error?.canRetry, false);
});

test('a stored in-flight request becomes interrupted after restart without another call', async t => {
  const { jobs, store, provider } = await setup(t);
  const initial = await jobs.create('owner', 'restart-key-1234', 'Dad', await portrait()); await jobs.idle();
  const job = jobs.get(initial.id, 'owner'); job.status = 'generating'; job.currentExpression = 'serious'; job.baseApproved = true; job.attempts++; job.stepAttempts.serious = 1; store.save(job);
  await jobs.initialize(); await jobs.idle();
  assert.equal(jobs.get(job.id, 'owner').status, 'interrupted'); assert.equal(provider.calls.length, 1);
  assert.equal(jobs.view(jobs.get(job.id, 'owner')).error?.uncertain, true);
});

test('budget pauses preserve retry allowance and resume only missing faces, including legacy failures', async t => {
  const { jobs, provider, store, assets } = await setup(t);
  const capped = provider as FixtureProvider & { canAffordGeneration: boolean };
  capped.canAffordGeneration = true;
  const generate = provider.generate.bind(provider);
  provider.generate = async input => {
    if (provider.calls.length === 2 && capped.canAffordGeneration) capped.canAffordGeneration = false;
    if (!capped.canAffordGeneration) throw new GenerationError('development_budget', 'Waiting for budget headroom', { canRetry: true });
    return generate(input);
  };
  const initial = await jobs.create('owner', 'budget-paused-job', 'Dad', await portrait()); await jobs.idle();
  jobs.approve(initial.id, 'owner', 1); await jobs.idle();
  let job = jobs.get(initial.id, 'owner');
  assert.equal(job.status, 'failed'); assert.equal(job.attempts, 2); assert.equal(job.stepAttempts.laugh, 0);
  assert.equal(jobs.view(job).error?.canRetry, false);
  assert.throws(() => jobs.retry(job.id, 'owner', 'laugh', 1), /budget/);
  const grin = await assets.read(job.id, 'grin.png'), serious = await assets.read(job.id, 'serious.png');
  provider.generate = generate; capped.canAffordGeneration = true;
  job.error!.canRetry = false; store.save(job); // Old code marked budget failures permanently unretryable.
  assert.equal(jobs.view(job).error?.canRetry, true);
  jobs.retry(job.id, 'owner', 'laugh', 1); await jobs.idle(); job = jobs.get(job.id, 'owner');
  assert.equal(job.status, 'preview'); assert.equal(job.attempts, 6);
  assert.deepEqual(provider.calls.map(call => call.expression), ['grin', 'serious', 'laugh', 'giggle', 'bonked', 'dizzy']);
  assert.deepEqual(await assets.read(job.id, 'grin.png'), grin); assert.deepEqual(await assets.read(job.id, 'serious.png'), serious);
});

test('the paid request profile rejects oversized inputs, prompts and unpinned models before generation', async () => {
  const input = { photo: await portrait() };
  await validateImageRequest(input, 'A head');
  await assert.rejects(validateImageRequest(input, 'x'.repeat(4097)), /prompt limit/);
  const oversized = await sharp({ create: { width: 1025, height: 1024, channels: 3, background: '#ccc' } }).png().toBuffer();
  await assert.rejects(validateImageRequest({ ...input, base: oversized }, 'A head'), /image limits/);
  assert.throws(() => new OpenAIImageProvider({ model: 'gpt-image-2.5-sunburst' }), /pinned/);
});

test('restart recovers a saved upload and rejects an incomplete upload without generating twice', async t => {
  const { jobs, store, assets, provider } = await setup(t);
  const initial = await jobs.create('owner', 'upload-template-1234', 'Dad', await portrait()); await jobs.idle();
  const template = jobs.get(initial.id, 'owner');
  const staged = { ...template, id: randomUUID(), idempotencyKey: 'saved-upload-1234', status: 'uploading' as const, completed: {}, attempts: 0, stepAttempts: {}, currentExpression: 'grin' as const, baseRevision: 0, atlasRevision: 0 };
  const missing = { ...staged, id: randomUUID(), idempotencyKey: 'missing-upload-1234' };
  await assets.write(staged.id, 'source.jpg', await portrait()); store.save(staged); store.save(missing);
  await jobs.initialize(); await jobs.idle();
  assert.equal(jobs.findUpload('owner', staged.idempotencyKey).status, 'awaiting_approval');
  assert.equal(jobs.get(missing.id, 'owner').error?.code, 'upload_incomplete');
  assert.equal(jobs.view(jobs.get(missing.id, 'owner')).sourceUrl, null);
  assert.equal(provider.calls.length, 2, 'Only the saved upload generates a new head');
  await jobs.initialize(); await jobs.idle(); assert.equal(provider.calls.length, 2);
});

test('expiry immediately denies reads and removes original and generated assets', async t => {
  const { jobs, assets, advance } = await setup(t);
  const initial = await jobs.create('owner', 'expiry-key-12345', 'Dad', await portrait()); await jobs.idle();
  advance(CHARACTER_RETENTION_MS);
  assert.throws(() => jobs.get(initial.id, 'owner'), /expired/);
  await jobs.cleanup(); await assert.rejects(assets.read(initial.id, 'atlas.png'));
});

test('all six fixture heads normalize; opaque, clipped and invalid uploads are rejected', async () => {
  const provider = new FixtureProvider();
  for (const expression of EXPRESSIONS) {
    const { image } = await provider.generate({ photo: await portrait(), expression });
    const head = await normalizeHead(image), meta = await sharp(head.image).metadata();
    assert.equal(meta.width, 512); assert.equal(meta.hasAlpha, true); assert.match(head.skin, /^#[a-f0-9]{6}$/);
  }
  await assert.rejects(normalizeHead(await portrait()), /transparent/);
  await assert.rejects(normalizePhoto(Buffer.from('<svg></svg>')), /clear JPG/);
  const brightSkin = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><ellipse cx="256" cy="256" rx="170" ry="180" fill="#ffa854"/></svg>')).png().toBuffer();
  assert.equal((await normalizeHead(brightSkin)).skin, '#fca854', 'Bright skin must not be discarded as a white highlight');
  const original = await sharp(await portrait()).withMetadata({ orientation: 6 }).toBuffer();
  const normalized = await sharp(await normalizePhoto(original)).metadata();
  assert.equal(normalized.orientation, undefined); assert.equal(normalized.width, 800);
});

test('HTTP creation requires same-origin action header and assets belong to their cookie owner', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'father-hunter-http-'));
  const { app, jobs } = await buildApp({ directory, provider: new FixtureProvider(), retryDelayMs: 1 });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const config = await app.inject('/api/characters/config');
  assert.equal(config.statusCode, 200); assert.match(String(config.headers['set-cookie']), /HttpOnly/);
  const rejected = await app.inject({ method: 'POST', url: '/api/characters', payload: {} }); assert.equal(rejected.statusCode, 403);
  const foreign = await app.inject({ method: 'POST', url: '/api/characters', headers: { 'x-fh-request': '1', origin: 'https://elsewhere.example' }, payload: {} }); assert.equal(foreign.statusCode, 403);
  const unavailable = await app.inject('/api/characters/not-a-job/assets/source.jpg'); assert.equal(unavailable.statusCode, 404);
  const cookie = String(config.headers['set-cookie']).split(';')[0];
  const owner = createHash('sha256').update(cookie.split('=')[1]).digest('hex');
  const job = await jobs.create(owner, 'lost-upload-response', 'Dad', await portrait()); await jobs.idle();
  const lookup = await app.inject({ url: '/api/characters/uploads/lost-upload-response', headers: { cookie } });
  assert.equal(lookup.statusCode, 200); assert.equal(lookup.json().id, job.id);
  const stranger = await app.inject('/api/characters/uploads/lost-upload-response'); assert.equal(stranger.statusCode, 404);
  assert.equal((await app.inject({ url: `/api/characters/${job.id}/assets/atlas.png`, headers: { cookie } })).statusCode, 200);
  assert.equal((await app.inject(`/api/characters/${job.id}/assets/atlas.png`)).statusCode, 404);
});
