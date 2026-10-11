import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { createServer } from 'vite';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../apps/server/src/app.ts';
import { FixtureProvider, portrait } from '../apps/server/test/fixtures.ts';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const directory = await mkdtemp(join(tmpdir(), 'shared-browser-')); let offset = 0;
const provider = new FixtureProvider();
const server = await buildApp({ directory, provider, clock: () => Date.now() + offset });
const originalSend = server.realtime.send, originalMessage = server.realtime.message.bind(server.realtime);
let latency = 75, dropCatchReply = true, droppedCatchReply = false;
server.realtime.send = async (...args) => {
  await sleep(latency);
  const message = args[1];
  if (dropCatchReply && message.type === 'state' && message.requestId && message.results?.some(r => r.result.kind === 'catch' && r.result.ok)) {
    dropCatchReply = false; droppedCatchReply = true; return;
  }
  return originalSend(...args);
};
server.realtime.message = async (...args) => { await sleep(latency); return originalMessage(...args); };
let vite, browser; const pages = [], errors = [];
const artifacts = fileURLToPath(new URL('../artifacts/', import.meta.url)); await mkdir(artifacts, { recursive: true });
try {
  const address = await server.app.listen({ host: '127.0.0.1', port: 0 });
  vite = await createServer({ root: fileURLToPath(new URL('../apps/web', import.meta.url)), logLevel: 'error', server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: address, changeOrigin: false, ws: true } } } });
  await vite.listen(); const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch();
  for (let i = 0; i < 5; i++) {
    const context = await browser.newContext(i % 2 ? { ...devices['iPhone 13'], viewport: { width: 844, height: 390 } } : { viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); pages.push(page); page.on('pageerror', e => errors.push(e.message));
  }
  const host = pages[0]; await host.goto(base + '/?test=1');
  await host.locator('#player-name').fill('Alan'); await host.locator('#father-name').fill('Suresh');
  await host.getByRole('button', { name: 'Create hunt', exact: true }).click(); await host.getByRole('button', { name: 'I’m ready', exact: true }).waitFor();
  const path = new URL(host.url()).pathname;
  await host.goto(base + path + '?test=1');
  await Promise.all(pages.slice(1).map(async (p, i) => { await p.goto(base + path + '?test=1'); await p.getByLabel('Your name', { exact: true }).fill(['Meera', 'Aravind', 'Ravi', 'Vinayak'][i]); await p.getByRole('button', { name: 'Join the crew', exact: true }).click(); await p.getByRole('button', { name: 'I’m ready', exact: true }).waitFor(); }));
  await host.waitForFunction(() => document.querySelectorAll('.crew-member').length === 5);
  await host.getByRole('button', { name: 'Upload my photo', exact: true }).click();
  await host.getByLabel('a portrait photo', { exact: true }).setInputFiles({ name: 'player.jpg', mimeType: 'image/jpeg', buffer: await portrait() });
  await host.getByRole('button', { name: 'Make my laughing face', exact: true }).click();
  await host.getByText('Your face is ready. Same face, every glorious bonk.', { exact: true }).waitFor();
  assert.equal(provider.calls.length, 1, 'A player needs only one generated laughing face');
  const phone = pages[1]; await phone.getByRole('button', { name: 'Try one catch', exact: true }).tap();
  await phone.waitForFunction(() => window.__huntTest?.session.getSnapshot().status === 'playing');
  await sleep(600); // Let the following camera settle before calculating a real touch coordinate.
  await phone.screenshot({ path: join(artifacts, 'shared-phone-practice.png') });
  const face = await phone.evaluate(() => window.__huntTest.screen(window.__huntTest.face('practice-statue')));
  await phone.touchscreen.tap(face.x, face.y);
  await phone.getByText('That’s it. One tap, one sack.', { exact: true }).waitFor();
  await phone.getByRole('button', { name: 'Back to my crew', exact: true }).tap();
  console.log('PASS mobile practice: a single touch approaches and catches without joystick knowledge');
  // Prevent headless desktop fullscreen from changing the test viewport.
  await Promise.all(pages.map(async p => { await p.evaluate(() => { document.documentElement.requestFullscreen = undefined; }); await p.getByRole('button', { name: 'I’m ready', exact: true }).click(); }));
  await host.getByRole('button', { name: 'Start the hunt', exact: true }).click();
  await Promise.all(pages.map(p => p.waitForFunction(() => window.__huntTest?.session.getSnapshot().status === 'playing')));
  const ids = await Promise.all(pages.map(p => p.evaluate(() => window.__huntTest.session.getSnapshot().id))); assert.equal(new Set(ids).size, 1);
  await sleep(1000);
  for (const p of pages) { assert.equal(await p.evaluate(() => window.__huntTest.scene.peers.size), 4); assert.ok(Math.abs(await p.evaluate(() => window.__huntTest.scene.hunter.displayHeight) - 60) < .01); }
  const hostId = await host.evaluate(() => window.__huntTest.session.client.getSnapshot().view.me);
  await Promise.all(pages.map(p => p.waitForFunction(id => {
    const scene = window.__huntTest.scene, view = window.__huntTest.session.client.getSnapshot().view;
    const player = view.players.find(p => p.id === id), key = scene.playerTextures.get(`${id}:${player.avatar}`);
    return player.avatar && scene.textures.exists(key);
  }, hostId)));
  const avatar = await host.evaluate(() => window.__huntTest.session.client.getSnapshot().view.players.find(p => p.id === window.__huntTest.session.client.getSnapshot().view.me).avatar);
  const stranger = await browser.newContext(); assert.equal((await stranger.request.get(base + avatar)).status(), 403); await stranger.close();
  console.log('PASS one laughing photo is shared with the crew, rendered on all five witches, and private to this room');
  assert.equal(await phone.locator('.arena-board').isVisible(), false);
  assert.equal(await host.locator('.arena-board').isVisible(), true);
  await phone.screenshot({ path: join(artifacts, 'shared-phone-landscape.png') });
  const initial = await Promise.all(pages.map(p => p.evaluate(() => window.__huntTest.session.getSnapshot().player.position)));
  await Promise.all(pages.map(p => p.evaluate(() => window.__huntTest.tap(window.__huntTest.face('living-statue')))));
  await sleep(700);
  for (let i = 0; i < 5; i++) {
    const pos = await pages[i].evaluate(() => window.__huntTest.session.getSnapshot().player.position);
    assert.ok(Math.hypot(pos.x - initial[i].x, pos.y - initial[i].y) > 25, 'All players begin walking promptly');
  }
  await host.waitForFunction(() => window.__huntTest.session.client.getSnapshot().view.players.reduce((n, p) => n + p.score, 0) === 1, undefined, { timeout: 15000 });
  await sleep(2600);
  for (const p of pages) assert.equal(await p.evaluate(() => window.__huntTest.session.client.getSnapshot().view.players.reduce((n, p) => n + p.score, 0)), 1);
  assert.ok(droppedCatchReply, 'The winning receipt was deliberately lost');
  const deadline = await host.evaluate(() => window.__huntTest.session.getSnapshot().endsAt);
  await phone.evaluate(() => window.__huntTest.session.client.ws.close());
  await phone.waitForFunction(() => !window.__huntTest.session.client.getSnapshot().connected);
  await phone.waitForFunction(() => window.__huntTest.session.client.getSnapshot().connected);
  await host.reload(); await host.waitForFunction(() => window.__huntTest?.session.getSnapshot().status === 'playing');
  assert.equal(await host.evaluate(() => window.__huntTest.session.getSnapshot().endsAt), deadline);
  assert.equal(await host.evaluate(() => window.__huntTest.session.client.getSnapshot().view.players.reduce((n, p) => n + p.score, 0)), 1);
  console.log('PASS lost catch receipt, socket reconnect and page reload preserve one point and the original deadline');
  console.log('PASS five visible coloured players, one shared round and a single winning catch at 150 ms simulated RTT');
  latency = 400;
  await Promise.all(pages.map(p => p.getByRole('button', { name: 'Open house map', exact: true }).click()));
  await Promise.all(pages.map(p => p.getByRole('button', { name: 'Walk to Kitchen', exact: true }).click()));
  await sleep(12000);
  for (const p of pages) assert.equal(await p.evaluate(() => window.__huntTest.session.getSnapshot().player.roomId), 'kitchen', 'One map tap navigates through doors under 800 ms RTT');
  await phone.setViewportSize({ width: 390, height: 844 }); await sleep(500);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await phone.screenshot({ path: join(artifacts, 'shared-phone-portrait.png') });
  await host.screenshot({ path: join(artifacts, 'shared-desktop.png') });
  offset += 125000;
  await Promise.all(pages.map(p => p.getByRole('dialog', { name: 'Hunt results', exact: true }).waitFor({ timeout: 15000 })));
  assert.equal(await phone.getByRole('list', { name: 'Final scores', exact: true }).isVisible(), true);
  // Advancing the fixture clock also simulates a long heartbeat gap, so the
  // first returning player can become host. Use the server-selected host.
  const rematchHost = await host.evaluate(() => window.__huntTest.session.client.getSnapshot().view.hostId);
  const playerIds = await Promise.all(pages.map(p => p.evaluate(() => window.__huntTest.session.client.getSnapshot().view.me)));
  await pages[playerIds.indexOf(rematchHost)].getByRole('button', { name: 'Back to lobby · rematch', exact: true }).click();
  await Promise.all(pages.map(p => p.getByRole('button', { name: 'I’m ready', exact: true }).waitFor()));
  assert.deepEqual(errors, []);
  console.log('PASS 800 ms movement recovery, portrait fallback, mobile final scores and shared rematch; no browser exceptions');
} finally { await browser?.close(); await vite?.close(); await server.app.close(); await rm(directory, { recursive: true, force: true }); }
