import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacterJob, recoverCharacterUpload, rememberCharacterJob, pendingCharacterUpload } from '../src/character-api.ts';
import { RoomClient } from '../src/room-api.ts';
import { LocalHuntSession, type RoomView } from '../../../packages/game-core/src/index.ts';

test('direct cloud upload recovers a lost completion without re-uploading or creating another job', async () => {
  const storage = new Map<string, string>();
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
  const original = globalThis.fetch; let begins = 0, uploads = 0, completions = 0, lost = true;
  const json = (data: object) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/config')) return json({ available: true, uploadMode: 's3' });
    if (url.endsWith('/uploads')) { begins++; const body = JSON.parse(init!.body as string); assert.match(body.digest, /^[a-f0-9]{64}$/); assert.equal(body.name, 'Suresh'); return json({ job: { id: 'job-one', status: 'uploading' }, upload: { url: 'https://fixture-upload.test/', fields: { key: 'one-upload', policy: 'fixture' } } }); }
    if (url === 'https://fixture-upload.test/') { uploads++; assert.equal(init!.credentials, 'omit'); assert.equal(init!.headers, undefined); assert.ok((init!.body as FormData).get('file')); return new Response(null, { status: 204 }); }
    if (url.endsWith('/complete')) { completions++; if (lost) { lost = false; throw new Error('Lost acknowledgement'); } return json({ id: 'job-one', status: 'queued' }); }
    if (url.includes('/uploads/')) return json({ id: 'job-one', status: 'uploading' });
    throw new Error(`Unexpected test URL: ${url}`);
  };
  try {
    await assert.rejects(createCharacterJob(new Blob(['fixture']), 'Suresh', 'one-request-key'), /Connection lost/);
    assert.equal(pendingCharacterUpload(), 'one-request-key');
    const recovered = await recoverCharacterUpload(); assert.equal(recovered!.status, 'queued'); assert.equal(pendingCharacterUpload(), null);
    assert.equal(begins, 1); assert.equal(uploads, 1); assert.equal(completions, 2);
  } finally { globalThis.fetch = original; if (old) Object.defineProperty(globalThis, 'localStorage', old); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});

test('late shared polls and old attempts cannot roll back movement, scores or a replay', () => {
  const client = new RoomClient('fixture');
  const snapshot = new LocalHuntSession('Alan', 'fixture', () => 1000, true).getSnapshot();
  const first = { revision: 1, serverNow: 1000, cursor: 0, room: { status: 'open' }, attempt: { id: 'one', ack: 5, snapshot } } as RoomView;
  client.accept(first);
  client.accept({ ...first, serverNow: 1100, attempt: { ...first.attempt!, ack: 2 } });
  assert.equal(client.getSnapshot().view!.attempt!.ack, 5);
  client.accept({ ...first, revision: 2, cursor: 1, serverNow: 1101, attempt: { ...first.attempt!, ack: 3 } });
  assert.equal(client.getSnapshot().view!.cursor, 1); assert.equal(client.getSnapshot().view!.attempt!.ack, 5);
  const replay = { ...first, revision: 2, serverNow: 130000, attempt: { id: 'two', ack: 0, snapshot: { ...snapshot, startedAt: 130000 } } };
  client.accept(replay); client.accept({ ...first, revision: 2, serverNow: 130001, attempt: { ...first.attempt!, ack: 1000 } });
  assert.equal(client.getSnapshot().view!.attempt!.id, 'two'); assert.equal(client.getSnapshot().view!.attempt!.ack, 0);
  client.accept({ ...replay, serverNow: 3600000, room: { ...first.room, status: 'closed' }, attempt: null });
  assert.equal(client.getSnapshot().view!.attempt, null);
});
