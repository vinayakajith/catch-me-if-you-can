import type { RoomRecord, RoomStore } from '../room-store.ts';
import { isDeepStrictEqual } from 'node:util';
import { Database, conflict, type Item, type Write } from './database.ts';
const pk = (id: string) => `ROOM#${id}`;
function rows(room: RoomRecord) {
  const { players, events, shared, ...meta } = room;
  const result = new Map<string, unknown>([['META', { ...meta, playerIds: players.map(p => p.id) }]]);
  if (shared) result.set('SHARED', shared);
  for (const { attempt, ...player } of players) { result.set(`PLAYER#${player.id}`, player); if (attempt) result.set(`ATTEMPT#${player.id}`, attempt); }
  for (const event of events) result.set(`EVENT#${String(event.id).padStart(12, '0')}`, event);
  return result;
}
export class DynamoRoomStore implements RoomStore {
  private originals = new WeakMap<RoomRecord, Item[]>();
  readonly db: Database; readonly clock: () => number;
  constructor(db: Database, clock: () => number = Date.now) { this.db = db; this.clock = clock; }
  async get(id: string) {
    const items = await this.db.query(pk(id)), meta = items.find(i => i.sk === 'META'); if (!meta) return;
    const room: RoomRecord = { ...meta.data, players: meta.data.playerIds.map((playerId: string) => ({ ...items.find(i => i.sk === `PLAYER#${playerId}`)?.data, attempt: items.find(i => i.sk === `ATTEMPT#${playerId}`)?.data ?? null })), events: items.filter(i => i.sk.startsWith('EVENT#')).map(i => i.data) };
    delete (room as RoomRecord & { playerIds?: string[] }).playerIds;
    // The rules mutate nested checkpoints and receipts. Keep a detached baseline
    // so those mutations remain visible to the per-item write comparison.
    if (items.some(i => i.sk === 'SHARED')) room.shared = items.find(i => i.sk === 'SHARED')!.data;
    this.originals.set(room, structuredClone(items)); return room;
  }
  async find(owner: string, key: string) { const record = await this.db.get(`ROOMKEY#${owner}#${key}`); return record ? this.get(record.roomId) : undefined; }
  private item(room: RoomRecord, sk: string, data: unknown, version = 1): Item {
    return { pk: pk(room.id), sk, data, version, ttl: Math.ceil(room.resultsExpireAt / 1000), ...(sk === 'META' ? { gcKind: 'ROOM', gcAt: room.cleaned ? room.resultsExpireAt : room.expiresAt } : {}) };
  }
  async insert(room: RoomRecord) {
    try { await this.db.transact([...rows(room)].map(([sk, data]) => this.db.write(this.item(room, sk, data))).concat(this.db.write({ pk: `ROOMKEY#${room.owner}#${room.key}`, sk: 'META', roomId: room.id, ttl: Math.ceil(room.resultsExpireAt / 1000) }))); return true; }
    catch (error) { if (conflict(error)) return false; throw error; }
  }
  async save(room: RoomRecord, revision: number) {
    const original = this.originals.get(room); if (!original) throw new Error('Read a room before updating it.');
    const previous = new Map(original.map(item => [item.sk, item])), next = rows(room), writes: Write[] = [];
    const metadataChanged = !isDeepStrictEqual(previous.get('META')!.data, next.get('META'));
    if (metadataChanged) { room.revision = revision + 1; next.set('META', { ...(next.get('META') as object), revision: room.revision }); }
    for (const [sk, data] of next) {
      const old = previous.get(sk);
      if (old && isDeepStrictEqual(data, old.data)) continue;
      writes.push(this.db.write(this.item(room, sk, data, (old?.version ?? 0) + 1), old?.version));
    }
    for (const [sk, old] of previous) if (!next.has(sk)) writes.push({ Delete: { TableName: this.db.table, Key: { pk: old.pk, sk }, ConditionExpression: '#v = :v', ExpressionAttributeNames: { '#v': 'version' }, ExpressionAttributeValues: { ':v': old.version } } });
    if (!writes.length) return true;
    if (!metadataChanged) writes.push({ ConditionCheck: { TableName: this.db.table, Key: { pk: pk(room.id), sk: 'META' }, ConditionExpression: '#v = :v', ExpressionAttributeNames: { '#v': 'version' }, ExpressionAttributeValues: { ':v': previous.get('META')!.version } } });
    try { await this.db.transact(writes); return true; } catch (error) { if (conflict(error)) return false; throw error; }
  }
  async list() { const result: RoomRecord[] = []; for (const item of await this.db.due('ROOM', this.clock())) { const room = await this.get(item.data.id); if (room) result.push(room); } return result; }
  async remove(id: string) {
    const items = await this.db.query(pk(id));
    // Conditional deletion cannot erase a concurrent change or resurrect an expired room.
    for (let start = 0; start < items.length; start += 90) await this.db.transact(items.slice(start, start + 90).map(item => ({ Delete: { TableName: this.db.table, Key: { pk: item.pk, sk: item.sk }, ConditionExpression: '#v = :v', ExpressionAttributeNames: { '#v': 'version' }, ExpressionAttributeValues: { ':v': item.version } } })));
  }
  close() {}
}
