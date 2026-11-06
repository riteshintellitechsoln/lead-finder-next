// Tiny SQL console for debugging:  node scripts/sql.js "SELECT count(*) FROM people"
import '../lib/env.js';
import { DuckDBInstance } from '@duckdb/node-api';
import path from 'node:path';
import { explainDbError } from '../lib/schema.js';

const dbPath = path.resolve(process.env.DB_PATH || 'data/leads.duckdb');
const sql = process.argv.slice(2).join(' ');
if (!sql) { console.error('Usage: node scripts/sql.js "<SQL>"'); process.exit(1); }
try {
  const instance = await DuckDBInstance.create(dbPath, { access_mode: 'READ_ONLY' });
  const conn = await instance.connect();
  const t = performance.now();
  const r = await conn.runAndReadAll(sql);
  const ms = performance.now() - t;
  console.table(r.getRowObjectsJson());
  console.log(`${ms.toFixed(1)} ms`);
} catch (e) {
  console.error(explainDbError(e, dbPath));
  process.exit(1);
}
