import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { SQSClient } from '@aws-sdk/client-sqs';
import { fixture } from './fixture.ts';
import { portrait } from '../fixtures.ts';
import { GenerationError } from '../../src/contracts.ts';
import { DynamoBudget } from '../../src/aws/limits.ts';
import { Outbox } from '../../src/aws/queue.ts';

async function uploaded(f: Awaited<ReturnType<typeof fixture>>, owner = 'owner') {
  const photo = await portrait(), digest = createHash('sha256').update(photo).digest('hex'), key = randomUUID();
  const first = await f.jobs().beginUpload(owner, key, 'Suresh', digest);
  const repeated = await f.jobs().beginUpload(owner, key, 'Suresh', digest); assert.equal(first.job.id, repeated.job.id);
  await assert.rejects(f.jobs().beginUpload(owner, key, 'Different', digest), /changed/);
  await f.assets.write(first.job.id, 'upload.jpg', photo);
  const job = await f.jobs().completeUpload(first.job.id, owner);
  assert.equal((await f.jobs().completeUpload(job.id, owner)).revision, job.revision);
  return job;
}

test('duplicate queue delivery, worker restarts, saved faces and source removal', async () => {
  const f = await fixture();
  try {
    const job = await uploaded(f), message = { jobId: job.id, revision: job.revision };
    f.provider.delayMs = 20; f.assets.failRecoveryDelete = true;
    await Promise.all([f.jobs().process(message), f.jobs().process(message)]);
    assert.equal(f.provider.calls.length, 1);
    const first = await f.jobs().get(job.id, 'owner'); assert.equal(first.status, 'awaiting_approval'); assert.equal(first.baseRevision, 1);
    await assert.rejects(f.jobs().get(job.id, 'outsider'), /could not be found/);
    assert.equal(f.assets.objects.has(`${job.id}/upload.jpg`), false);
    const approved = await f.jobs().approve(job.id, 'owner', 1);
    assert.equal((await f.jobs().approve(job.id, 'owner', 1)).revision, approved.revision);
    for (let i = 0; i < 5; i++) {
      const current = await f.jobs().get(job.id, 'owner');
      await f.jobs().process({ jobId: job.id, revision: current.revision });
    }
    const preview = await f.jobs().get(job.id, 'owner'); assert.equal(preview.status, 'preview'); assert.equal(Object.keys(preview.completed).length, 6);
    assert.equal(f.provider.calls.length, 6);
    const finalized = await f.jobs().finalize(job.id, 'owner', 'Ajith', '#865437');
    assert.equal(finalized.name, 'Ajith'); assert.equal(f.assets.objects.has(`${job.id}/source.jpg`), false);
    assert.equal((await f.jobs().finalize(job.id, 'owner', 'Ajith', '#865437')).revision, finalized.revision);
    assert.ok((await f.jobs().characterBytes(job.id, 'owner')).length > 0);
    const asset = await f.jobs().asset(job.id, 'owner', 'atlas.png'); const expires = Number(new URL(asset.url).searchParams.get('X-Amz-Expires')); assert.ok(expires > 0 && expires <= 60);
    await assert.rejects(f.jobs().asset(job.id, 'owner', 'source.jpg'), /not found/);
    const budget = (await f.db.get('IMAGE_BUDGET'))!.used; assert.equal(budget, 6 * 54780);
    f.advance(86400001); await f.jobs().cleanup(); assert.equal(f.assets.objects.size, 0); assert.equal((await f.db.get('IMAGE_BUDGET'))!.used, budget);
  } finally { await f.close(); }
});

test('quota pauses save progress, spend nothing and can resume without consuming attempts', async () => {
  const f = await fixture();
  try {
    let job = await uploaded(f);
    f.provider.failures.push(new GenerationError('quota', 'Photo generation is paused. Sample artwork is ready to play.', { canRetry: true }));
    await f.jobs().process({ jobId: job.id, revision: job.revision });
    job = await f.jobs().get(job.id, 'owner'); assert.equal(job.status, 'failed'); assert.equal(job.attempts, 0);
    assert.equal((await f.jobs().view(job)).error!.canRetry, false); assert.equal((await f.db.get('IMAGE_BUDGET'))!.used, 0);
    assert.equal((await f.jobs().config()).available, false);
    f.advance(300001);
    assert.equal((await f.jobs().view(job)).error!.canRetry, true);
    job = await f.jobs().retry(job.id, 'owner', 'grin', 0);
    await f.jobs().process({ jobId: job.id, revision: job.revision });
    assert.equal((await f.jobs().get(job.id, 'owner')).status, 'awaiting_approval'); assert.equal(f.provider.calls.length, 2);
  } finally { await f.close(); }
});

test('a timed-out worker recovers its saved image; unknown outcomes pause without another paid call', async () => {
  const f = await fixture();
  try {
    for (const hasResult of [true, false]) {
      const job = await uploaded(f), item = (await f.db.get(`JOB#${job.id}`))!;
      const token = randomUUID(); Object.assign(item.data, { status: 'generating', token, leaseUntil: f.clock() - 1, attempts: 1, stepAttempts: { grin: 1 }, sourcePresent: true });
      item.gcAt = f.clock() - 1; await f.db.put(item);
      await f.assets.write(job.id, 'source.jpg', await portrait());
      await new DynamoBudget(f.db, 1000000, token).reserve();
      if (hasResult) { const result = await f.provider.generate({ photo: await portrait(), expression: 'grin' }); await f.assets.write(job.id, `result-${token}.png`, result.image); }
      const calls = f.provider.calls.length; await Promise.all([f.jobs().cleanup(), f.jobs().cleanup()]);
      const recovered = await f.jobs().get(job.id, 'owner');
      assert.equal(recovered.status, hasResult ? 'awaiting_approval' : 'interrupted');
      if (!hasResult) assert.equal(recovered.error!.uncertain, true);
      assert.equal(f.provider.calls.length, calls, 'Lease recovery must never start another provider request');
      await f.jobs().process({ jobId: job.id, revision: job.revision });
      assert.equal(f.provider.calls.length, calls, 'A stale delivery must not restart work');
    }
    assert.equal((await f.db.get('IMAGE_BUDGET'))!.used, 400000, 'Unsettled requests keep their reservations');
  } finally { await f.close(); }
});

test('transactional outbox survives a queue outage and duplicate delivery is harmless', async () => {
  const f = await fixture();
  try {
    const job = await uploaded(f), pk = `OUTBOX#${job.id}#${job.revision}`;
    const client = new SQSClient({ region: 'local', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
    let outage = true; const sent: string[] = [];
    client.send = (async (command: { input: { MessageBody: string } }) => { if (outage) throw new Error('Simulated queue outage'); sent.push(command.input.MessageBody); return {}; }) as typeof client.send;
    const outbox = new Outbox(f.db, 'fixture-queue', client);
    await assert.rejects(outbox.dispatch(pk), /outage/); assert.ok(await f.db.get(pk));
    outage = false; await Promise.all([outbox.dispatch(pk), outbox.dispatch(pk)]);
    assert.ok(sent.length >= 1); assert.equal(await f.db.get(pk), undefined);
    await Promise.all(sent.map(body => f.jobs().process(JSON.parse(body)))); assert.equal(f.provider.calls.length, 1);
    assert.ok(sent.every(body => !body.includes('owner') && !body.includes('photo'))); client.destroy();
  } finally { await f.close(); }
});
