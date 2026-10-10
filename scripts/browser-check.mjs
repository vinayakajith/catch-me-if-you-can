import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { HOUSE, placeTargets } from '../packages/game-core/src/index.ts';

const fixtureSeed = Array.from({ length: 1000 }, (_, i) => `browser-${i}`).find(seed => placeTargets(seed).length === 12 && placeTargets(seed).some(t => t.kind === 'hidden' && t.slotId === 'bathroom-toilet'));
const baseURL = process.env.FATHER_HUNTER_URL || 'http://127.0.0.1:5173';
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
let server, browser;
const errors = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function available() {
  try { return (await fetch(baseURL, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; }
}

async function start(page, name, seed = fixtureSeed, options = {}) {
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseURL}/?test=1&seed=${encodeURIComponent(seed)}`, { waitUntil: 'networkidle' });
  await page.getByLabel('WHAT SHOULD WE CALL YOU, DETECTIVE?').fill(name);
  await page.getByLabel('WHO’S THE WITCH-SCIENTIST?').fill(options.fatherName || 'Balaji');
  await page.getByRole('button', { name: 'Play solo', exact: true }).click();
  await page.getByRole('button', { name: 'Skip intro & hunt', exact: true }).waitFor();
  await page.waitForFunction(() => window.__huntTest?.session.getSnapshot().status === 'ready', undefined, { timeout: 20000 });
  await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(() => window.__huntTest.session.getSnapshot().status), 'ready', 'Case story does not start the timer');
  await page.screenshot({ path: new URL(`${name}-case.png`, artifacts).pathname });
  if (options.reviewIntro) await reviewIntro(page, options.fatherName, options.mobile);
  else await page.getByRole('button', { name: 'Skip intro & hunt', exact: true }).click();
  await page.waitForFunction(() => window.__huntTest.session.getSnapshot().status === 'playing');
  assert.ok(await page.evaluate(() => window.__huntTest.session.getSnapshot().endsAt - Date.now() > 119000), 'Taking the case grants the full two minutes');
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

async function reviewIntro(page, fatherName, mobile) {
  const scene = id => page.locator(`.intro-stage[data-scene="${id}"]`);
  assert.equal(await page.locator('#intro-title').innerText(), `Dr. ${fatherName}. Witch-scientist.`);
  assert.equal(await page.evaluate(() => window.__huntTest.session.getSnapshot().father.name), fatherName);
  await scene('experiment').waitFor();
  await page.screenshot({ path: new URL(`${mobile ? 'mobile' : 'desktop'}-experiment.png`, artifacts).pathname });
  if (mobile) {
    await scene('entrance').waitFor({ timeout: 6000 });
    await page.getByRole('button', { name: 'Pause intro', exact: true }).tap();
    const pausedAt = Number(await page.locator('.intro-stage').getAttribute('data-clock'));
    await page.waitForTimeout(1200);
    assert.equal(Number(await page.locator('.intro-stage').getAttribute('data-clock')), pausedAt, 'Pause preserves the exact clock');
    await page.setViewportSize({ width: 844, height: 390 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: new URL('mobile-intro-landscape.png', artifacts).pathname });
    await page.setViewportSize({ width: 390, height: 664 });
    await page.getByRole('button', { name: 'Play intro', exact: true }).tap();
    await scene('chaos').waitFor({ timeout: 5000 });
    await page.waitForTimeout(2000);
    assert.ok(await page.locator('.intro-dad').count() >= 4, 'Laughing copies stream out of the portal');
    await page.screenshot({ path: new URL('mobile-chaos.png', artifacts).pathname });
    await scene('escape').waitFor({ timeout: 5000 });
    await page.screenshot({ path: new URL('mobile-escape.png', artifacts).pathname });
    await scene('dispatch').waitFor({ timeout: 6000 });
  } else {
    await page.waitForTimeout(4200); await scene('experiment').waitFor();
    for (const id of ['entrance', 'chaos', 'escape', 'dispatch']) {
      await page.getByRole('button', { name: 'Next scene', exact: true }).click(); await scene(id).waitFor();
      await page.screenshot({ path: new URL(`desktop-${id}.png`, artifacts).pathname });
    }
  }
  assert.equal(await page.evaluate(() => window.__huntTest.session.getSnapshot().status), 'ready');
  assert.ok((await page.locator('#intro-story').innerText()).includes(fatherName));
  await page.screenshot({ path: new URL(`${mobile ? 'mobile' : 'desktop'}-dispatch.png`, artifacts).pathname });
  await page.getByRole('button', { name: 'Watch again', exact: true }).click(); await scene('experiment').waitFor();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  await page.getByRole('button', { name: 'Grab the sack. Start hunt.', exact: true }).click();
  console.log(`PASS ${mobile ? 'mobile' : 'desktop'} intro: five scenes, personal name, exact pause, replay, timer protection`);
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
  const beforeScore = await page.evaluate(() => window.__huntTest.session.getSnapshot().player.score);
  if (mobile) await page.getByRole('button', { name: 'Open house map' }).tap();
  await page.getByRole('button', { name: 'Walk to Bathroom', exact: true }).click();
  await waitForArrival(page, { x: 760, y: 682 });
  const slot = await page.evaluate(() => window.__huntTest.slots.find(s => s.id === 'bathroom-toilet'));
  await tapWorld(page, { x: slot.prop.x + slot.prop.w / 2, y: slot.prop.y + slot.prop.h / 2 }, mobile);
  await page.waitForFunction(() => window.__huntTest.session.getSnapshot().opened.includes('bathroom-toilet'), undefined, { timeout: 10000 });
  assert.equal(await page.evaluate(() => window.__huntTest.session.getSnapshot().player.score), beforeScore, 'Opening does not score');
  await page.waitForTimeout(500);
  await page.screenshot({ path: new URL(mobile ? 'mobile-commode.png' : 'desktop-commode.png', artifacts).pathname });
  await tapWorld(page, await page.evaluate(id => window.__huntTest.face(id), slot.id), mobile);
  await page.waitForFunction(score => window.__huntTest.session.getSnapshot().player.score === score + 1, beforeScore);
  await page.waitForTimeout(150);
  await page.screenshot({ path: new URL(mobile ? 'mobile-catch.png' : 'desktop-catch.png', artifacts).pathname });
  await waitForBag(page, beforeScore + 1);
  assert.equal(await page.locator('.toast').count(), 0, 'A catch has no Balaji dialogue');
}

async function waitForBag(page, count) {
  await page.waitForFunction(count => window.__huntTest.presentation().bagged === count && !window.__huntTest.presentation().busy, count);
}

async function catchBroom(page, mobile) {
  const start = await page.evaluate(() => window.__huntTest.session.getSnapshot().targets.find(t=>t.kind==='broom').route[0].from);
  await page.evaluate(p=>window.__huntTest.walk(p),start); await waitForArrival(page,start);
  const point = await page.evaluate(() => window.__huntTest.face('broom-dad'));
  await tapWorld(page, point, mobile);
  await page.waitForFunction(() => window.__huntTest.session.getSnapshot().targets.find(t => t.kind === 'broom').claimedBy);
  assert.equal(await page.evaluate(() => window.__huntTest.presentation().bagged), 0, 'Score is presented only after landing');
  await page.waitForTimeout(580);
  await page.screenshot({ path: new URL(`${mobile ? 'mobile' : 'desktop'}-broom-whack.png`, artifacts).pathname });
  await waitForBag(page, 1);
  console.log('PASS broom: one tap, comic whack, one bagged point');
}

async function finishHunt(page, mobile = false) {
  const before = await page.evaluate(() => window.__huntTest.session.getSnapshot());
  const roomOrder = ['bathroom', 'storeroom', 'kitchen', 'living', 'bedroom'];
  const targets = before.targets.filter(t => t.kind === 'hidden' && !t.claimedBy).map(t => ({...t, slot: HOUSE.slots.find(s => s.id === t.slotId)})).sort((a,b)=>roomOrder.indexOf(a.slot.roomId)-roomOrder.indexOf(b.slot.roomId));
  for (const target of targets) {
    const slot = target.slot;
    await page.evaluate(p => window.__huntTest.walk(p), slot.anchor); await waitForArrival(page, slot.anchor);
    if (slot.mode === 'search') {
      await tapWorld(page, { x: slot.prop.x + slot.prop.w / 2, y: slot.prop.y + slot.prop.h / 2 }, mobile);
      await page.waitForFunction(id => window.__huntTest.session.getSnapshot().opened.includes(id), slot.id);
    } else await page.waitForFunction(id => { const dad = window.__huntTest.scene.dads.get(id); return dad?.visible && dad.alpha > .95; }, target.id);
    await page.screenshot({ path: new URL(`${mobile ? 'mobile' : 'desktop'}-${slot.id}.png`, artifacts).pathname });
    await tapWorld(page, await page.evaluate(id => window.__huntTest.face(id), target.id), mobile);
    await page.waitForFunction(id => window.__huntTest.session.getSnapshot().targets.some(t => t.id === id && t.claimedBy), target.id);
    const score = await page.evaluate(() => window.__huntTest.session.getSnapshot().player.score);
    if (score === before.targets.length) assert.equal(await page.locator('.result-card').count(), 0, 'Final capture lands before results');
    await waitForBag(page, score);
  }
  await page.getByRole('heading', { name: 'Case closed. Sack full.' }).waitFor();
  assert.equal(await page.evaluate(() => window.__huntTest.session.getSnapshot().player.score), before.targets.length);
  assert.ok((await page.locator('.result-player').innerText()).includes(`${before.player.name} caught ${before.targets.length} ${before.father.name}s`));
  await page.screenshot({ path: new URL(mobile ? 'mobile-results.png' : 'desktop-results.png', artifacts).pathname });
  await page.getByRole('button', { name: /Take another case/ }).click();
  await page.getByRole('button', { name: 'Skip intro & hunt', exact: true }).waitFor();
  await page.waitForFunction(() => window.__huntTest?.session.getSnapshot().status === 'ready');
  const after = await page.evaluate(() => window.__huntTest.session.getSnapshot());
  assert.equal(after.player.score, 0); assert.deepEqual(after.opened, []); assert.deepEqual(after.spotted, []);
  assert.notEqual(after.seed, before.seed); assert.deepEqual(after.father, before.father);
  const signature = targets => targets.filter(t => t.kind === 'hidden').map(t => t.slotId).sort();
  assert.notDeepEqual(signature(after.targets), signature(before.targets));
  await page.getByRole('button', { name: 'Skip intro & hunt', exact: true }).click();
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
      const seed = `catalogue-${i}`, slots = placeTargets(seed).filter(t => t.kind === 'hidden').map(t => t.slotId).filter(id => remaining.has(id));
      if (slots.length > best.slots.length) best = { seed, slots };
    }
    await start(page, 'Catalogue', best.seed);
    let score = 0;
    best.slots.sort((a, b) => HOUSE.slots.findIndex(s => s.id === a) - HOUSE.slots.findIndex(s => s.id === b));
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

async function checkEdges(browser) {
  const context = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 320, height: 568 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  await page.clock.install();
  await start(page, 'Edge detective', fixtureSeed, { fatherName: 'Suresh' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Small portrait fits');
  const statue = HOUSE.slots.find(s => s.kind === 'statue');
  assert.equal(await page.evaluate(() => window.__huntTest.session.getSnapshot().player.roomId), 'hall');
  assert.equal(await page.evaluate(() => window.__huntTest.scene.dads.get(window.__huntTest.session.getSnapshot().targets.find(t=>t.kind==='hidden'&&t.slotId==='living-statue').id).visible), true, 'Spotlight Dad is visible immediately');
  await tapWorld(page, statue.target, true);
  await page.waitForFunction(() => window.__huntTest.presentation().busy, undefined, { timeout: 15000 });
  await page.waitForTimeout(595);
  await page.screenshot({ path: new URL('small-phone-backside-whack.png', artifacts).pathname });
  await waitForBag(page, 1);
  assert.equal(await page.evaluate(() => window.__huntTest.session.getSnapshot().player.roomId), 'living', 'A tap on the lit statue walks through the doorway');
  assert.equal(await page.locator('.hud-stat').count(), 2, 'Only time and the actual bag count are shown');
  await page.clock.fastForward(120001);
  await page.locator('.result-card').waitFor();
  assert.equal(await page.evaluate(() => window.__huntTest.session.getSnapshot().finishReason), 'timeout');
  assert.match(await page.locator('.result-player').innerText(), /caught 1 Suresh in 2 minutes/);
  const card = await page.locator('.result-card').boundingBox();
  assert.ok(card.y >= 0 && card.y + card.height <= 568, 'Result card fits a short phone');
  const again = await page.getByRole('button', {name:/Take another case/}).boundingBox();
  assert.ok(again.y >= 0 && again.y + again.height <= 568, 'Replay is immediately reachable');
  await page.screenshot({ path: new URL('small-phone-timeout.png', artifacts).pathname });
  await context.close();
  console.log('PASS small phone: immediate spotlight catch, automatic approach, backside impact, background deadline');

  const faults = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const missing = await faults.newPage();
  await missing.route('**/assets/time-machine-lab.png', route => route.abort());
  await start(missing, 'Fallback', fixtureSeed);
  assert.equal(await missing.evaluate(() => window.__huntTest.session.getSnapshot().status), 'playing');
  await missing.close();
  const broken = await faults.newPage();
  await broken.route('**/assets/balaji-heads.png', route => route.abort());
  await broken.goto(baseURL); await broken.locator('#player-name').fill('No art'); await broken.getByRole('button', { name: 'Play solo', exact: true }).click();
  await broken.locator('.intro-error').waitFor();
  assert.equal(await broken.getByRole('button', { name: 'Skip intro & hunt', exact: true }).isDisabled(), true);
  await broken.getByRole('button', { name: 'Reload the house', exact: true }).waitFor();
  await broken.close();
  const slow = await faults.newPage();
  await slow.route('**/assets/balaji-heads.png', async route => { await sleep(1800); await route.continue(); });
  await slow.goto(`${baseURL}/?test=1`, {waitUntil:'domcontentloaded'}); await slow.locator('#player-name').fill('Patient'); await slow.getByRole('button', { name: 'Play solo', exact: true }).click();
  await slow.getByRole('dialog').waitFor();
  await slow.waitForFunction(()=>window.__huntTest?.session.getSnapshot().status==='ready');
  await slow.waitForTimeout(1200);
  assert.equal(await slow.evaluate(()=>window.__huntTest.session.getSnapshot().status),'ready');
  for(let i=0;i<12;i++){await slow.keyboard.press('Tab');assert.equal(await slow.evaluate(()=>document.querySelector('[role="dialog"]').contains(document.activeElement)),true);}
  await slow.getByRole('button',{name:'Skip intro & hunt',exact:true}).click();
  assert.ok(await slow.evaluate(()=>window.__huntTest.session.getSnapshot().endsAt-Date.now()>119000));
  await faults.close();
  console.log('PASS lab fallback, failed character recovery, slow art, keyboard focus and full timer after loading');
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
  if (process.env.FATHER_HUNTER_EDGES === '1') {
    await checkEdges(browser);
  } else if (process.env.FATHER_HUNTER_CATALOGUE === '1') {
    await checkCatalogue(browser);
  } else {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await desktop.newPage();
  await page.goto(baseURL); await page.screenshot({ path: new URL('desktop-home.png', artifacts).pathname, fullPage: true });
  await start(page, 'Alan', fixtureSeed, { reviewIntro: true, fatherName: 'Suresh' });
  await page.screenshot({ path: new URL('desktop-house.png', artifacts).pathname });
  await catchBroom(page, false);
  await commode(page, false);
  await finishHunt(page);
  console.log('PASS desktop: start, navigation, commode reveal, every catch and sack animations, results, and replay');
  await desktop.close();

  const mobile = await browser.newContext({ ...devices['iPhone 13'], viewport: {width:390,height:664}, reducedMotion: 'no-preference' });
  const phone = await mobile.newPage();
  await phone.goto(baseURL); await phone.screenshot({ path: new URL('mobile-home.png', artifacts).pathname, fullPage: true });
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Landing fits mobile');
  await start(phone, 'Vinayak', fixtureSeed, { reviewIntro: true, fatherName: 'Chandrashekhar Subramanian', mobile: true });
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Hunt fits mobile');
  await catchBroom(phone, true);
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
  console.log('PASS mobile: portrait layout, map navigation, every touch catch and sack animations, joystick, help, rotation, results, and replay');
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
