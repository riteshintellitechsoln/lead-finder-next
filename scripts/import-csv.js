// Imports YOUR data from a CSV file into the database (data/leads.duckdb).
//
//   npm run import -- "C:\path\to\people.csv"             adds to existing people
//   npm run import -- "C:\path\to\people.csv" --replace   replaces all people
//
// Uses DuckDB's read_csv (millions of rows per minute, low memory). Column
// names are detected automatically, including Apollo exports ("First Name",
// "Last Name", "Title", "Company", "# Employees", "Industry", "City", "Email");
// see lib/csv.js. Seniority is guessed from the title when missing.
// Stop the website first: a DuckDB file can be opened by one program at a time.
// (Admin > Data > Upload CSV does the same from the browser, with the site running.)
import '../lib/env.js';
import { DuckDBInstance } from '@duckdb/node-api';
import fs from 'node:fs';
import path from 'node:path';
import { loadCsvIntoStaging } from '../lib/csv.js';
import { explainDbError, rebuildDatabase } from '../lib/schema.js';

const args = process.argv.slice(2);
const replace = args.includes('--replace');
const file = args.find((a) => !a.startsWith('--'));
const dbPath = path.resolve(process.env.DB_PATH || 'data/leads.duckdb');

if (!file) {
  console.error('Usage: npm run import -- "path\\to\\file.csv" [--replace]');
  process.exit(1);
}
const csvPath = path.resolve(file);
if (!fs.existsSync(csvPath) || !fs.statSync(csvPath).isFile()) {
  console.error(`File not found: ${csvPath}\n` +
    'Check the path. Tip: in PowerShell, drag the file into the window to paste its full path, and keep the quotes.');
  process.exit(1);
}

async function main() {
  const t0 = Date.now();
  console.log(`Importing ${csvPath} (${(fs.statSync(csvPath).size / 1048576).toFixed(1)} MB) into ${dbPath} ` +
    `${replace ? '(replacing all people)' : '(adding to existing people)'}\n`);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const res = await rebuildDatabase({
    DuckDBInstance, dbPath, append: !replace,
    fillStaging: async (conn) => {
      await loadCsvIntoStaging(conn, csvPath, console.log);
      console.log('Building search tables…');
    },
    options: process.env.DUCKDB_MEMORY_LIMIT ? { memory_limit: process.env.DUCKDB_MEMORY_LIMIT } : {},
  });
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s. Database now has ${res.people.toLocaleString('en-IN')} people, ` +
    `${res.companies.toLocaleString('en-IN')} companies, ${res.titles.toLocaleString('en-IN')} job titles.`);
  if (res.savedCleared) console.log('Saved leads were cleared because the people were replaced (accounts and tasks were kept).');
  console.log('Start the website again with "npm start" (or "pm2 restart lead-finder").');
}

main().catch((e) => {
  console.error('\nImport failed:', explainDbError(e, dbPath));
  process.exit(1);
});
