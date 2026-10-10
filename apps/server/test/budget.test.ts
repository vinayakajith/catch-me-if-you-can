import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BudgetedImageProvider, DevelopmentBudget } from '../src/budget.ts';
import { FixtureProvider, portrait } from './fixtures.ts';
import { GenerationError } from '../src/contracts.ts';
import { DatabaseSync } from 'node:sqlite';

test('development spending is capped across instances, retries and restarts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'father-budget-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let budget = new DevelopmentBudget(directory, 10);
  assert.equal(budget.limitUsd, 1, 'Configuration cannot exceed the user’s $1 limit');
  const a = budget.reserve(); budget.settle(a, .12);
  const b = budget.reserve(); budget.settle(b, .15);
  const other = new DevelopmentBudget(directory);
  other.reserve(); budget.reserve(); other.reserve();
  assert.throws(() => budget.reserve(), /budget/); other.close(); budget.close();
  budget = new DevelopmentBudget(directory);
  assert.equal(budget.summary().knownUsd, .27); assert.ok(Math.abs(budget.summary().reservedUsd - .6) < 1e-9);
  assert.throws(() => budget.reserve(), /budget/); budget.close();
});

test('unknown provider outcomes retain money; successful usage settles its reservation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'father-budget-'));
  const budget = new DevelopmentBudget(directory), fixture = new FixtureProvider(), provider = new BudgetedImageProvider(fixture, budget);
  t.after(async () => { budget.close(); await rm(directory, { recursive: true, force: true }); });
  for (let i = 0; i < 4; i++) budget.settle(budget.reserve(), .175);
  await provider.generate({ photo: await portrait(), expression: 'grin' });
  assert.ok(Math.abs(budget.summary().knownUsd - .75478) < 1e-9);
  fixture.failures.push(new GenerationError('interrupted', 'unknown', { uncertain: true }));
  await assert.rejects(provider.generate({ photo: await portrait(), expression: 'laugh' }));
  assert.equal(budget.summary().reservedUsd, .2);
  await assert.rejects(provider.generate({ photo: await portrait(), expression: 'laugh' }), /budget/);
  assert.equal(fixture.calls.length, 2);
});

test('four remaining expressions fit after the observed $0.546683 spend without raising the cap', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'father-budget-regression-'));
  const budget = new DevelopmentBudget(directory), fixture = new FixtureProvider();
  t.after(async () => { budget.close(); await rm(directory, { recursive: true, force: true }); });
  for (const cost of [.062117, .070409, .070409, .070404, .070404, .070414, .062117, .070409]) budget.settle(budget.reserve(), cost);
  assert.equal(budget.summary().knownUsd, .546683);
  const generate = fixture.generate.bind(fixture);
  fixture.generate = async input => { const result = await generate(input); result.usage!.costUsd = .070414; return result; };
  const provider = new BudgetedImageProvider(fixture, budget);
  for (const expression of ['laugh', 'giggle', 'bonked', 'dizzy'] as const) await provider.generate({ photo: await portrait(), expression });
  assert.equal(fixture.calls.length, 4);
  assert.ok(Math.abs(budget.summary().knownUsd - .828339) < 1e-9);
  assert.equal(budget.summary().reservedUsd, 0);
  assert.equal(provider.canAffordGeneration, false);
  const before = budget.summary().requests;
  await assert.rejects(provider.generate({ photo: await portrait(), expression: 'grin' }), /budget/);
  assert.equal(budget.summary().requests, before, 'A budget rejection is not a provider request');
  assert.equal(fixture.calls.length, 4);
});

test('old uncertain reservations retain their original amount after the buffer changes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'father-budget-legacy-'));
  let budget = new DevelopmentBudget(directory); budget.close();
  const db = new DatabaseSync(join(directory, 'development-spend.sqlite'));
  db.prepare('INSERT INTO spend VALUES (?, ?, ?, ?)').run('old-uncertain-request', .5, 'reserved', Date.now()); db.close();
  budget = new DevelopmentBudget(directory);
  t.after(async () => { budget.close(); await rm(directory, { recursive: true, force: true }); });
  budget.reserve(); budget.reserve();
  assert.ok(Math.abs(budget.summary().reservedUsd - .9) < 1e-9);
  assert.throws(() => budget.reserve(), /budget/);
});
