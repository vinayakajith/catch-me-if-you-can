import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { createServer } from 'vite';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../apps/server/src/app.ts';
import { FixtureProvider, portrait } from '../apps/server/test/fixtures.ts';
import { GenerationError } from '../apps/server/src/contracts.ts';

const directory = await mkdtemp(join(tmpdir(), 'father-browser-'));
const provider = new FixtureProvider(); provider.delayMs = 120;
const generateFixture = provider.generate.bind(provider);
const { app, jobs } = await buildApp({ directory, provider, retryDelayMs: 1 });
const artifacts = new URL('../artifacts/', import.meta.url); await mkdir(artifacts, { recursive: true });
let browser, vite;
const errors = [];
try {
  // Exercise the actual Vite proxy and HTTP cookie/origin handling on isolated
  // ports. This fixture API never loads the paid provider or development key.
  const apiAddress = await app.listen({ host: '127.0.0.1', port: 0 });
  vite = await createServer({ root: fileURLToPath(new URL('../apps/web', import.meta.url)), logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/api': { target: apiAddress } } } });
  await vite.listen();
  const baseURL = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  for (const mobile of [false, true]) {
    const context = await browser.newContext(mobile ? { ...devices['iPhone 13'], viewport: { width: 390, height: 664 }, reducedMotion: 'reduce' } : { viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { const realNow = Date.now; window.__characterClockOffset = 0; Date.now = () => realNow() + window.__characterClockOffset; });
    let loseFinalizeResponse = true, loseUploadResponse = true;
    await page.route('**/api/**', async route => {
      const request = route.request(), parsed = new URL(request.url());
      if (request.method() === 'POST' && parsed.pathname === '/api/characters' && loseUploadResponse) { loseUploadResponse = false; const response = await route.fetch({ maxRetries: 0 }); assert.ok(response.ok()); await route.abort(); return; }
      if (parsed.pathname.endsWith('/finalize') && loseFinalizeResponse) { loseFinalizeResponse = false; const response = await route.fetch({ maxRetries: 0 }); assert.ok(response.ok()); await route.abort(); return; }
      await route.continue();
    });
    await page.goto(`${baseURL}/?test=1&seed=personal-dad`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Use .+’s photo/ }).click();
    await page.getByLabel('a portrait photo', { exact: true }).setInputFiles({ name: 'portrait.jpg', mimeType: 'image/jpeg', buffer: await portrait() });
    await page.getByLabel('Troublemaker’s name', { exact: true }).fill(mobile ? 'Suresh' : 'Ajith');
    await page.getByLabel('Photo zoom', { exact: true }).fill('1.2');
    await page.getByRole('button', { name: 'Rotate photo', exact: true }).click();
    await page.screenshot({ path: new URL(`${mobile ? 'mobile' : 'desktop'}-photo-crop.png`, artifacts).pathname });
    const before = provider.calls.length;
    await page.getByRole('button', { name: mobile ? 'Make Suresh' : 'Make Ajith', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: /Connection lost/ }).waitFor();
    assert.ok(await page.evaluate(() => localStorage.getItem('fh-character-upload')), 'Upload receipt survives a lost response');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Continue making/ }).click();
    const approve = () => page.getByRole('button', { name: 'That’s him. Make him worse.' });
    await approve().waitFor({ timeout: 15000 }); await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(el => el.textContent.includes('That’s him.'))?.disabled);
    assert.equal(provider.calls.length, before + 1);
    const id = await page.evaluate(() => localStorage.getItem('fh-character-job'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Continue making/ }).click();
    await approve().waitFor(); assert.equal(provider.calls.length, before + 1, 'Refresh reuses base');
    await page.screenshot({ path: new URL(`${mobile ? 'mobile' : 'desktop'}-dad-approval.png`, artifacts).pathname });
    let releaseBudget = false;
    provider.generate = async input => {
      if (provider.calls.length === before + 2 && !releaseBudget) {
        provider.canAffordGeneration = false;
        throw new GenerationError('development_budget', 'Photo generation is paused while budget is reserved.', { canRetry: true });
      }
      return generateFixture(input);
    };
    await approve().evaluate(button => { button.click(); button.click(); });
    await page.getByText('2 completed faces are saved.', { exact: true }).waitFor();
    assert.equal(provider.calls.length, before + 2);
    assert.equal(await page.getByRole('button', { name: 'Retry this face' }).count(), 0);
    releaseBudget = true; provider.canAffordGeneration = true;
    await page.getByRole('button', { name: 'Retry this face' }).click();
    await page.getByTestId('use-character').waitFor({ timeout: 20000 });
    assert.equal(provider.calls.length, before + 6, 'Double approval creates just five edits');
    await page.locator('.palette-adjust summary').click();
    await page.getByRole('button', { name: 'Body colour #865437', exact: true }).click();
    await page.getByRole('button', { name: mobile ? 'Preview Suresh getting caught' : 'Preview Ajith getting caught', exact: true }).click();
    await page.waitForTimeout(330);
    await page.screenshot({ path: new URL(`${mobile ? 'mobile' : 'desktop'}-dad-expressions.png`, artifacts).pathname });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Creator fits phone width');
    await page.getByTestId('use-character').click();
    await page.getByRole('alert').filter({ hasText: /Connection lost/ }).waitFor();
    await page.getByTestId('use-character').click();
    await page.getByRole('button', { name: /is ready/ }).waitFor();
    assert.equal(provider.calls.length, before + 6, 'Lost finalize response does not regenerate');
    await page.getByLabel('WHO’S THE TROUBLEMAKER?').fill('Vijayan');
    await page.getByLabel('WHAT SHOULD WE CALL YOU?').fill(mobile ? 'Mobile' : 'Desktop');
    await page.getByRole('button', { name: 'Play solo', exact: true }).click();
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
    console.log(`PASS ${mobile ? 'mobile' : 'desktop'}: crop, lost upload response + reload, approval, budget pause and recovery, six faces, palette, lost final response, personalized intro/hunt/replay`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close(); await vite?.close(); await app.close(); await rm(directory, { recursive: true, force: true });
}
