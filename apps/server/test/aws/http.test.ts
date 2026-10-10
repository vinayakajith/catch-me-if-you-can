import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import awsLambdaFastify from '@fastify/aws-lambda';
import { S3Client } from '@aws-sdk/client-s3';
import { fixture } from './fixture.ts';
import { buildApp } from '../../src/app.ts';
import { registerUploads, authenticateOrigin, viewerIp } from '../../src/aws/api.ts';
import { DynamoRoomStore } from '../../src/aws/room-store.ts';
import { DynamoRateLimiter } from '../../src/aws/limits.ts';
import { S3Assets } from '../../src/aws/assets.ts';
import { portrait } from '../fixtures.ts';

test('HTTP API v2 preserves private cookies, public invite origin and the S3 upload handshake', async () => {
  const f = await fixture();
  const { app } = await buildApp({ directory: '/unused-fixture', provider: f.provider, jobs: f.jobs(), assets: f.assets, roomStore: new DynamoRoomStore(f.db), limiter: new DynamoRateLimiter(f.db), publicOrigin: 'https://hunt.example.com', background: false });
  registerUploads(app, f.jobs());
  const proxy = awsLambdaFastify(app, { decorateRequest: false, serializeLambdaArguments: false }); await app.ready();
  let cookies: string[] = [];
  async function request(path: string, data?: object, origin = 'https://hunt.example.com', key = randomUUID()) {
    const response = await proxy({ version: '2.0', routeKey: '$default', rawPath: path, rawQueryString: '', headers: { host: 'gateway.execute-api.local', origin, 'content-type': 'application/json', 'x-fh-request': '1', 'idempotency-key': key }, cookies,
      requestContext: { accountId: 'local', apiId: 'local', domainName: 'gateway.execute-api.local', domainPrefix: 'gateway', http: { method: data ? 'POST' : 'GET', path, protocol: 'HTTP/1.1', sourceIp: '192.0.2.4', userAgent: 'fixture' }, requestId: randomUUID(), routeKey: '$default', stage: '$default', time: '', timeEpoch: Date.now() }, body: data ? JSON.stringify(data) : undefined, isBase64Encoded: false } as any, {} as any);
    if (response.cookies?.length) cookies = response.cookies.map(c => c.split(';')[0]);
    return response;
  }
  try {
    const config = await request('/api/rooms/config'); assert.match(config.cookies![0], /HttpOnly/); assert.match(config.cookies![0], /Secure/); assert.match(config.cookies![0], /SameSite=Strict/);
    assert.equal(JSON.parse(config.body).shareOrigin, 'https://hunt.example.com');
    const create = { name: 'Alan', fatherName: 'Suresh', characterId: 'sample-balaji' };
    assert.equal((await request('/api/rooms', create, 'https://bad.example')).statusCode, 403);
    const created = await request('/api/rooms', create); assert.equal(created.statusCode, 200); assert.equal(JSON.parse(created.body).room.capacity, 5);
    const photo = await portrait(), digest = createHash('sha256').update(photo).digest('hex');
    const initiated = await request('/api/characters/uploads', { name: 'Suresh', digest }); assert.equal(initiated.statusCode, 202);
    const upload = JSON.parse(initiated.body); await f.assets.write(upload.job.id, 'upload.jpg', photo);
    const complete = await request(`/api/characters/uploads/${upload.job.id}/complete`, {}); assert.equal(complete.statusCode, 202); assert.equal(JSON.parse(complete.body).status, 'queued');
    assert.equal(f.provider.calls.length, 0, 'The HTTP Lambda never generates an image');
    cookies = []; assert.equal((await request(`/api/characters/${upload.job.id}`)).statusCode, 404);
    assert.equal(authenticateOrigin({ 'x-fh-origin': 'x'.repeat(32) }, 'x'.repeat(32)), true); assert.equal(authenticateOrigin({}, 'x'.repeat(32)), false);
    assert.equal(viewerIp('192.0.2.4:43523'), '192.0.2.4'); assert.equal(viewerIp('[2001:db8::1]:443'), '2001:db8::1'); assert.equal(viewerIp('forged'), undefined);
  } finally { await app.close(); await f.close(); }
});

test('signed upload policies cap size and bind one private key; storage never swallows partial deletion', async () => {
  const client = new S3Client({ region: 'ap-south-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
  const assets = new S3Assets('fixture-assets', client), id = randomUUID();
  try {
    const signed = await assets.upload(id), policy = JSON.parse(Buffer.from(signed.fields.Policy, 'base64').toString());
    assert.ok(policy.conditions.some((c: unknown) => JSON.stringify(c) === JSON.stringify(['content-length-range', 1, 10 * 1024 * 1024])));
    assert.equal(signed.fields.key, `${id}/upload.jpg`); assert.equal(signed.fields['x-amz-server-side-encryption'], 'AES256');
    assert.throws(() => assets.key(id, '../source.jpg'), /Invalid/);
    client.send = (async (command: { constructor: { name: string } }) => command.constructor.name === 'ListObjectsV2Command' ? { Contents: [{ Key: `${id}/source.jpg` }] } : { Errors: [{ Code: 'AccessDenied' }] }) as typeof client.send;
    await assert.rejects(assets.remove(id), /Cleanup must retry/);
  } finally { client.destroy(); }
});
