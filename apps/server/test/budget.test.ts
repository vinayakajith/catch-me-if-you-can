import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BudgetedImageProvider, DevelopmentBudget } from '../src/budget.ts';
import { FixtureProvider, portrait } from './fixtures.ts';
import { GenerationError } from '../src/contracts.ts';

test('development spending is capped across instances, retries and restarts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'father-budget-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let budget = new DevelopmentBudget(directory, 10);
  assert.equal(budget.limitUsd, 1, 'Configuration cannot exceed the user’s $1 limit');
  const a = budget.reserve(); budget.settle(a, .12);
  const b = budget.reserve(); budget.settle(b, .15);
  const other = new DevelopmentBudget(directory);
  other.reserve(); assert.throws(() => budget.reserve(), /budget/); other.close(); budget.close();
  budget = new DevelopmentBudget(directory);
  assert.equal(budget.summary().knownUsd, .27); assert.equal(budget.summary().reservedUsd, .5);
  assert.throws(() => budget.reserve(), /budget/); budget.close();
});

test('unknown provider outcomes retain money; successful usage settles its reservation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'father-budget-'));
  const budget = new DevelopmentBudget(directory), fixture = new FixtureProvider(), provider = new BudgetedImageProvider(fixture, budget);
  t.after(async () => { budget.close(); await rm(directory, { recursive: true, force: true }); });
  await provider.generate({ photo: await portrait(), expression: 'grin' });
  assert.equal(budget.summary().knownUsd, .05478);
  fixture.failures.push(new GenerationError('interrupted', 'unknown', { uncertain: true }));
  await assert.rejects(provider.generate({ photo: await portrait(), expression: 'laugh' }));
  assert.equal(budget.summary().reservedUsd, .5);
  await assert.rejects(provider.generate({ photo: await portrait(), expression: 'laugh' }), /budget/);
  assert.equal(fixture.calls.length, 2);
});
