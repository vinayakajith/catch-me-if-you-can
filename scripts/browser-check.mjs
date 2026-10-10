import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const baseURL = process.env.FATHER_HUNTER_URL || 'http://127.0.0.1:5173';
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
let server, browser;
const errors = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function available() {
  try { return (await fetch(baseURL, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; }
}

async function start(page, name) {
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseURL}/?test=1`, { waitUntil: 'networkidle' });
  await page.getByLabel('WHAT SHOULD WE CALL YOU, DETECTIVE?').fill(name);
  await page.getByRole('button', { name: /Let’s find dad/ }).click();
  await page.waitForFunction(() => window.__huntTest?.session.getSnapshot().status === 'playing', undefined, { timeout: 20000 });
  await page.getByRole('button', { name: 'Dismiss guidance' }).click();
}

async function tapWorld(page, point, mobile = false) {
  const screen = await page.evaluate(p => window.__huntTest.screen(p), point);
  const canvas = await page.locator('canvas').boundingBox();
  assert.ok(canvas, 'Canvas exists');
  const x = canvas.x + screen.x, y = canvas.y + screen.y;
  assert.ok(x >= canvas.x && x <= canvas.x + canvas.width && y >= canvas.y && y <= canvas.y + canvas.height, 'Target is on screen');
  if (mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
}

async function waitForArrival(page, point) {
  await page.waitForFunction(p => {
    const position = window.__huntTest.session.getSnapshot().player.position;
    return Math.hypot(position.x - p.x, position.y - p.y) < 5;
  }, point, { timeout: 25000 });
  await page.waitForTimeout(250); // Let the follow camera settle before projecting a tap.
}

async function commode(page, mobile) {
  if (mobile) await page.getByRole('button', { name: 'Open house map' }).tap();
  await page.getByRole('button', { name: 'Walk to Bathroom', exact: true }).click();
  await waitForArrival(page, { x: 760, y: 682 });
  const slot = await page.evaluate(() => window.__huntTest.slots.find(s => s.id === 'bathroom-toilet'));
  await tapWorld(page, { x: slot.prop.x + slot.prop.w / 2, y: slot.prop.y + slot.prop.h / 2 }, mobile);
  await page.waitForFunction(() => window.__huntTest.session.getSnapshot().opened.includes('bathroom-toilet'), undefined, { timeout: 10000 });
  assert.equal(await page.evaluate(() => window.__huntTest.session.getSnapshot().player.score), 0, 'Opening does not score');
  await page.waitForTimeout(500);
  await page.screenshot({ path: new URL(mobile ? 'mobile-commode.png' : 'desktop-commode.png', artifacts).pathname });
  await tapWorld(page, await page.evaluate(id => window.__huntTest.face(id), slot.id), mobile);
  await page.waitForFunction(() => window.__huntTest.session.getSnapshot().player.score === 1);
  await page.screenshot({ path: new URL(mobile ? 'mobile-catch.png' : 'desktop-catch.png', artifacts).pathname });
}

async function finishHunt(page, mobile = false) {
  const targets = await page.evaluate(() => window.__huntTest.session.getSnapshot().targets.filter(t => !t.claimedBy).map(t => window.__huntTest.slots.find(s => s.id === t.slotId)));
  for (const slot of targets) {
    await page.evaluate(p => window.__huntTest.walk(p), slot.anchor);
    await waitForArrival(page, slot.anchor);
    if (slot.mode === 'search') {
      await tapWorld(page, { x: slot.prop.x + slot.prop.w / 2, y: slot.prop.y + slot.prop.h / 2 }, mobile);
      await page.waitForFunction(id => window.__huntTest.session.getSnapshot().opened.includes(id), slot.id);
      await page.waitForTimeout(450);
    }
    await tapWorld(page, slot.mode === 'search' ? await page.evaluate(id => window.__huntTest.face(id), slot.id) : { x: slot.hit.x + slot.hit.w / 2, y: slot.hit.y + slot.hit.h / 2 }, mobile);
    await page.waitForFunction(id => window.__huntTest.session.getSnapshot().targets.some(t => t.slotId === id && t.claimedBy), slot.id);
  }
  await page.getByRole('heading', { name: 'Absolutely dad-icated.' }).waitFor();
  assert.equal(await page.evaluate(() => window.__huntTest.session.getSnapshot().player.score), 12);
  await page.screenshot({ path: new URL(mobile ? 'mobile-results.png' : 'desktop-results.png', artifacts).pathname });
  await page.getByRole('button', { name: /Hide him again/ }).click();
  await page.waitForFunction(() => window.__huntTest.session.getSnapshot().player.score === 0 && window.__huntTest.session.getSnapshot().seed !== 'welcome-home');
}

try {
  if (!await available()) {
    if (process.env.FATHER_HUNTER_URL) throw new Error('FATHER_HUNTER_URL is not reachable');
    server = spawn('npm', ['run', 'dev'], { cwd: new URL('..', import.meta.url), stdio: 'pipe', detached: true });
    let output = ''; server.stdout.on('data', chunk => { output += chunk; }); server.stderr.on('data', chunk => { output += chunk; });
    for (let i = 0; i < 80 && !await available(); i++) await sleep(250);
    if (!await available()) throw new Error(`Dev server did not start:\n${output}`);
  }
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await desktop.newPage();
  await page.goto(baseURL); await page.screenshot({ path: new URL('desktop-home.png', artifacts).pathname, fullPage: true });
  await start(page, 'Alan');
  await page.screenshot({ path: new URL('desktop-house.png', artifacts).pathname });
  await commode(page, false);
  await finishHunt(page);
  console.log('PASS desktop: start, navigation, commode reveal, all twelve catches, results, and replay');
  await desktop.close();

  const mobile = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'no-preference' });
  const phone = await mobile.newPage();
  await phone.goto(baseURL); await phone.screenshot({ path: new URL('mobile-home.png', artifacts).pathname, fullPage: true });
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Landing fits mobile');
  await start(phone, 'Vinayak');
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Hunt fits mobile');
  await commode(phone, true);
  const joy = await phone.locator('.joystick').boundingBox();
  const before = await phone.evaluate(() => window.__huntTest.session.getSnapshot().player.position.x);
  const client = await phone.context().newCDPSession(phone);
  const x = joy.x + joy.width / 2, y = joy.y + joy.height / 2;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 25, y, id: 1 }] });
  await phone.waitForTimeout(160);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const after = await phone.evaluate(() => window.__huntTest.session.getSnapshot().player.position.x);
  assert.ok(after > before, 'Touch joystick moves the hunter');
  await phone.getByRole('button', { name: 'How to play' }).tap();
  await phone.getByRole('heading', { name: 'Just tap. Be curious.' }).waitFor();
  await phone.getByRole('button', { name: /Got it. Where’s dad/ }).tap();
  await phone.setViewportSize({ width: 844, height: 390 });
  await phone.waitForTimeout(350);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Landscape fits');
  await phone.screenshot({ path: new URL('mobile-landscape.png', artifacts).pathname });
  await phone.setViewportSize(devices['iPhone 13'].viewport);
  await phone.waitForTimeout(350);
  await finishHunt(phone, true);
  console.log('PASS mobile: portrait layout, map navigation, twelve touch catches, joystick, help, rotation, results, and replay');
  await mobile.close();
  assert.deepEqual(errors, [], 'No unhandled browser errors');
  console.log('Screenshots saved in artifacts/.');
} catch (error) {
  if (errors.length) console.error('Browser errors:', errors);
  for (const [i, page] of (browser?.contexts().flatMap(context => context.pages()) ?? []).entries()) {
    await page.screenshot({ path: new URL(`failure-${i}.png`, artifacts).pathname }).catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch { /* Already exited. */ } }
}
