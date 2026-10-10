import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
export type Item = Record<string, any> & { pk: string; sk: string };
export type Write = NonNullable<TransactWriteCommandInput['TransactItems']>[number];
export const conflict = (error: unknown) => ['ConditionalCheckFailedException', 'TransactionCanceledException'].includes((error as Error).name);
export class Database {
  readonly client: DynamoDBDocumentClient; readonly table: string;
  constructor(table: string, client = DynamoDBDocumentClient.from(new DynamoDBClient({ maxAttempts: 3 }), { marshallOptions: { removeUndefinedValues: true } })) { this.table = table; this.client = client; }
  async get(pk: string, sk = 'META'): Promise<Item | undefined> { return (await this.client.send(new GetCommand({ TableName: this.table, Key: { pk, sk }, ConsistentRead: true }))).Item as Item | undefined; }
  put(item: Item, absent = false) { return this.client.send(new PutCommand({ TableName: this.table, Item: item, ...(absent ? { ConditionExpression: 'attribute_not_exists(pk)' } : {}) })); }
  async query(pk: string) {
    const items: Item[] = []; let cursor: Record<string, any> | undefined;
    do { const result = await this.client.send(new QueryCommand({ TableName: this.table, KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': pk }, ConsistentRead: true, ExclusiveStartKey: cursor })); items.push(...(result.Items ?? []) as Item[]); cursor = result.LastEvaluatedKey; } while (cursor);
    return items;
  }
  async due(kind: string, now: number) {
    const items: Item[] = []; let cursor: Record<string, any> | undefined;
    do { const result = await this.client.send(new QueryCommand({ TableName: this.table, IndexName: 'cleanup', KeyConditionExpression: 'gcKind = :kind AND gcAt <= :now', ExpressionAttributeValues: { ':kind': kind, ':now': now }, ExclusiveStartKey: cursor })); items.push(...(result.Items ?? []) as Item[]); cursor = result.LastEvaluatedKey; } while (cursor);
    return items;
  }
  async transact(items: Write[]) {
    if (!items.length) return;
    await this.client.send(new TransactWriteCommand({ TransactItems: items }));
  }
  write(item: Item, revision?: number): Write {
    if (Buffer.byteLength(JSON.stringify(item)) > 350000) throw new Error('Stored item exceeded its safe size.');
    return { Put: { TableName: this.table, Item: item, ConditionExpression: revision === undefined ? 'attribute_not_exists(pk)' : '#v = :v', ...(revision === undefined ? {} : { ExpressionAttributeNames: { '#v': 'version' }, ExpressionAttributeValues: { ':v': revision } }) } };
  }
}
