import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { HOUSE, placeTargets } from '../packages/game-core/src/index.ts';

const baseURL = process.env.FATHER_HUNTER_URL || 'http://127.0.0.1:5173';
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
let server, browser;
const errors = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function available() {
  try { return (await fetch(baseURL, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; }
}

async function start(page, name, seed = 'browser-56') {
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseURL}/?test=1&seed=${encodeURIComponent(seed)}`, { waitUntil: 'networkidle' });
  await page.getByLabel('WHAT SHOULD WE CALL YOU, DETECTIVE?').fill(name);
  await page.getByRole('button', { name: /Let’s find dad/ }).click();
  await page.getByRole('button', { name: 'Take the case', exact: true }).waitFor();
  await page.waitForFunction(() => window.__huntTest?.session.getSnapshot().status === 'ready', undefined, { timeout: 20000 });
  await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(() => window.__huntTest.session.getSnapshot().status), 'ready', 'Case story does not start the timer');
  await page.screenshot({ path: new URL(`${name}-case.png`, artifacts).pathname });
  await page.getByRole('button', { name: 'Take the case', exact: true }).click();
  await page.waitForFunction(() => window.__huntTest.session.getSnapshot().status === 'playing');
  assert.ok(await page.evaluate(() => window.__huntTest.session.getSnapshot().endsAt - Date.now() > 599000), 'Taking the case grants the full ten minutes');
  assert.equal(await page.locator('.activity-list').count(), 0, 'No mid-game gossip feed');
  const transparent = await page.evaluate(async () => {
    const img = new Image(); img.src = '/assets/detective-poses.png'; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, 1, 1).data[3];
  });
  assert.equal(transparent, 0, 'Detective atlas has genuine transparent alpha');
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
  await page.waitForTimeout(150);
  await page.screenshot({ path: new URL(mobile ? 'mobile-catch.png' : 'desktop-catch.png', artifacts).pathname });
  await waitForBag(page, 1);
  assert.equal(await page.locator('.toast').count(), 0, 'A catch has no Balaji dialogue');
}

async function waitForBag(page, count) {
  await page.waitForFunction(count => window.__huntTest.presentation().bagged === count && !window.__huntTest.presentation().busy, count);
}

async function finishHunt(page, mobile = false) {
  const before = await page.evaluate(() => window.__huntTest.session.getSnapshot());
  const targets = await page.evaluate(() => window.__huntTest.session.getSnapshot().targets.filter(t => !t.claimedBy).map(t => window.__huntTest.slots.find(s => s.id === t.slotId)));
  for (const slot of targets) {
    await page.evaluate(p => window.__huntTest.walk(p), slot.anchor);
    await waitForArrival(page, slot.anchor);
    if (slot.mode === 'search') {
      await tapWorld(page, { x: slot.prop.x + slot.prop.w / 2, y: slot.prop.y + slot.prop.h / 2 }, mobile);
      await page.waitForFunction(id => window.__huntTest.session.getSnapshot().opened.includes(id), slot.id);
    } else {
      // Wait for a real visible peek, then use an actual mouse/touch event on the canvas.
      await page.waitForFunction(id => {
        const dad = window.__huntTest.scene.children.list.find(o => o.texture?.key === 'father' && o.x === window.__huntTest.slots.find(s => s.id === id).target.x && o.visible);
        return dad && dad.alpha > .95;
      }, slot.id);
    }
    if (['kitchen-jar', 'living-vase'].includes(slot.id)) await page.screenshot({ path: new URL(`${mobile ? 'mobile' : 'desktop'}-${slot.id}.png`, artifacts).pathname });
    await tapWorld(page, await page.evaluate(id => window.__huntTest.face(id), slot.id), mobile);
    await page.waitForFunction(id => window.__huntTest.session.getSnapshot().targets.some(t => t.slotId === id && t.claimedBy), slot.id);
    const score = await page.evaluate(() => window.__huntTest.session.getSnapshot().player.score);
    if (score === 6) assert.equal(await page.getByRole('heading', { name: 'Six dads. One sack.' }).count(), 0, 'Final capture is visible before results');
    await waitForBag(page, score);
  }
  await page.getByRole('heading', { name: 'Six dads. One sack.' }).waitFor();
  assert.equal(await page.evaluate(() => window.__huntTest.session.getSnapshot().player.score), 6);
  await page.screenshot({ path: new URL(mobile ? 'mobile-results.png' : 'desktop-results.png', artifacts).pathname });
  await page.getByRole('button', { name: /Take another case/ }).click();
  await page.getByRole('button', { name: 'Take the case', exact: true }).waitFor();
  const after = await page.evaluate(() => window.__huntTest.session.getSnapshot());
  assert.equal(after.status, 'ready'); assert.equal(after.player.score, 0);
  assert.deepEqual(after.opened, []); assert.deepEqual(after.spotted, []);
  assert.notEqual(after.seed, before.seed); assert.equal(after.case.id, before.case.id); assert.deepEqual(after.father, before.father);
  assert.notDeepEqual(after.targets.map(t => t.slotId).sort(), before.targets.map(t => t.slotId).sort());
  await page.getByRole('button', { name: 'Take the case', exact: true }).click();
  await page.waitForFunction(() => window.__huntTest.session.getSnapshot().status === 'playing');
  assert.equal(await page.evaluate(() => window.__huntTest.presentation().bagged), 0);
}

async function checkCatalogue(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const ids = process.env.FATHER_HUNTER_HIDEOUTS?.split(',') ?? HOUSE.slots.map(s => s.id);
  assert.ok(ids.every(id => HOUSE.slots.some(s => s.id === id)), 'Requested hideouts exist');
  const remaining = new Set(ids), total = remaining.size;
  while (remaining.size) {
    let best = { seed: '', slots: [] };
    for (let i = 0; i < 2000; i++) {
      const seed = `catalogue-${i}`, slots = placeTargets(seed).map(t => t.slotId).filter(id => remaining.has(id));
      if (slots.length > best.slots.length) best = { seed, slots };
    }
    await start(page, 'Catalogue', best.seed);
    let score = 0;
    for (const id of best.slots) {
      const slot = HOUSE.slots.find(s => s.id === id);
      await page.evaluate(p => window.__huntTest.walk(p), slot.anchor);
      await waitForArrival(page, slot.anchor);
      // CHECK also opens a peeker's prop, allowing a stable view of every layered pose.
      await page.getByRole('button', { name: 'Check nearby furniture', exact: true }).click();
      await page.waitForFunction(id => window.__huntTest.session.getSnapshot().opened.includes(id), id);
      await page.locator('canvas').screenshot({ path: new URL(`hideout-${id}.png`, artifacts).pathname });
      await tapWorld(page, await page.evaluate(id => window.__huntTest.face(id), id));
      await page.waitForFunction(id => window.__huntTest.session.getSnapshot().targets.some(t => t.slotId === id && t.claimedBy), id);
      await waitForBag(page, ++score);
      remaining.delete(id);
      console.log(`PASS hideout ${id} (${total - remaining.size}/${total})`);
    }
  }
  await context.close();
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
  if (process.env.FATHER_HUNTER_CATALOGUE === '1') {
    await checkCatalogue(browser);
  } else {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await desktop.newPage();
  await page.goto(baseURL); await page.screenshot({ path: new URL('desktop-home.png', artifacts).pathname, fullPage: true });
  await start(page, 'Alan');
  await page.screenshot({ path: new URL('desktop-house.png', artifacts).pathname });
  await commode(page, false);
  await finishHunt(page);
  console.log('PASS desktop: start, navigation, commode reveal, all six catches and sack animations, results, and replay');
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
  console.log('PASS mobile: portrait layout, map navigation, six touch catches and sack animations, joystick, help, rotation, results, and replay');
  await mobile.close();
  }
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
