import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { createServer } from 'vite';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { buildApp } from '../apps/server/src/app.ts';
import { FixtureProvider, portrait } from '../apps/server/test/fixtures.ts';
import { HOUSE, distance } from '../packages/game-core/src/index.ts';

const directory = await mkdtemp(join(tmpdir(), 'father-multi-browser-'));
const provider = new FixtureProvider(); let offset = 0;
const { app, jobs } = await buildApp({ directory, provider, clock: () => Date.now() + offset });
const artifacts = fileURLToPath(new URL('../artifacts/', import.meta.url)); await mkdir(artifacts, { recursive: true });
let browser, vite;
const errors = [], pages = [], contexts = [];
const smoke = process.env.FATHER_HUNTER_MULTIPLAYER_SMOKE === '1';
try {
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  vite = await createServer({ root: fileURLToPath(new URL('../apps/web', import.meta.url)), logLevel: 'error', server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: address, changeOrigin: false } } } });
  await vite.listen(); const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch();
  for (let i = 0; i < 5; i++) {
    const context = await browser.newContext(i % 2 ? { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } : { viewport: { width: 1440, height: 960 } });
    contexts.push(context); const page = await context.newPage(); pages.push(page); page.on('pageerror', error => errors.push(error.message));
  }
  const host = pages[0]; await host.goto(base, { waitUntil: 'networkidle' });
  await host.request.get(`${base}/api/characters/config`);
  const owner = createHash('sha256').update((await contexts[0].cookies(`${base}/api`)).find(c => c.name === 'fh-owner').value).digest('hex');
  const job = await jobs.create(owner, randomUUID(), 'Suresh', await portrait());
  const waitForJob = async status => {
    for (let i = 0; i < 300; i++) { if (jobs.get(job.id, owner).status === status) return; await new Promise(resolve => setTimeout(resolve, 20)); }
    throw new Error(`Fixture character did not reach ${status}`);
  };
  await waitForJob('awaiting_approval'); jobs.approve(job.id, owner, 1); await waitForJob('preview');
  await jobs.finalize(job.id, owner, 'Suresh', '#865437');
  await host.evaluate(id => { localStorage.setItem('fh-character-job', id); localStorage.setItem('fh-father-name', 'Suresh'); }, job.id);
  await host.reload(); await host.getByText('Suresh is ready', { exact: true }).waitFor();
  await host.locator('#player-name').fill('Alan'); await host.locator('#father-name').fill('Suresh');
  let lostRoom;
  await host.route('**/api/rooms', async route => {
    if (!lostRoom) { const response = await route.fetch(); lostRoom = (await response.json()).room.id; await route.abort('failed'); }
    else await route.continue();
  });
  await host.getByRole('button', { name: 'Create hunt', exact: true }).click();
  await host.getByRole('alert').waitFor();
  await host.getByRole('button', { name: 'Create hunt', exact: true }).click();
  await host.getByRole('button', { name: 'Enter the house', exact: true }).waitFor();
  const path = new URL(host.url()).pathname;
  assert.match(path, /^\/r\/[a-f0-9-]+$/);
  assert.equal(path, `/r/${lostRoom}`, 'Lost creation response retries the same room');
  await host.goto(`${base}${path}?test=1`);
  await Promise.all(pages.slice(1).map(async (page, i) => {
    await page.goto(`${base}${path}?test=1`); await page.getByLabel('Your name', { exact: true }).fill(['Vinayak', 'Aravind', 'Meera', 'Ravi'][i]);
    await page.getByRole('button', { name: 'Join the hunt', exact: true }).click(); await page.getByRole('button', { name: 'Enter the house', exact: true }).waitFor();
  }));
  const sixth = await browser.newPage(); await sixth.goto(`${base}${path}`); await sixth.getByRole('button', { name: 'All five seats are taken', exact: true }).waitFor(); await sixth.close();
  await Promise.all(pages.map(async page => {
    await page.getByRole('button', { name: 'Enter the house', exact: true }).click();
    await page.getByRole('button', { name: 'Skip intro & hunt', exact: true }).click();
    await page.waitForFunction(() => window.__huntTest?.session.getSnapshot().status === 'playing');
    const remaining = await page.evaluate(() => window.__huntTest.session.getSnapshot().endsAt - window.__huntTest.session.time());
    assert.ok(remaining > 117000 && remaining <= 120000, `Full two-minute window: ${remaining}`);
    assert.equal(await page.title(), 'Father Hunter — The Suresh incident');
    assert.match(await page.evaluate(() => window.__huntTest.session.getSnapshot().father.atlas), /\/api\/rooms\/.*\/assets\/atlas.png$/, 'Every player loads the host’s personal character');
  }));
  console.log('PASS personal room creation survives lost reply; five browsers load the shared character; sixth rejected; timers start after intro');
  let lostCatch = false, repeatedCatch = false, lostSequence;
  await host.route('**/commands', async route => {
    const catchCommand = route.request().postDataJSON().commands.find(c => c.kind === 'catch');
    if (catchCommand && !lostCatch) {
      const response = await route.fetch(), result = await response.json();
      assert.ok(result.results.find(r => r.seq === catchCommand.seq)?.result.ok);
      lostCatch = true; lostSequence = catchCommand.seq; await route.abort('failed');
    } else { if (catchCommand?.seq === lostSequence) repeatedCatch = true; await route.continue(); }
  });
  await Promise.all(pages.map(async page => {
    await page.evaluate(() => { const t = window.__huntTest; const target = t.session.getSnapshot().targets.find(t => t.kind === 'hidden' && t.slotId === 'living-statue'); void t.tap(t.face(target.id)); });
    await page.waitForFunction(() => window.__huntTest?.session.getSnapshot().player.score === 1, undefined, { timeout: 20000 });
    await page.waitForFunction(() => window.__huntTest?.presentation().bagged === 1);
  }));
  assert.ok(lostCatch && repeatedCatch, 'Confirmed catch with a lost reply was retried');
  const confirmed = await (await host.request.get(`${base}${path.replace('/r/', '/api/rooms/')}/state`)).json();
  assert.equal(confirmed.cursor, 5, 'Retries create no duplicate catch events or points');
  await host.waitForFunction(() => [...document.querySelectorAll('.case-file .standing-score')].length === 5 && [...document.querySelectorAll('.case-file .standing-score')].every(el => el.textContent === '1'));
  await Promise.all(pages.map(async page => {
    await page.locator('.live-catch').waitFor({ timeout: 8000 });
    assert.equal(await page.locator('.coach').isVisible(), false, 'Friend notices do not overlap the guidance tip');
  }));
  for (const i of [1, 3]) assert.equal(await pages[i].getByRole('region', { name: 'Leaderboard', exact: true }).isVisible(), false, 'Mobile board hidden during hunt');
  await host.screenshot({ path: join(artifacts, 'multiplayer-desktop.png') });
  await pages[1].screenshot({ path: join(artifacts, 'multiplayer-mobile.png') });
  console.log('PASS five simultaneous independent statue catches, live standings and plain-text friend notices');
  const endsAt = await pages[1].evaluate(() => window.__huntTest.session.getSnapshot().endsAt);
  await pages[1].reload(); await pages[1].getByRole('button', { name: 'Resume your hunt', exact: true }).click();
  await pages[1].waitForFunction(() => window.__huntTest?.session.getSnapshot().status === 'playing');
  assert.equal(await pages[1].evaluate(() => window.__huntTest.session.getSnapshot().endsAt), endsAt);
  assert.equal(await pages[1].evaluate(() => window.__huntTest.presentation().bagged), 1);
  console.log('PASS refresh resumes confirmed sack and original deadline');
  await contexts[1].setOffline(true);
  await pages[1].evaluate(() => { void window.__huntTest.session.hint(); });
  await pages[1].waitForFunction(() => window.__huntTest.session.getSnapshot().connection === 'reconnecting');
  const disconnected = await pages[1].evaluate(() => {
    const session = window.__huntTest.session, before = session.getSnapshot().player.position;
    session.move({ x: 1, y: 0 }, 40);
    return { before, after: session.getSnapshot().player.position, endsAt: session.getSnapshot().endsAt };
  });
  assert.deepEqual(disconnected.after, disconnected.before, 'Disconnected movement freezes');
  assert.equal(disconnected.endsAt, endsAt, 'Disconnect never extends the deadline');
  await contexts[1].setOffline(false);
  await pages[1].waitForFunction(() => window.__huntTest.session.getSnapshot().connection === 'online' && !window.__huntTest.session.getSnapshot().pendingActions);
  assert.equal(await pages[1].evaluate(() => window.__huntTest.session.getSnapshot().player.score), 1);
  await pages[1].setViewportSize({ width: 844, height: 390 });
  assert.equal(await pages[1].getByRole('region', { name: 'Leaderboard', exact: true }).isVisible(), false, 'Mobile landscape also hides the board');
  const landscape = await pages[1].evaluate(() => ({ play: document.querySelector('.play-area').getBoundingClientRect().width, layout: document.querySelector('.hunt-layout').getBoundingClientRect().width }));
  assert.ok(landscape.play >= landscape.layout - 2, 'Landscape uses the available house width');
  await pages[1].getByRole('button', { name: 'Open house map', exact: true }).click();
  await pages[1].getByRole('button', { name: 'Walk to Bathroom', exact: true }).waitFor();
  assert.equal(await pages[1].getByRole('region', { name: 'Leaderboard', exact: true }).isVisible(), false, 'Mobile map drawer also hides the board');
  await pages[1].getByRole('button', { name: 'Close map', exact: true }).last().click();
  await pages[1].screenshot({ path: join(artifacts, 'multiplayer-mobile-landscape.png') });
  await pages[1].setViewportSize({ width: 390, height: 844 });
  console.log('PASS lost catch reply awards once; disconnect freezes controls and reconnect preserves score and deadline');
  if (smoke) {
    const offline = pages[1]; await contexts[1].setOffline(true);
    await offline.evaluate(() => { void window.__huntTest.session.hint(); });
    await offline.waitForFunction(() => window.__huntTest.session.getSnapshot().connection === 'reconnecting');
    const untilEnd = await offline.evaluate(() => window.__huntTest.session.getSnapshot().endsAt - window.__huntTest.session.time() + 20);
    await offline.clock.install(); offset += untilEnd; await offline.clock.fastForward(untilEnd);
    await offline.waitForFunction(() => window.__huntTest.session.getSnapshot().status === 'finished');
    assert.equal(await offline.locator('.result-card').count(), 0, 'Unconfirmed actions remain pending while offline');
    await offline.getByRole('button', { name: 'Leave hunt', exact: true }).click();
    await offline.locator('.room-actions .invite').waitFor();
    console.log('PASS an offline deadline with an unconfirmed action still allows returning to the case');
  }
  if (!smoke) {
    const last = pages[4];
    const snapshot = await last.evaluate(() => window.__huntTest.session.getSnapshot());
    const waitingTarget = snapshot.targets.filter(t => t.kind === 'hidden' && !t.claimedBy).map(t => ({ ...t, slot: HOUSE.slots.find(s => s.id === t.slotId) })).filter(t => t.slot.mode === 'search').sort((a, b) => distance(snapshot.player.position, a.slot.anchor) - distance(snapshot.player.position, b.slot.anchor))[0];
    assert.ok(waitingTarget, 'A searchable target is available for the deadline check');
    await last.evaluate(point => window.__huntTest.walk(point), waitingTarget.slot.anchor);
    await last.waitForFunction(point => { const p = window.__huntTest.session.getSnapshot().player.position; return Math.hypot(p.x - point.x, p.y - point.y) < 5; }, waitingTarget.slot.anchor, { timeout: 20000 });
    await last.evaluate(id => window.__huntTest.session.search(id), waitingTarget.slot.id);
    await last.waitForFunction(id => window.__huntTest.session.getSnapshot().opened.includes(id), waitingTarget.slot.id);
    let delayedCatch = false;
    await last.route('**/commands', async route => {
      const catchCommand = route.request().postDataJSON().commands.find(c => c.kind === 'catch');
      if (catchCommand && !delayedCatch) {
        const response = await route.fetch(), result = await response.json();
        assert.ok(result.results.find(r => r.seq === catchCommand.seq)?.result.ok, 'Final catch arrived before server deadline');
        delayedCatch = true;
        await new Promise(resolve => setTimeout(resolve, 2600));
        await route.fulfill({ response });
      } else await route.continue();
    });
    const remaining = await last.evaluate(() => window.__huntTest.session.getSnapshot().endsAt - window.__huntTest.session.time());
    await last.waitForTimeout(Math.max(0, remaining - 1500));
    await last.evaluate(id => { void window.__huntTest.session.catch(id); }, waitingTarget.id);
    await last.waitForFunction(() => window.__huntTest.session.getSnapshot().status === 'finished');
    assert.equal(await last.locator('.result-card').count(), 0, 'Results wait for the outstanding catch receipt');
    await Promise.all(pages.map(page => page.getByRole('button', { name: 'Try to beat your sack', exact: true }).waitFor({ timeout: 125000 })));
    for (const page of pages) { assert.equal(await page.locator('.result-card .standing-score').count(), 5); assert.equal(await page.locator('.result-stats strong').nth(1).innerText(), '2:00'); }
    assert.ok(delayedCatch); assert.equal(await last.locator('.result-stats strong').first().innerText(), '2');
    assert.equal(await last.locator('#result-title').innerText(), 'Suresh still has alibis.');
    await pages[1].screenshot({ path: join(artifacts, 'multiplayer-mobile-results.png') });
    const previous = await host.evaluate(() => window.__huntTest.session.getSnapshot().seed);
    await host.getByRole('button', { name: 'Try to beat your sack', exact: true }).click(); await host.getByRole('button', { name: 'Skip intro & hunt', exact: true }).click();
    await host.waitForFunction(() => window.__huntTest?.session.getSnapshot().status === 'playing');
    assert.notEqual(await host.evaluate(() => window.__huntTest.session.getSnapshot().seed), previous);
    const hostPlayerId = confirmed.me.id;
    assert.equal(await host.locator(`.case-file [data-player-id="${hostPlayerId}"] .standing-score`).innerText(), '1');
    offset += 3600001;
    await Promise.all(pages.map(page => page.getByText('Final standings', { exact: true }).waitFor()));
    console.log('PASS real two-minute deadlines, delayed final catch, named mobile results, best-score replay, and one-hour room closure');
  }
  assert.deepEqual(errors, []); assert.equal(provider.calls.length, 6, 'Only the six local fixture expressions were made');
} catch (error) {
  for (const [i, page] of pages.entries()) if (!page.isClosed()) await page.screenshot({ path: join(artifacts, `multiplayer-failure-${i}.png`) }).catch(() => {});
  throw error;
} finally { await browser?.close(); await vite?.close(); await app.close(); await rm(directory, { recursive: true, force: true }); }
