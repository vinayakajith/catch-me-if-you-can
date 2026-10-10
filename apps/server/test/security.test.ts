import test from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { classifyProviderError, OpenAIImageProvider } from '../src/provider.ts';
import { MemoryRateLimiter, publicOrigin } from '../src/security.ts';
import { buildApp } from '../src/app.ts';
import { FixtureProvider, portrait } from './fixtures.ts';

test('billing codes pause instead of retrying; provider details never reach the player', () => {
  for (const code of ['insufficient_quota', 'credit_balance_exhausted', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded']) {
    const fault = classifyProviderError(new OpenAI.APIError(429, { code }, 'private provider details', new Headers()));
    assert.equal(fault.code, 'quota'); assert.equal(fault.automatic, false); assert.equal(fault.canRetry, true); assert.ok(!fault.message.includes('private'));
  }
  const limited = classifyProviderError(new OpenAI.APIError(429, { code: 'rate_limit_exceeded' }, 'private', new Headers({ 'retry-after': '12' })));
  assert.equal(limited.automatic, true); assert.equal(limited.retryDelayMs, 12000);
});

test('invalid API access opens a cooldown without more image requests, then allows explicit recovery', async () => {
  let calls = 0, now = 1000;
  const provider = new OpenAIImageProvider({ apiKey: 'fixture-only', clock: () => now, fetch: async url => { if (String(url).startsWith('data:')) return new Response(''); calls++; return new Response(JSON.stringify({ error: { code: 'invalid_api_key', message: 'private provider details' } }), { status: 401, headers: { 'content-type': 'application/json' } }); } });
  const input = { photo: await portrait(), expression: 'grin' as const };
  await assert.rejects(provider.generate(input), error => (error as { code: string }).code === 'access');
  assert.equal(provider.available, false);
  await assert.rejects(provider.generate(input), error => (error as { code: string }).code === 'service_paused');
  assert.equal(calls, 1); now += 300001; assert.equal(provider.available, true);
});

test('public origin, secure session, safe errors and rate limits protect public creation', async () => {
  assert.throws(() => publicOrigin('http://example.com'));
  const directory = await mkdtemp(join(tmpdir(), 'father-security-'));
  const { app } = await buildApp({ directory, provider: new FixtureProvider(), publicOrigin: 'https://hunt.example.com' });
  try {
    const setup = await app.inject({ url: '/api/rooms/config', headers: { host: 'untrusted.example' } });
    assert.equal(setup.json().shareOrigin, 'https://hunt.example.com'); assert.equal(setup.json().public, true);
    assert.match(String(setup.headers['set-cookie']), /Secure/); assert.match(String(setup.headers['set-cookie']), /HttpOnly/);
    const cookie = setup.cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const headers = { 'x-fh-request': '1', origin: 'https://hunt.example.com', cookie, 'idempotency-key': randomUUID() };
    const payload = { name: 'Alan', fatherName: 'Suresh', characterId: 'sample-balaji' };
    assert.equal((await app.inject({ method: 'POST', url: '/api/rooms', headers: { ...headers, origin: 'http://hunt.example.com' }, payload })).statusCode, 403);
    const { origin: _origin, ...withoutOrigin } = headers;
    assert.equal((await app.inject({ method: 'POST', url: '/api/rooms', headers: withoutOrigin, payload })).statusCode, 403);
    for (let i = 0; i < 20; i++) assert.equal((await app.inject({ method: 'POST', url: '/api/rooms', headers: { ...headers, 'idempotency-key': randomUUID() }, payload })).statusCode, 200);
    const limited = await app.inject({ method: 'POST', url: '/api/rooms', headers, payload });
    assert.equal(limited.statusCode, 429); assert.ok(limited.headers['retry-after']);
    assert.equal((await app.inject({ url: '/api/characters/config', headers: { cookie } })).statusCode, 200, 'Creation limits do not block play');
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  const limiter = new MemoryRateLimiter();
  assert.equal(limiter.take('one', 1, 1000, 1), true); assert.equal(limiter.take('one', 1, 1000, 2), false); assert.equal(limiter.take('one', 1, 1000, 1001), true);
});
