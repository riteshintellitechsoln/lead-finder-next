// Admin "Upload CSV" (server only). The upload is streamed to a temporary file
// (any size, low memory), DuckDB reads it with read_csv, and new tables are
// built next to the live ones and swapped in at the end. The site keeps
// answering searches with the old data while the import runs.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DB_PATH, dataChanged, dedicatedConnection } from './db.js';
import { loadCsvIntoStaging } from './csv.js';
import { HttpError } from './route.js';
import { rebuildInPlace } from './schema.js';

let running = false;

/** webStream: the request body. replace: delete existing people (saved lists are cleared too). */
export async function importUpload(webStream, { replace = false, log = () => {} } = {}) {
  if (running) throw new HttpError(409, 'Another import is still running. Wait for it to finish.');
  running = true;
  const t0 = Date.now();
  const dir = path.join(path.dirname(DB_PATH), 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `upload-${Date.now()}.csv`);
  let conn;
  try {
    await pipeline(Readable.fromWeb(webStream), fs.createWriteStream(file));
    const mb = fs.statSync(file).size / 1048576;
    if (!mb) throw new HttpError(400, 'The uploaded file is empty');
    log(`Received ${mb.toFixed(1)} MB`);
    conn = await dedicatedConnection();
    const { rows } = await loadCsvIntoStaging(conn, file, log);
    log(replace ? 'Replacing all people…' : 'Adding to existing people…');
    const result = await rebuildInPlace(conn, { append: !replace, log });
    dataChanged();
    const seconds = (Date.now() - t0) / 1000;
    log(`Done in ${seconds.toFixed(1)}s. The database now has ${result.people.toLocaleString('en-IN')} people.`);
    return { imported: rows, people: result.people, seconds };
  } finally {
    running = false;
    try { conn?.closeSync(); } catch { /* ignore */ }
    fs.rmSync(file, { force: true });
  }
}
