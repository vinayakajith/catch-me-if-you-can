import { randomUUID } from 'node:crypto';
import { DynamoDBClient, CreateTableCommand, DeleteTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Database } from '../../src/aws/database.ts';
import { S3Assets } from '../../src/aws/assets.ts';
import { CloudJobs } from '../../src/aws/jobs.ts';
import { FixtureProvider } from '../fixtures.ts';

export async function fixture() {
  const endpoint = process.env.FH_DYNAMO_ENDPOINT;
  if (!endpoint || !/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error('Tests require an explicit local DynamoDB endpoint. AWS endpoints are forbidden.');
  const client = new DynamoDBClient({ endpoint, region: 'local', credentials: { accessKeyId: 'local', secretAccessKey: 'local' }, maxAttempts: 3 });
  const table = `father-test-${randomUUID()}`;
  await client.send(new CreateTableCommand({ TableName: table, BillingMode: 'PAY_PER_REQUEST', KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }], AttributeDefinitions: [
    { AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'sk', AttributeType: 'S' }, { AttributeName: 'gcKind', AttributeType: 'S' }, { AttributeName: 'gcAt', AttributeType: 'N' },
  ], GlobalSecondaryIndexes: [{ IndexName: 'cleanup', KeySchema: [{ AttributeName: 'gcKind', KeyType: 'HASH' }, { AttributeName: 'gcAt', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } }] }));
  const db = new Database(table, DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } }));
  const assets = new MemoryAssets(), provider = new FixtureProvider(); let now = Date.now();
  const clock = () => now;
  const jobs = () => new CloudJobs({ db, assets, provider: async () => provider, model: 'test-fixture', enabled: true, budgetMicros: 1000000, clock, testMode: true });
  return { db, assets, provider, jobs, clock, advance: (ms: number) => { now += ms; }, async close() { await client.send(new DeleteTableCommand({ TableName: table })); client.destroy(); assets.client.destroy(); } };
}
export class MemoryAssets extends S3Assets {
  objects = new Map<string, Buffer>();
  failRecoveryDelete = false;
  constructor() { super('fixture-assets', new S3Client({ region: 'local', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } })); }
  override async read(id: string, name: string) { const value = this.objects.get(this.key(id, name)); if (!value) { const error = new Error('Missing fixture object'); error.name = 'NoSuchKey'; throw error; } return Buffer.from(value); }
  override async write(id: string, name: string, value: Buffer) { this.objects.set(this.key(id, name), Buffer.from(value)); }
  override async remove(id: string, name?: string) {
    if (name?.startsWith('result-') && this.failRecoveryDelete) throw new Error('Simulated cleanup outage');
    const prefix = this.key(id, name); for (const key of this.objects.keys()) if (name ? key === prefix : key.startsWith(prefix)) this.objects.delete(key);
  }
  override async upload(id: string) { return { url: 'https://fixture-assets.s3.local/', fields: { key: this.key(id, 'upload.jpg') } }; }
  override async uploaded(id: string) { await this.read(id, 'upload.jpg'); return 'fixture-etag'; }
}
