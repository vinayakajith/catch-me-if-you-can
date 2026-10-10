import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { Database, type Item } from './database.ts';
export class Outbox {
  readonly db: Database; readonly queueUrl: string; readonly sqs: SQSClient;
  constructor(db: Database, queueUrl: string, sqs = new SQSClient({ maxAttempts: 3 })) { this.db = db; this.queueUrl = queueUrl; this.sqs = sqs; }
  async send(item: Item) {
    await this.sqs.send(new SendMessageCommand({ QueueUrl: this.queueUrl, MessageBody: JSON.stringify({ jobId: item.jobId, revision: item.revision }), DelaySeconds: Math.min(900, Math.max(0, Math.ceil((item.availableAt - Date.now()) / 1000))) }));
    await this.db.client.send(new DeleteCommand({ TableName: this.db.table, Key: { pk: item.pk, sk: item.sk } }));
  }
  async dispatch(pk: string) { if (!pk.startsWith('OUTBOX#')) return; const item = await this.db.get(pk); if (item?.gcKind === 'OUTBOX') await this.send(item); }
  async recover() { for (const item of await this.db.due('OUTBOX', Date.now())) await this.send(item); }
}
