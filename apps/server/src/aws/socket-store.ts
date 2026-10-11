import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { SocketIdentity, SocketStore, SocketTicket } from '../realtime.ts';
import { Database, conflict } from './database.ts';
export class DynamoSocketStore implements SocketStore {
  readonly db: Database;
  constructor(db: Database) { this.db = db; }
  async ticket(hash: string, data: SocketTicket) { await this.db.put({ pk: 'TICKET#' + hash, sk: 'META', ...data, ttl: Math.ceil(data.expiresAt / 1000) }, true); }
  async consume(hash: string, now: number) {
    try {
      const result = await this.db.client.send(new DeleteCommand({ TableName: this.db.table, Key: { pk: 'TICKET#' + hash, sk: 'META' },
        ConditionExpression: 'expiresAt > :now', ExpressionAttributeValues: { ':now': now }, ReturnValues: 'ALL_OLD' }));
      return result.Attributes as SocketTicket | undefined;
    } catch (error) { if (conflict(error)) return undefined; throw error; }
  }
  async put(data: SocketIdentity) {
    const ttl = Math.ceil((data.expiresAt + 60000) / 1000);
    await this.db.transact([this.db.write({ pk: 'SOCKET#' + data.id, sk: 'META', ...data, ttl }), this.db.write({ pk: 'SOCKETS#' + data.roomId, sk: data.id, ...data, ttl })]);
  }
  async get(id: string) { return await this.db.get('SOCKET#' + id) as unknown as SocketIdentity | undefined; }
  async list(roomId: string) { return await this.db.query('SOCKETS#' + roomId) as unknown as SocketIdentity[]; }
  async remove(data: SocketIdentity) {
    await this.db.transact([{ Delete: { TableName: this.db.table, Key: { pk: 'SOCKET#' + data.id, sk: 'META' } } }, { Delete: { TableName: this.db.table, Key: { pk: 'SOCKETS#' + data.roomId, sk: data.id } } }]);
  }
}
