import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import type { RateLimiter } from '../security.ts';
import type { SpendLedger } from '../budget.ts';
import { GenerationError } from '../contracts.ts';
import { Database, conflict } from './database.ts';

export class DynamoRateLimiter implements RateLimiter {
  readonly db: Database;
  constructor(db: Database) { this.db = db; }
  async take(key: string, limit: number, windowMs: number, now: number) {
    const pk = `LIMIT#${key}#${Math.floor(now / windowMs)}`, ttl = Math.ceil(((Math.floor(now / windowMs) + 1) * windowMs + 3600000) / 1000);
    try { await this.db.client.send(new UpdateCommand({ TableName: this.db.table, Key: { pk, sk: 'META' }, UpdateExpression: 'ADD #n :one SET #ttl = :ttl', ConditionExpression: 'attribute_not_exists(#n) OR #n < :limit', ExpressionAttributeNames: { '#n': 'count', '#ttl': 'ttl' }, ExpressionAttributeValues: { ':one': 1, ':limit': limit, ':ttl': ttl } })); return true; }
    catch (error) { if (conflict(error)) return false; throw error; }
  }
}
// Money uses integer microdollars. Financial records never expire with jobs/rooms.
export class DynamoBudget implements SpendLedger {
  readonly reserveMicros = 200000;
  readonly db: Database; readonly limitMicros: number; readonly requestKey: string;
  constructor(db: Database, limitMicros: number, requestKey: string = randomUUID()) {
    this.db = db; this.limitMicros = limitMicros; this.requestKey = requestKey;
    if (!Number.isSafeInteger(limitMicros) || limitMicros < 0) throw new Error('Invalid production image budget.');
  }
  async remaining() { const item = await this.db.get('IMAGE_BUDGET'); return Math.max(0, this.limitMicros - (item?.used ?? 0)); }
  async reserve() {
    if (this.limitMicros < this.reserveMicros) throw new GenerationError('development_budget', 'Photo generation has reached its budget. Sample artwork is ready to play.', { canRetry: true });
    const id = `IMAGE_SPEND#${this.requestKey}`;
    try {
      await this.db.transact([
        this.db.write({ pk: id, sk: 'META', state: 'reserved', amount: this.reserveMicros, at: Date.now() }),
        { Update: { TableName: this.db.table, Key: { pk: 'IMAGE_BUDGET', sk: 'META' }, UpdateExpression: 'ADD used :amount', ConditionExpression: 'attribute_not_exists(used) OR used <= :remaining', ExpressionAttributeValues: { ':amount': this.reserveMicros, ':remaining': this.limitMicros - this.reserveMicros } } },
      ]); return id;
    } catch (error) {
      if (!conflict(error)) throw error;
      if (await this.db.get(id)) throw new GenerationError('interrupted', 'This image request already started. Its saved progress is being recovered.', { canRetry: true, uncertain: true });
      throw new GenerationError('development_budget', 'Photo generation has reached its budget. Your completed faces are saved. Sample artwork is ready to play.', { canRetry: true });
    }
  }
  async settle(id: string, costUsd: number) {
    if (!Number.isFinite(costUsd) || costUsd < 0) return;
    const amount = Math.ceil(costUsd * 1e6);
    try { await this.db.transact([
      { Update: { TableName: this.db.table, Key: { pk: id, sk: 'META' }, UpdateExpression: 'SET #s = :settled, amount = :actual', ConditionExpression: '#s = :reserved', ExpressionAttributeNames: { '#s': 'state' }, ExpressionAttributeValues: { ':settled': 'settled', ':reserved': 'reserved', ':actual': amount } } },
      { Update: { TableName: this.db.table, Key: { pk: 'IMAGE_BUDGET', sk: 'META' }, UpdateExpression: 'ADD used :delta', ExpressionAttributeValues: { ':delta': amount - this.reserveMicros } } },
    ]); } catch (error) { if (!conflict(error)) throw error; }
  }
}
