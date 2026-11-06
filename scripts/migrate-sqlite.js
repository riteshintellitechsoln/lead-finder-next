// One-time move from the old SQLite database (data/leads.db) to DuckDB
// (data/leads.duckdb): people (same ids), user accounts, login sessions,
// saved leads and tasks. The SQLite file is only read, never changed.
//
//   npm run migrate-sqlite                         uses data/leads.db
//   npm run migrate-sqlite -- "C:\path\to\leads.db"
//
// Needs internet the first time: DuckDB downloads its small "sqlite" reader.
// Stop the website first.
import '../lib/env.js';
import { DuckDBInstance } from '@duckdb/node-api';
import fs from 'node:fs';
import path from 'node:path';
import { explainDbError, rebuildDatabase } from '../lib/schema.js';

const src = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || process.env.DB_FILE || 'data/leads.db');
const dbPath = path.resolve(process.env.DB_PATH || 'data/leads.duckdb');
const sqlString = (s) => `'${String(s).replace(/'/g, "''")}'`;

if (!fs.existsSync(src)) {
  console.error(`SQLite database not found: ${src}`);
  process.exit(1);
}

async function main() {
  const t0 = Date.now();
  console.log(`Copying ${src}\n     -> ${dbPath}\n`);
  if (fs.existsSync(dbPath)) console.log('(The existing DuckDB people are replaced; its accounts and tasks are kept too.)\n');
  const n = async (conn, sql) => Number((await conn.runAndReadAll(sql)).getRowObjectsJS()[0].n);
  // (duckdb_tables() does not list tables of an attached SQLite file, so just try to read it)
  const has = (conn, table) => conn.run(`SELECT 1 FROM sq.${table} LIMIT 0`).then(() => true, () => false);

  const res = await rebuildDatabase({
    DuckDBInstance, dbPath, append: false,
    fillStaging: async (conn) => {
      await conn.run('INSTALL sqlite');
      await conn.run('LOAD sqlite');
      await conn.run(`ATTACH ${sqlString(src)} AS sq (TYPE sqlite, READ_ONLY)`);
      await conn.run(`CREATE OR REPLACE TEMP TABLE staging AS
        SELECT CAST(id AS BIGINT) AS id, name, title, seniority, company, industry, CAST(employees AS VARCHAR) AS employees, city, email
        FROM sq.people`);
      console.log(`  read ${(await n(conn, 'SELECT count(*)::BIGINT n FROM staging')).toLocaleString('en-IN')} people`);
    },
    appStarts: async (conn) => ({
      users: (await has(conn, 'users')) ? await n(conn, 'SELECT coalesce(max(id), 0)::BIGINT n FROM sq.users') : 0,
      tasks: (await has(conn, 'tasks')) ? await n(conn, 'SELECT coalesce(max(id), 0)::BIGINT n FROM sq.tasks') : 0,
    }),
    copyApp: async (conn) => {
      // Accounts from SQLite win over same-email accounts already in DuckDB
      if (await has(conn, 'users')) {
        await conn.run('DELETE FROM sessions WHERE user_id IN (SELECT u.id FROM users u JOIN sq.users s ON lower(s.email) = u.email)');
        await conn.run('DELETE FROM users WHERE email IN (SELECT lower(email) FROM sq.users) OR id IN (SELECT id FROM sq.users)');
        await conn.run(`INSERT INTO users SELECT id, lower(email), name, password_hash, coalesce(role, 'user'), coalesce(blocked, 0) <> 0,
          TRY_CAST(created_at AS TIMESTAMP) FROM sq.users`);
        console.log(`  copied ${await n(conn, 'SELECT count(*)::BIGINT n FROM sq.users')} user accounts`);
      }
      if (await has(conn, 'sessions')) {
        await conn.run('INSERT INTO sessions SELECT token, user_id, expires_at FROM sq.sessions ON CONFLICT DO NOTHING');
      }
      if (await has(conn, 'saved')) {
        await conn.run(`INSERT INTO saved SELECT user_id, person_id, TRY_CAST(created_at AS TIMESTAMP) FROM sq.saved
          WHERE person_id IN (SELECT id FROM people) ON CONFLICT DO NOTHING`);
        console.log(`  copied ${await n(conn, 'SELECT count(*)::BIGINT n FROM saved')} saved leads`);
      }
      if (await has(conn, 'tasks')) {
        await conn.run('DELETE FROM tasks WHERE id IN (SELECT id FROM sq.tasks)');
        await conn.run(`INSERT INTO tasks SELECT id, user_id, title, who, due_date, coalesce(done, 0) <> 0, TRY_CAST(created_at AS TIMESTAMP)
          FROM sq.tasks WHERE user_id IS NOT NULL`);
        console.log(`  copied ${await n(conn, 'SELECT count(*)::BIGINT n FROM sq.tasks WHERE user_id IS NOT NULL')} tasks`);
      }
      await conn.run('DETACH sq');
    },
    options: process.env.DUCKDB_MEMORY_LIMIT ? { memory_limit: process.env.DUCKDB_MEMORY_LIMIT } : {},
  });
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${res.people.toLocaleString('en-IN')} people, ` +
    `${res.companies.toLocaleString('en-IN')} companies. Start the website with "npm start".`);
}

main().catch((e) => {
  console.error('\nMigration failed:', explainDbError(e, dbPath));
  process.exit(1);
});
