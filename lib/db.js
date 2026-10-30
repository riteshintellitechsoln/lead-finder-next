// SQLite connection (server only). One file: data/leads.db. No database server needed.
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { hashPassword } from './password.js';

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
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name          TEXT,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user',   -- 'admin' | 'user'
      blocked       INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id         INTEGER PRIMARY KEY,
      title      TEXT NOT NULL,
      who        TEXT,
      due_date   TEXT,
      done       INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);
  for (const [name, on] of Object.entries(INDEXES)) conn.exec(`CREATE INDEX IF NOT EXISTS ${name} ON ${on}`);
  // IMMEDIATE takes the write lock first, so several processes starting at once
  // (e.g. build workers) run this one after another instead of all seeding
  conn.transaction(() => {
    seed(conn);
    migrate(conn);
  }).immediate();
  return conn;
}

// First run: one admin and one user account
function seed(conn) {
  if (!conn.prepare('SELECT COUNT(*) AS n FROM users').get().n) {
    const add = conn.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)');
    const admin = [process.env.ADMIN_EMAIL || 'admin@leadfinder.local', process.env.ADMIN_PASSWORD || 'admin123'];
    const user = [process.env.USER_EMAIL || 'user@leadfinder.local', process.env.USER_PASSWORD || 'user123'];
    add.run(admin[0], 'Admin', hashPassword(admin[1]), 'admin');
    add.run(user[0], 'User', hashPassword(user[1]), 'user');
    console.log(`Created accounts: admin ${admin[0]} / ${admin[1]}, user ${user[0]} / ${user[1]}. Change these passwords.`);
  }
}

// Older databases had saved leads and tasks without an owner: give them to the first normal user
function migrate(conn) {
  const cols = (table) => conn.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  const owner = () => conn.prepare("SELECT id FROM users WHERE role = 'user' ORDER BY id").get()?.id ?? 1;

  const savedCols = cols('saved');
  if (!savedCols.length || !savedCols.includes('user_id')) {
    conn.transaction(() => {
      if (savedCols.length) conn.exec('ALTER TABLE saved RENAME TO saved_old');
      conn.exec(`CREATE TABLE saved (
        user_id    INTEGER NOT NULL,
        person_id  INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, person_id)
      )`);
      if (savedCols.length) {
        conn.prepare('INSERT INTO saved (user_id, person_id, created_at) SELECT ?, person_id, created_at FROM saved_old').run(owner());
        conn.exec('DROP TABLE saved_old');
      }
    })();
  }
  if (!cols('tasks').includes('user_id')) {
    conn.exec('ALTER TABLE tasks ADD COLUMN user_id INTEGER');
    conn.prepare('UPDATE tasks SET user_id = ? WHERE user_id IS NULL').run(owner());
  }
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
