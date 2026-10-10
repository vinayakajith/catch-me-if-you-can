import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { GenerationError, type ImageProvider, type ImageResult } from './contracts.ts';

/** One persistent development allowance, independent of job expiry and restarts.
 * Reserve conservatively before calling OpenAI. Unknown charges keep the reserve.
 * The pinned 2.5 request is one 1024px high/medium image, <=2 1024px inputs,
 * and <=4096 prompt bytes (enforced by the provider). Eight measured requests
 * used $0.062117–$0.070414 each; $0.20 retains more than 2.8x headroom.
 * Token rates: https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency
 * This is intentionally not a per-room or daily-reset allowance.
 */
export class DevelopmentBudget {
  private db: DatabaseSync;
  readonly limitUsd: number;
  readonly reserveUsd = .2;
  constructor(directory: string, limitUsd = 1) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, 'development-spend.sqlite');
    this.db = new DatabaseSync(path); chmodSync(path, 0o600);
    this.limitUsd = Math.min(1, Math.max(0, limitUsd));
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS spend (id TEXT PRIMARY KEY, amount REAL NOT NULL, state TEXT NOT NULL, at INTEGER NOT NULL)');
  }
  summary() {
    const rows = this.db.prepare('SELECT amount, state FROM spend').all();
    const knownUsd = rows.filter(r => r.state === 'settled').reduce((sum, r) => sum + Number(r.amount), 0);
    const reservedUsd = rows.filter(r => r.state !== 'settled').reduce((sum, r) => sum + Number(r.amount), 0);
    return { limitUsd: this.limitUsd, knownUsd, reservedUsd, remainingUsd: Math.max(0, this.limitUsd - knownUsd - reservedUsd), requests: rows.length };
  }
  reserve() {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const remaining = this.summary().remainingUsd;
      if (remaining + 1e-9 < this.reserveUsd) throw new GenerationError('development_budget', `Photo generation is paused: $${remaining.toFixed(2)} remains unreserved from the $1.00 budget. The next image needs $${this.reserveUsd.toFixed(2)} of headroom. Your completed faces are saved.`, { canRetry: true });
      const id = randomUUID(); this.db.prepare('INSERT INTO spend VALUES (?, ?, ?, ?)').run(id, this.reserveUsd, 'reserved', Date.now());
      this.db.exec('COMMIT'); return id;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  settle(id: string, costUsd: number) {
    if (Number.isFinite(costUsd) && costUsd >= 0) this.db.prepare('UPDATE spend SET amount=?, state=? WHERE id=?').run(costUsd, 'settled', id);
  }
  close() { this.db.close(); }
}
export class BudgetedImageProvider implements ImageProvider {
  readonly model: string; readonly testMode: boolean;
  get available() { return this.provider.available; }
  get serviceStatus() { return this.provider.serviceStatus; }
  private provider: ImageProvider; private budget: DevelopmentBudget;
  constructor(provider: ImageProvider, budget: DevelopmentBudget) {
    this.provider = provider; this.budget = budget; this.model = provider.model; this.testMode = provider.testMode;
  }
  get canAffordGeneration() { return this.budget.summary().remainingUsd + 1e-9 >= this.budget.reserveUsd; }
  async generate(input: Parameters<ImageProvider['generate']>[0]): Promise<ImageResult> {
    const reservation = this.budget.reserve();
    try {
      const result = await this.provider.generate(input);
      if (result.usage) this.budget.settle(reservation, result.usage.costUsd);
      return result;
    } catch (error) {
      // Access and quota rejection do not start generation. Everything else stays
      // reserved, including timeouts, 5xx, missing usage and crashes.
      if (error instanceof GenerationError && ['access', 'quota', 'not_configured', 'request_limits', 'service_paused'].includes(error.code)) this.budget.settle(reservation, 0);
      throw error;
    }
  }
}
