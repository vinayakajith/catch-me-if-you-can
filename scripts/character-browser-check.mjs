import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../apps/server/src/app.ts';
import { FixtureProvider, portrait } from '../apps/server/test/fixtures.ts';

const baseURL = process.env.FATHER_HUNTER_URL || 'http://127.0.0.1:5173';
const directory = await mkdtemp(join(tmpdir(), 'father-browser-'));
const provider = new FixtureProvider(); provider.delayMs = 120;
const { app, jobs } = await buildApp({ directory, provider, retryDelayMs: 1 });
const artifacts = new URL('../artifacts/', import.meta.url); await mkdir(artifacts, { recursive: true });
let browser, vite;
const errors = [];
try {
  let available = false;
  try { available = (await fetch(baseURL)).ok; } catch {}
  if (!available) {
    // Never start the paid provider in a browser test.
    vite = spawn('npm', ['run', 'dev:web'], { stdio: 'ignore' });
    for (let i = 0; i < 50; i++) { await new Promise(r => setTimeout(r, 200)); try { if ((await fetch(baseURL)).ok) { available = true; break; } } catch {} }
  }
  assert.ok(available, 'Vite is reachable');
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  for (const mobile of [false, true]) {
    const context = await browser.newContext(mobile ? { ...devices['iPhone 13'], viewport: { width: 390, height: 664 }, reducedMotion: 'reduce' } : { viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { const realNow = Date.now; window.__characterClockOffset = 0; Date.now = () => realNow() + window.__characterClockOffset; });
    let loseFinalizeResponse = true, loseUploadResponse = true;
    await page.route('**/api/**', async route => {
      const request = route.request(), parsed = new URL(request.url());
      const response = await app.inject({ method: request.method(), url: parsed.pathname + parsed.search, headers: { ...request.headers(), host: new URL(baseURL).host }, payload: request.postDataBuffer() || undefined });
      if (request.method() === 'POST' && parsed.pathname === '/api/characters' && loseUploadResponse) { loseUploadResponse = false; await route.abort(); return; }
      if (parsed.pathname.endsWith('/finalize') && loseFinalizeResponse) { loseFinalizeResponse = false; await route.abort(); return; }
      await route.fulfill({ status: response.statusCode, headers: Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value)])), body: response.rawPayload });
    });
    await page.goto(`${baseURL}/?test=1&seed=personal-dad`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Use your dad’s photo/ }).click();
    await page.getByLabel('Dad’s photo', { exact: true }).setInputFiles({ name: 'portrait.jpg', mimeType: 'image/jpeg', buffer: await portrait() });
    await page.getByLabel('Dad’s name', { exact: true }).fill(mobile ? 'Suresh' : 'Ajith');
    await page.getByLabel('Photo zoom', { exact: true }).fill('1.2');
    await page.getByRole('button', { name: 'Rotate photo', exact: true }).click();
    await page.screenshot({ path: new URL(`${mobile ? 'mobile' : 'desktop'}-photo-crop.png`, artifacts).pathname });
    const before = provider.calls.length;
    await page.getByRole('button', { name: 'Make my Dad', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: /Connection lost/ }).waitFor();
    assert.ok(await page.evaluate(() => localStorage.getItem('fh-character-upload')), 'Upload receipt survives a lost response');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Continue making your Dad/ }).click();
    const approve = () => page.getByRole('button', { name: 'That’s him. Make him worse.' });
    await approve().waitFor({ timeout: 15000 }); await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(el => el.textContent.includes('That’s him.'))?.disabled);
    assert.equal(provider.calls.length, before + 1);
    const id = await page.evaluate(() => localStorage.getItem('fh-character-job'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Continue making your Dad/ }).click();
    await approve().waitFor(); assert.equal(provider.calls.length, before + 1, 'Refresh reuses base');
    await page.screenshot({ path: new URL(`${mobile ? 'mobile' : 'desktop'}-dad-approval.png`, artifacts).pathname });
    await approve().evaluate(button => { button.click(); button.click(); });
    await page.getByRole('button', { name: 'Use this Dad', exact: true }).waitFor({ timeout: 20000 });
    assert.equal(provider.calls.length, before + 6, 'Double approval creates just five edits');
    await page.locator('.palette-adjust summary').click();
    await page.getByRole('button', { name: 'Body colour #865437', exact: true }).click();
    await page.getByRole('button', { name: 'Preview Dad getting caught', exact: true }).click();
    await page.waitForTimeout(330);
    await page.screenshot({ path: new URL(`${mobile ? 'mobile' : 'desktop'}-dad-expressions.png`, artifacts).pathname });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Creator fits phone width');
    await page.getByRole('button', { name: 'Use this Dad', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: /Connection lost/ }).waitFor();
    await page.getByRole('button', { name: 'Use this Dad', exact: true }).click();
    await page.getByRole('button', { name: /Your Dad is ready/ }).waitFor();
    assert.equal(provider.calls.length, before + 6, 'Lost finalize response does not regenerate');
    await page.getByLabel('WHO’S THE WITCH-SCIENTIST?').fill('Vijayan');
    await page.getByLabel('WHAT SHOULD WE CALL YOU, DETECTIVE?').fill(mobile ? 'Mobile' : 'Desktop');
    await page.getByRole('button', { name: /Let’s find dad/ }).click();
    await page.waitForFunction(() => window.__huntTest?.session.getSnapshot().status === 'ready');
    const father = await page.evaluate(() => window.__huntTest.session.getSnapshot().father);
    assert.equal(father.id, id); assert.equal(father.name, 'Vijayan'); assert.equal(father.palette.skin, '#865437');
    await page.getByRole('button', { name: 'Skip intro & hunt', exact: true }).click();
    await page.waitForFunction(() => window.__huntTest.session.getSnapshot().status === 'playing');
    await page.screenshot({ path: new URL(`${mobile ? 'mobile' : 'desktop'}-personal-hunt.png`, artifacts).pathname });
    await page.evaluate(() => { const session = window.__huntTest.session; window.__characterClockOffset += session.getSnapshot().endsAt - Date.now() + 1; session.tick(); });
    await page.getByRole('button', { name: /Take another case/ }).click();
    await page.waitForFunction(() => window.__huntTest?.session.getSnapshot().status === 'ready');
    assert.equal(await page.evaluate(() => window.__huntTest.session.getSnapshot().father.id), id, 'Replay keeps personalized pack');
    assert.equal(provider.calls.length, before + 6);
    await context.close();
    console.log(`PASS ${mobile ? 'mobile' : 'desktop'}: crop, lost upload response + reload, approval, resume, six faces, palette, lost final response, personalized intro/hunt/replay`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close(); vite?.kill('SIGTERM'); await app.close(); await rm(directory, { recursive: true, force: true });
}
