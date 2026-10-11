import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { Database } from './database.ts';
import { DynamoRoomStore } from './room-store.ts';
import { DynamoSocketStore } from './socket-store.ts';
import { DynamoRateLimiter } from './limits.ts';
import { SharedRooms } from '../shared-rooms.ts';
import { Realtime } from '../realtime.ts';

let instance: Realtime | undefined;
function prepare(domain: string, stage: string) {
  const db = new Database(process.env.FH_TABLE!);
  const management = new ApiGatewayManagementApiClient({ endpoint: `https://${domain}/${stage}`, maxAttempts: 2 });
  return new Realtime(new SharedRooms(new DynamoRoomStore(db)), new DynamoSocketStore(db), async (id, message) => {
    await management.send(new PostToConnectionCommand({ ConnectionId: id, Data: Buffer.from(JSON.stringify(message)) }));
  }, new DynamoRateLimiter(db));
}
export async function handler(event: { requestContext: { connectionId: string; routeKey: string; domainName: string; stage: string }; headers?: Record<string, string>; queryStringParameters?: Record<string, string>; body?: string }) {
  const c = event.requestContext;
  instance ??= prepare(c.domainName, c.stage);
  if (c.routeKey === '$connect') {
    const origin = Object.entries(event.headers ?? {}).find(([k]) => k.toLowerCase() === 'origin')?.[1];
    if (!origin || origin !== process.env.FATHER_HUNTER_PUBLIC_ORIGIN) return { statusCode: 403 };
    try { await instance.connect(c.connectionId, event.queryStringParameters?.ticket ?? '', origin); return { statusCode: 200 }; }
    catch { return { statusCode: 403 }; }
  }
  if (c.routeKey === '$disconnect') await instance.disconnect(c.connectionId);
  else await instance.message(c.connectionId, event.body ?? '');
  return { statusCode: 200 };
}
