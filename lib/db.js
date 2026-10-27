// SQLite connection (server only). One file: data/leads.db. No database server needed.
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DB_FILE = process.env.DB_FILE || path.join(process.cwd(), 'data', 'leads.db');

const INDEXES = {
  idx_people_city: 'people(city)',
  idx_people_seniority: 'people(seniority)',
  idx_people_industry: 'people(industry)',
  idx_people_employees: 'people(employees)',
  idx_people_company: 'people(company)',
  idx_people_title: 'people(title)',
  idx_people_name: 'people(name)',
};

function open() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const conn = new Database(DB_FILE);
  conn.pragma('journal_mode = WAL');
  conn.pragma('synchronous = NORMAL');
  conn.pragma('cache_size = -200000'); // ~200 MB page cache
  conn.pragma('temp_store = MEMORY');
  conn.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      title      TEXT,
      seniority  TEXT,
      company    TEXT,
      industry   TEXT,
      employees  INTEGER,
      city       TEXT,
      email      TEXT
    );
    CREATE TABLE IF NOT EXISTS saved (
      person_id  INTEGER PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id         INTEGER PRIMARY KEY,
      title      TEXT NOT NULL,
      who        TEXT,
      due_date   TEXT,
      done       INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  for (const [name, on] of Object.entries(INDEXES)) conn.exec(`CREATE INDEX IF NOT EXISTS ${name} ON ${on}`);
  return conn;
}

// Reuse one connection, also across hot reloads in `next dev`
export const db = globalThis.__leadFinderDb ?? (globalThis.__leadFinderDb = open());

export function createIndexes() {
  for (const [name, on] of Object.entries(INDEXES)) db.exec(`CREATE INDEX IF NOT EXISTS ${name} ON ${on}`);
  db.exec('ANALYZE');
}

// Dropping indexes before a big import makes inserts much faster
export function dropIndexes() {
  for (const name of Object.keys(INDEXES)) db.exec(`DROP INDEX IF EXISTS ${name}`);
}
