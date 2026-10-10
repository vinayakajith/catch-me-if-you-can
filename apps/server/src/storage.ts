import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AssetStore, CharacterJob, JobStore } from './contracts.ts';

export class SqliteJobStore implements JobStore {
  private db: DatabaseSync;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, 'jobs.sqlite');
    this.db = new DatabaseSync(path); chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS character_jobs (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, idem TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(owner, idem)
    )`);
  }
  get(id: string) { const row = this.db.prepare('SELECT data FROM character_jobs WHERE id = ?').get(id); return row ? JSON.parse(String(row.data)) as CharacterJob : undefined; }
  find(owner: string, key: string) { const row = this.db.prepare('SELECT data FROM character_jobs WHERE owner = ? AND idem = ?').get(owner, key); return row ? JSON.parse(String(row.data)) as CharacterJob : undefined; }
  list() { return this.db.prepare('SELECT data FROM character_jobs').all().map(row => JSON.parse(String(row.data)) as CharacterJob); }
  save(job: CharacterJob) { this.db.prepare('INSERT INTO character_jobs VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(job.id, job.owner, job.idempotencyKey, JSON.stringify(job)); }
  close() { this.db.close(); }
}

export class DiskAssetStore implements AssetStore {
  private root: string;
  constructor(directory: string) { this.root = join(directory, 'assets'); mkdirSync(this.root, { recursive: true, mode: 0o700 }); }
  private path(id: string, name?: string) {
    if (!/^[a-f0-9-]{36}$/.test(id) || (name && (!/^[a-z0-9][a-z0-9.-]*$/.test(name) || name.includes('..')))) throw new Error('Invalid asset path');
    return name ? join(this.root, id, name) : join(this.root, id);
  }
  async read(id: string, name: string) { return readFile(this.path(id, name)); }
  async write(id: string, name: string, data: Buffer) {
    await mkdir(this.path(id), { recursive: true, mode: 0o700 });
    const destination = this.path(id, name), temp = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temp, data, { mode: 0o600 }); await rename(temp, destination);
  }
  async remove(id: string, name?: string) { await rm(this.path(id, name), { recursive: !name, force: true }); }
}
