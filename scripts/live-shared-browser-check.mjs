import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

// Explicit live check: one sample room, five independent browser cookies, zero
// image generations. Uses only public UI/API, with no development test hooks.
const origin = new URL(process.argv[2]).origin;
if (!origin.startsWith('https://') && !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error('Provide the HTTPS game origin (or the isolated loopback fixture).');
const artifacts = new URL('../artifacts/', import.meta.url); await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch(), pages = [], states = [], errors = [], requests = new Map(), timings = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, timeout = 20000) { const end = Date.now() + timeout; while (!check()) { if (Date.now() > end) throw new Error('Live assertion timed out'); await sleep(100); } }
try {
  for (let i = 0; i < 5; i++) {
    const context = await browser.newContext(i % 2 ? { ...devices['iPhone 13'], viewport: { width: 844, height: 390 } } : { viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); pages.push(page); page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && /Content Security Policy|violates/.test(m.text())) console.error(m.text().slice(0, 600)); });
    page.on('websocket', ws => {
      ws.on('framesent', frame => { const m = JSON.parse(String(frame.payload)); requests.set(m.requestId, performance.now()); });
      ws.on('framereceived', frame => {
        const m = JSON.parse(String(frame.payload));
        if (m.requestId && requests.has(m.requestId)) { timings.push(performance.now() - requests.get(m.requestId)); requests.delete(m.requestId); }
        if (m.type === 'error') errors.push(m.message);
        if (m.type === 'state' && (!states[i] || m.view.serverNow >= states[i].serverNow)) states[i] = m.view;
        if (m.type === 'motion' && states[i]?.round?.id === m.roundId) states[i].players = states[i].players.map(p => p.id === m.player.id && p.revision < m.player.revision ? m.player : p);
      });
    });
  }
  const host = pages[0], phone = pages[1]; await host.goto(origin);
  await host.locator('#player-name').fill('Smoke Alan'); await host.locator('#father-name').fill('Balaji');
  await host.getByRole('button', { name: 'Create hunt', exact: true }).click(); await host.getByRole('button', { name: 'I’m ready', exact: true }).waitFor();
  const invite = host.url();
  // Sequential joins avoid making an HTTP burst unrelated to gameplay load.
  for (let i = 1; i < 5; i++) {
    await pages[i].goto(invite); await pages[i].getByLabel('Your name', { exact: true }).fill(['Smoke Meera', 'Smoke Ravi', 'Smoke Neha', 'Smoke Dev'][i - 1]);
    await pages[i].getByRole('button', { name: 'Join the crew', exact: true }).click(); await pages[i].getByRole('button', { name: 'I’m ready', exact: true }).waitFor();
  }
  await until(() => states.every(s => s.players.length === 5) && states.length === 5);
  const outsider = await browser.newContext(); const sixth = await outsider.newPage(); await sixth.goto(invite);
  assert.equal(await sixth.getByRole('button', { name: 'All five seats are taken', exact: true }).isDisabled(), true); await outsider.close();
  assert.equal(new Set(states[0].players.map(p => p.colour)).size, 5);
  for (const p of pages) { await p.evaluate(() => { document.documentElement.requestFullscreen = undefined; }); await p.getByRole('button', { name: 'I’m ready', exact: true }).click(); }
  await host.getByRole('button', { name: 'Start the hunt', exact: true }).click();
  await until(() => states.every(s => s.phase === 'playing'));
  assert.equal(new Set(states.map(s => s.round.id)).size, 1); assert.equal(states[0].round.targets.length, 20);
  assert.equal(await phone.locator('.arena-board').isVisible(), false); assert.equal(await host.locator('.arena-board').isVisible(), true);
  await Promise.all(pages.map(p => p.locator('.arena-action').click()));
  await until(() => states.every(s => s.players.reduce((n, p) => n + p.score, 0) === 1));
  console.log('PASS live: host-started 5-player room, sixth rejected, unique colours, one shared catch from five simultaneous button presses');
  const deadline = states[0].round.endsAt;
  await phone.reload(); await phone.locator('.arena-action').waitFor();
  await until(() => states[1].round?.endsAt === deadline && states[1].players.reduce((n, p) => n + p.score, 0) === 1);
  await Promise.all(pages.map(async p => { await p.getByRole('button', { name: 'Open house map', exact: true }).click(); await p.getByRole('button', { name: 'Walk to Kitchen', exact: true }).click(); }));
  await Promise.all(pages.map(p => p.locator('.arena-room').filter({ hasText: 'Kitchen' }).waitFor({ timeout: 20000 })));
  await phone.screenshot({ path: new URL('live-shared-phone.png', artifacts).pathname }); await host.screenshot({ path: new URL('live-shared-desktop.png', artifacts).pathname });
  console.log('PASS live: refresh preserves score/deadline; single map tap walks every player through doors to the kitchen');
  if (process.argv.includes('--quick')) {
    assert.deepEqual(errors, []); console.log('PASS production build and browser security policy');
  } else {
  // Keep all five sessions alive through the actual shared two-minute deadline.
  await Promise.all(pages.map(p => p.getByRole('dialog', { name: 'Hunt results', exact: true }).waitFor({ timeout: 130000 })));
  for (const p of pages) assert.equal(await p.getByRole('list', { name: 'Final scores', exact: true }).locator('li').count(), 5);
  await host.getByRole('button', { name: 'Back to lobby · rematch', exact: true }).click();
  await Promise.all(pages.map(p => p.getByRole('button', { name: 'I’m ready', exact: true }).waitFor()));
  assert.deepEqual(errors, []);
  const sorted = timings.sort((a, b) => a - b);
  const result = { origin, players: 5, responses: timings.length, responseP95Ms: Math.round(sorted[Math.floor(sorted.length * .95)]), browserErrors: errors.length, paidImages: 0 };
  console.log('PASS live: shared two-minute results, mobile rankings and rematch', JSON.stringify(result));
  await writeFile(new URL('live-shared-browser.json', artifacts), JSON.stringify(result, null, 2));
  }
} catch (error) {
  for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: new URL(`live-shared-failure-${i}.png`, artifacts).pathname }).catch(() => {});
  throw error;
} finally { await browser.close(); }
