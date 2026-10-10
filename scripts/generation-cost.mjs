import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Read only: never create/reset the ledger or load the API key to report usage.
const path = fileURLToPath(new URL('../.father-hunter/development-spend.sqlite', import.meta.url));
let requests = 0, known = 0, reserved = 0;
if (existsSync(path)) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    for (const row of db.prepare('SELECT amount, state FROM spend').all()) {
      requests++;
      if (row.state === 'settled') known += Number(row.amount); else reserved += Number(row.amount);
    }
  } finally { db.close(); }
}
console.log(`Development limit: $1.00 total\nRecorded usage: $${known.toFixed(6)}\nPending or uncertain reservations: $${reserved.toFixed(6)}\nAvailable headroom: $${Math.max(0, 1 - known - reserved).toFixed(6)}\nRequests recorded: ${requests}`);
