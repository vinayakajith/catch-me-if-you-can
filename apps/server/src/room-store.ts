import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import type { ActionResult, CatchEvent, CharacterPack, HuntCheckpoint, PlacementMix } from '../../../packages/game-core/src/index.ts';

export interface RoomAttempt {
  id: string; key: string; controller: string; checkpoint: HuntCheckpoint;
  ack: number; moveCredit: number; creditAt: number;
  receipts: { seq: number; result: ActionResult }[];
}
export interface RoomPlayer {
  id: string; owner: string; name: string; joinedAt: number; bestScore: number; attempt: RoomAttempt | null;
}
export interface RoomRecord {
  id: string; owner: string; key: string; revision: number; father: CharacterPack;
  creationFingerprint?: string;
  createdAt: number; expiresAt: number; resultsExpireAt: number; mix: PlacementMix;
  players: RoomPlayer[]; events: CatchEvent[]; cursor: number; cleaned: boolean;
}
type Awaitable<T> = T | Promise<T>;
export interface RoomStore {
  get(id: string): Awaitable<RoomRecord | undefined>;
  find(owner: string, key: string): Awaitable<RoomRecord | undefined>;
  insert(room: RoomRecord): Awaitable<boolean>;
  save(room: RoomRecord, revision: number): Awaitable<boolean>;
  list(): Awaitable<RoomRecord[]>;
  remove(id: string): Awaitable<void>;
  close(): Awaitable<void>;
}
// Versioned writes keep room operations portable to DynamoDB conditional writes.
export class SqliteRoomStore implements RoomStore {
  private db: DatabaseSync;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, 'rooms.sqlite'); this.db = new DatabaseSync(path); chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, owner TEXT NOT NULL, idem TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL, UNIQUE(owner, idem));`);
  }
  get(id: string) { const r = this.db.prepare('SELECT data FROM rooms WHERE id=?').get(id); return r ? JSON.parse(String(r.data)) as RoomRecord : undefined; }
  find(owner: string, key: string) { const r = this.db.prepare('SELECT data FROM rooms WHERE owner=? AND idem=?').get(owner, key); return r ? JSON.parse(String(r.data)) as RoomRecord : undefined; }
  insert(room: RoomRecord) { return this.db.prepare('INSERT OR IGNORE INTO rooms VALUES (?,?,?,?,?)').run(room.id, room.owner, room.key, room.revision, JSON.stringify(room)).changes === 1; }
  save(room: RoomRecord, revision: number) { room.revision = revision + 1; return this.db.prepare('UPDATE rooms SET revision=?,data=? WHERE id=? AND revision=?').run(room.revision, JSON.stringify(room), room.id, revision).changes === 1; }
  list() { return this.db.prepare('SELECT data FROM rooms').all().map(r => JSON.parse(String(r.data)) as RoomRecord); }
  remove(id: string) { this.db.prepare('DELETE FROM rooms WHERE id=?').run(id); }
  close() { this.db.close(); }
}
