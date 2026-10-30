// Imports YOUR data from a CSV file into the database.
// Usage:
//   node scripts/import-csv.js path/to/people.csv            (adds to existing data)
//   node scripts/import-csv.js path/to/people.csv --replace  (deletes old people first)
//
// The admin panel (Admin > Data > Upload CSV) does the same from the browser.
// Header names it recognizes are listed in lib/import.js (COLUMN_NAMES).
import fs from 'node:fs';
import { importCsv } from '../lib/import.js';

const file = process.argv[2];
const replace = process.argv.includes('--replace');
if (!file || !fs.existsSync(file)) {
  console.error('Usage: node scripts/import-csv.js path/to/people.csv [--replace]');
  process.exit(1);
}

importCsv(fs.createReadStream(file), { replace, log: console.log })
  .then(() => console.log('Restart the app (npm run dev / npm start) to see the new data.'))
  .catch((err) => {
    console.error('Import failed:', err.message);
    process.exit(1);
  });
