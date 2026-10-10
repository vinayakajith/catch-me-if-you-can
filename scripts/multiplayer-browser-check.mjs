import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { createServer } from 'vite';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../apps/server/src/app.ts';
import { FixtureProvider } from '../apps/server/test/fixtures.ts';

const directory = await mkdtemp(join(tmpdir(), 'father-multi-browser-'));
const provider = new FixtureProvider(); let offset = 0;
const { app } = await buildApp({ directory, provider, clock: () => Date.now() + offset });
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
  await host.locator('#player-name').fill('Alan'); await host.locator('#father-name').fill('Suresh');
  await host.getByRole('button', { name: 'Create hunt', exact: true }).click();
  await host.getByRole('button', { name: 'Enter the house', exact: true }).waitFor();
  const path = new URL(host.url()).pathname;
  assert.match(path, /^\/r\/[a-f0-9-]+$/);
  await host.goto(`${base}${path}?test=1`);
  await Promise.all(pages.slice(1).map(async (page, i) => {
    await page.goto(`${base}${path}?test=1`); await page.getByLabel('Agent name', { exact: true }).fill(['Vinayak', 'Aravind', 'Meera', 'Ravi'][i]);
    await page.getByRole('button', { name: 'Join the hunt', exact: true }).click(); await page.getByRole('button', { name: 'Enter the house', exact: true }).waitFor();
  }));
  const sixth = await browser.newPage(); await sixth.goto(`${base}${path}`); await sixth.getByRole('button', { name: 'All five seats are taken', exact: true }).waitFor(); await sixth.close();
  await Promise.all(pages.map(async page => {
    await page.getByRole('button', { name: 'Enter the house', exact: true }).click();
    await page.getByRole('button', { name: 'Skip intro & hunt', exact: true }).click();
    await page.waitForFunction(() => window.__huntTest?.session.getSnapshot().status === 'playing');
    const remaining = await page.evaluate(() => window.__huntTest.session.getSnapshot().endsAt - window.__huntTest.session.time());
    assert.ok(remaining > 117000 && remaining <= 120000, `Full two-minute window: ${remaining}`);
  }));
  console.log('PASS five independent browsers joined; sixth rejected; timers start after intro');
  await Promise.all(pages.map(async page => {
    await page.evaluate(() => { const t = window.__huntTest; const target = t.session.getSnapshot().targets.find(t => t.kind === 'hidden' && t.slotId === 'living-statue'); void t.tap(t.face(target.id)); });
    await page.waitForFunction(() => window.__huntTest?.session.getSnapshot().player.score === 1, { timeout: 20000 });
    await page.waitForFunction(() => window.__huntTest?.presentation().bagged === 1);
  }));
  await host.waitForFunction(() => [...document.querySelectorAll('.case-file .standing-score')].length === 5 && [...document.querySelectorAll('.case-file .standing-score')].every(el => el.textContent === '1'));
  for (const page of pages) await page.locator('.live-catch').waitFor({ timeout: 8000 });
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
  if (!smoke) {
    await Promise.all(pages.map(page => page.getByRole('button', { name: 'Try to beat your sack', exact: true }).waitFor({ timeout: 125000 })));
    for (const page of pages) { assert.equal(await page.locator('.result-card .standing-score').count(), 5); assert.equal(await page.locator('.result-stats strong').nth(1).innerText(), '2:00'); }
    await pages[1].screenshot({ path: join(artifacts, 'multiplayer-mobile-results.png') });
    const previous = await host.evaluate(() => window.__huntTest.session.getSnapshot().seed);
    await host.getByRole('button', { name: 'Try to beat your sack', exact: true }).click(); await host.getByRole('button', { name: 'Skip intro & hunt', exact: true }).click();
    await host.waitForFunction(() => window.__huntTest?.session.getSnapshot().status === 'playing');
    assert.notEqual(await host.evaluate(() => window.__huntTest.session.getSnapshot().seed), previous);
    assert.equal(await host.locator('.case-file .standing-score').first().innerText(), '1');
    offset += 3600001;
    await Promise.all(pages.map(page => page.getByText('Final standings', { exact: true }).waitFor()));
    console.log('PASS full two-minute deadlines, mobile result board, replay preserves best, and one-hour room closure');
  }
  assert.deepEqual(errors, []); assert.equal(provider.calls.length, 0);
} finally { await browser?.close(); await vite?.close(); await app.close(); await rm(directory, { recursive: true, force: true }); }
