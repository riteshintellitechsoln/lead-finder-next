// Reads a CSV file with DuckDB's read_csv (millions of rows per minute, low
// memory) into the temp table `staging` used by the build step in schema.js.
// Column names are detected automatically, including Apollo exports.
// Shared by scripts/import-csv.js and the admin "Upload CSV" page.
import fs from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { COUNTRIES, FUNCTIONS, INDUSTRIES, SENIORITY_LEVELS, SIZE_KEYS } from './options.js';

// Normalized header (lowercase, letters and digits only) -> our field. Earlier entries win.
export const CANDIDATES = {
  name: ['name', 'fullname', 'personname', 'contactname', 'contact'],
  first: ['firstname', 'first', 'fname', 'givenname'],
  last: ['lastname', 'last', 'lname', 'surname', 'familyname'],
  title: ['title', 'jobtitle', 'designation', 'position', 'role', 'persontitle', 'currenttitle', 'headline'],
  seniority: ['seniority', 'senioritylevel', 'level', 'joblevel'],
  department: ['department', 'departments', 'dept', 'function', 'jobfunction', 'subdepartments', 'functionalarea'],
  company: ['company', 'companyname', 'organization', 'organisation', 'organizationname', 'organisationname', 'account', 'accountname', 'employer', 'currentcompany', 'companynameforemails'],
  domain: ['domain', 'companydomain', 'website', 'companywebsite', 'websiteurl', 'companyurl', 'url', 'site', 'web', 'emaildomain'],
  industry: ['industry', 'companyindustry', 'sector', 'industries'],
  employees: ['employees', 'numberofemployees', 'noofemployees', 'employeecount', 'employeescount', 'numemployees', 'companysize', 'size', 'headcount', 'companyheadcount', 'staffcount', 'employeesize', 'employeesizerange', 'companyemployeesize', 'companyemployees'],
  revenue: ['revenue', 'annualrevenue', 'companyrevenue', 'estimatedrevenue', 'revenuerange', 'revenueusd', 'turnover'],
  techs: ['technologies', 'technology', 'techstack', 'installbase', 'installedbase', 'companytechnologies', 'tech', 'technographics'],
  city: ['city', 'personcity', 'contactcity', 'town', 'location', 'companycity'],
  county: ['county', 'district', 'personcounty', 'companycounty', 'companydistrict'],
  state: ['state', 'personstate', 'contactstate', 'province', 'stateprovince', 'region', 'companystate'],
  country: ['country', 'personcountry', 'contactcountry', 'nation', 'companycountry'],
  zip: ['zip', 'zipcode', 'postalcode', 'postcode', 'pincode', 'pin', 'personzip', 'personpostalcode', 'companyzip', 'companypostalcode', 'companypincode', 'zippostalcode', 'zippostcode', 'postalzipcode', 'postalcodezip'],
  email: ['email', 'emailaddress', 'emailadress', 'emailaddres', 'emailadres', 'workemail', 'businessemail', 'emailid', 'mail', 'primaryemail', 'personalemail'],
  email_status: ['emailstatus', 'emailverificationstatus', 'emailverification', 'verificationstatus', 'emailconfidence', 'emailquality', 'primaryemailstatus'],
  phone: ['phone', 'companyphone', 'corporatephone', 'workphone', 'officephone', 'phonenumber', 'businessphone', 'telephone', 'tel', 'hqphone', 'firstphone', 'otherphone'],
  direct_phone: ['directphone', 'workdirectphone', 'directdial', 'directnumber', 'mobile', 'mobilephone', 'mobilenumber', 'mobileno', 'cell', 'cellphone', 'personalphone'],
  address1: ['address1', 'address', 'addressline1', 'streetaddress', 'street', 'street1', 'personaddress', 'companyaddress'],
  address2: ['address2', 'addressline2', 'street2'],
  linkedin: ['employeelinkedinurl', 'employeelinkedin', 'personlinkedinurl', 'personlinkedin', 'linkedinurl', 'linkedin', 'linkedinprofile', 'linkedinprofileurl', 'profileurl', 'contactlinkedinurl'],
  company_linkedin: ['companylinkedinurl', 'companylinkedin', 'organizationlinkedinurl', 'accountlinkedinurl'],
  updated_at: ['updatedon', 'updatedat', 'updated', 'lastupdated', 'lastupdatedon', 'lastupdatedat', 'modifiedon', 'lastmodified'],
  verified_at: ['verifiedon', 'verifiedat', 'verifieddate', 'lastverified', 'lastverifiedon', 'lastverifiedat', 'emailverifiedon', 'emailverifiedat', 'emaillastverifiedat', 'primaryemaillastverifiedat', 'verificationdate'],
};

export // Every staging column filled straight from one file column
const FIELDS = ['title', 'seniority', 'department', 'company', 'domain', 'industry', 'employees', 'revenue', 'techs',
  'city', 'county', 'state', 'country', 'zip', 'email', 'email_status', 'phone', 'direct_phone', 'verified_at',
  'address1', 'address2', 'linkedin', 'company_linkedin', 'updated_at'];

async function isUtf8(file) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for await (const chunk of fs.createReadStream(file)) decoder.decode(chunk, { stream: true });
    decoder.decode();
    return true;
  } catch {
    return false;
  }
}

/**
 * DuckDB reads UTF-8 only and silently skips rows it cannot read. Excel's
 * "CSV (Comma delimited)" saves Windows-1252 (é, ñ, ’ as single bytes), so such
 * a file is rewritten as UTF-8 in place. Only for our own temporary upload copies.
 */
export async function toUtf8(file, log = () => {}) {
  if (await isUtf8(file)) return false;
  const decoder = new TextDecoder('windows-1252');
  const tmp = `${file}.utf8`;
  await pipeline(
    fs.createReadStream(file),
    new Transform({
      transform(chunk, _enc, done) { done(null, decoder.decode(chunk, { stream: true })); },
      flush(done) { done(null, decoder.decode()); },
    }),
    fs.createWriteStream(tmp),
  );
  fs.renameSync(tmp, file);
  log('The file is not UTF-8 (Excel "CSV (Comma delimited)"), so it was read as Western (Windows-1252) text.');
  return true;
}

/**
 * Runs build(extraOptions) with DuckDB's fast parallel CSV reader, and again with
 * parallel = false when the file has line breaks inside quoted cells (the fast
 * reader refuses those).
 */
export async function withCsvRetry(build) {
  try {
    return await build('');
  } catch (e) {
    if (!/parallel\s*=\s*false/i.test(String(e?.message))) throw e;
    return build(', parallel = false');
  }
}

export const norm = (h) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
const sqlString = (s) => `'${String(s).replace(/'/g, "''")}'`;
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

export function mapColumns(headers) {
  const byNorm = new Map();
  for (const h of headers) if (!byNorm.has(norm(h))) byNorm.set(norm(h), h);
  const map = {};
  for (const [key, list] of Object.entries(CANDIDATES)) {
    const hit = list.find((c) => byNorm.has(c));
    if (hit) map[key] = byNorm.get(hit);
  }
  return map;
}

/**
 * "6/1/2026" is 6 January in India and 1 June in the US. One file uses one order, so
 * the whole column decides: a first part above 12 ("9/13/2026") means month first.
 * Such a column is rewritten as YYYY-MM-DD; otherwise day first stays the default.
 */
async function fixDateOrder(conn, log) {
  for (const col of ['verified_at', 'updated_at']) {
    const c = `trim(${col})`;
    const [r] = (await conn.runAndReadAll(`SELECT
        count(*) FILTER (WHERE regexp_matches(${c}, '^(1[3-9]|2[0-9]|3[01])[/.-][0-9]{1,2}[/.-][0-9]{4}'))::BIGINT AS day_first,
        count(*) FILTER (WHERE regexp_matches(${c}, '^[0-9]{1,2}[/.-](1[3-9]|2[0-9]|3[01])[/.-][0-9]{4}'))::BIGINT AS month_first
      FROM staging`)).getRowObjectsJS();
    if (Number(r.month_first) > Number(r.day_first)) {
      await conn.run(`UPDATE staging SET ${col} = strftime(try_strptime(${c}, ['%m/%d/%Y', '%m-%d-%Y', '%m.%d.%Y']), '%Y-%m-%d')
        WHERE regexp_matches(${c}, '^[0-9]{1,2}[/.-][0-9]{1,2}[/.-][0-9]{4}')`);
      log(`  ${col.padEnd(12)} dates read as month/day/year (US order)`);
    }
  }
}

/** Creates TEMP TABLE staging from the CSV. Returns { rows, map }. */
export async function loadCsvIntoStaging(conn, csvPath, log = () => {}) {
  const source = (more) => `read_csv(${sqlString(csvPath)}, header = true, all_varchar = true, ignore_errors = true, null_padding = true${more})`;
  const headers = (await withCsvRetry(async (more) => conn.runAndReadAll(`DESCRIBE SELECT * FROM ${source(more)}`)))
    .getRowObjectsJS().map((r) => r.column_name);
  const map = mapColumns(headers);

  log('Columns found:');
  for (const key of Object.keys(CANDIDATES)) if (map[key]) log(`  ${key.padEnd(12)} <- "${map[key]}"`);
  const missing = ['title', 'company', 'city', 'email'].filter((k) => !map[k]);
  if (!map.name && !map.first && !map.last) missing.unshift('name');
  if (missing.length) log(`  (not found: ${missing.join(', ')}; these will be empty)`);
  if (!map.seniority) log('  seniority    <- guessed from title');
  if (!map.department) log('  department   <- guessed from title');
  if (!map.name && !map.first && !map.last && !map.email) {
    const e = new Error('The file has no Name or Email column. Add one and upload again.');
    e.status = 400;
    throw e;
  }

  const col = (k) => (map[k] ? ident(map[k]) : 'NULL::VARCHAR');
  const first = `nullif(trim(${col('first')}), '')`;
  const last = `nullif(trim(${col('last')}), '')`;
  const both = `nullif(concat_ws(' ', ${first}, ${last}), '')`;
  const nameExpr = map.name ? `coalesce(nullif(trim(${col('name')}), ''), ${both})` : both;
  const t = Date.now();
  await withCsvRetry(async (more) => {
    if (more) log('  The file has line breaks inside cells, so it is read in one pass (slower).');
    await conn.run(`CREATE OR REPLACE TEMP TABLE staging AS
      SELECT NULL::BIGINT AS id, ${nameExpr} AS name,
        ${FIELDS.map((k) => `${col(k)} AS ${k}`).join(', ')}
      FROM ${source(more)}`);
  });
  await fixDateOrder(conn, log);
  const rows = Number((await conn.runAndReadAll('SELECT count(*)::BIGINT n FROM staging')).getRowObjectsJS()[0].n);
  log(`Read ${rows.toLocaleString('en-IN')} rows from the CSV (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  if (!rows) {
    const e = new Error('The file has no rows of data.');
    e.status = 400;
    throw e;
  }
  return { rows, map };
}

// ---------- Allowed values (admin upload) ----------

// Columns every uploaded file must have, and the only values allowed in them (lists in options.js).
// A row with any of these empty or not in its list is not imported.
export const REQUIRED_COLUMNS = [
  { key: 'employees', label: 'Company headcount', values: SIZE_KEYS },
  { key: 'department', label: 'Function', values: FUNCTIONS },
  { key: 'seniority', label: 'Seniority level', values: SENIORITY_LEVELS },
  { key: 'country', label: 'Country', values: COUNTRIES },
  { key: 'industry', label: 'Industry', values: INDUSTRIES },
];

// Compared without case, extra spaces or curly quotes. Headcount also without commas
// and with any dash: "1,001-5,000", "1001 - 5000" and "1,001–5,000" are all "1001-5000".
const textKey = (col) => `lower(trim(regexp_replace(replace(CAST(${col} AS VARCHAR), '’', ''''), '\\s+', ' ', 'g')))`;
const sizeKey = (col) => `regexp_replace(regexp_replace(lower(CAST(${col} AS VARCHAR)), '[\\s,]', '', 'g'), '[–—]', '-', 'g')`;
const keyOf = (k, col) => (k === 'employees' ? sizeKey(col) : textKey(col));

/**
 * Checks the temp table `staging` (from loadCsvIntoStaging) against REQUIRED_COLUMNS.
 * A missing column stops the upload (400). Rows with a wrong or empty value move from
 * staging to the temp table `skipped` (reason 'wrong', detail = the wrong columns);
 * the rest get the exact spelling from the list ("india" -> "India").
 * Adds the column file_row (the row number in the file; the header is row 1).
 * Returns { count, byField: { label: n } }.
 */
export async function rejectWrongValues(conn, map, log = () => {}) {
  const missing = REQUIRED_COLUMNS.filter((c) => !map[c.key]).map((c) => c.label);
  if (missing.length) {
    const e = new Error(`The file has no ${missing.join(', ')} column. Add it and upload again.`);
    e.status = 400;
    throw e;
  }
  const read = async (sql) => (await conn.runAndReadAll(sql)).getRowObjectsJS()
    .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));

  await conn.run('ALTER TABLE staging ADD COLUMN file_row BIGINT');
  await conn.run('UPDATE staging SET file_row = rowid + 2');
  await conn.run('CREATE OR REPLACE TEMP TABLE allowed (field VARCHAR, k VARCHAR, value VARCHAR)');
  const values = REQUIRED_COLUMNS.flatMap((c) => c.values.map((v) => `(${sqlString(c.key)}, ${keyOf(c.key, sqlString(v))}, ${sqlString(v)})`));
  await conn.run(`INSERT INTO allowed VALUES ${values.join(', ')}`);

  const ok = (k) => `coalesce(${keyOf(k, k)} IN (SELECT k FROM allowed WHERE field = '${k}'), false)`;
  const wrong = REQUIRED_COLUMNS.map((c) => `CASE WHEN NOT ${ok(c.key)} THEN '${c.key}' END`).join(', ');
  await conn.run(`CREATE OR REPLACE TEMP TABLE skipped AS
    SELECT file_row, 'wrong' AS reason, concat_ws(',', ${wrong}) AS detail, name, email, company,
      ${REQUIRED_COLUMNS.map((c) => c.key).join(', ')}
    FROM staging WHERE NOT (${REQUIRED_COLUMNS.map((c) => ok(c.key)).join(' AND ')})`);

  const [totals] = await read(`SELECT count(*)::BIGINT AS count,
    ${REQUIRED_COLUMNS.map((c) => `count(*) FILTER (WHERE contains(',' || detail || ',', ',${c.key},'))::BIGINT AS "${c.key}"`).join(', ')}
    FROM skipped`);
  if (totals.count) await conn.run('DELETE FROM staging WHERE file_row IN (SELECT file_row FROM skipped)');
  // The exact spelling from the list, so the filters find every row
  for (const c of REQUIRED_COLUMNS.filter((x) => x.key !== 'employees')) {
    await conn.run(`UPDATE staging SET ${c.key} = a.value FROM allowed a
      WHERE a.field = '${c.key}' AND a.k = ${keyOf(c.key, `staging.${c.key}`)} AND staging.${c.key} IS DISTINCT FROM a.value`);
  }
  await conn.run('DROP TABLE allowed');

  const byField = Object.fromEntries(REQUIRED_COLUMNS.map((c) => [c.label, totals[c.key]]).filter(([, n]) => n));
  log(`Not imported: ${totals.count.toLocaleString('en-IN')} rows with a wrong or empty value`);
  return { count: totals.count, byField };
}

// Same person: the same email, or (for rows without an email) the same name + company.
// Compared without case or extra spaces.
const personKey = (col) => `nullif(lower(trim(regexp_replace(CAST(${col} AS VARCHAR), '\\s+', ' ', 'g'))), '')`;

/**
 * Takes duplicates out of `staging` (after rejectWrongValues) and adds them to the temp table `skipped`:
 *  - 'in_data': the person is already in the data (only when againstData; not for "Replace all")
 *  - 'in_file': the same person is higher up in the file; the first row is kept
 * Returns { inData, inFile }.
 */
export async function skipDuplicates(conn, { againstData = false, log = () => {} } = {}) {
  const n = async (sql) => Number((await conn.runAndReadAll(sql)).getRowObjectsJS()[0].n);
  await conn.run(`CREATE OR REPLACE TEMP TABLE upload_keys AS
    SELECT file_row, ${personKey('email')} AS em,
      CASE WHEN ${personKey('email')} IS NULL THEN ${personKey('name')} || '|' || ${personKey('company')} END AS nc
    FROM staging`);
  await conn.run('CREATE OR REPLACE TEMP TABLE upload_dups (file_row BIGINT, reason VARCHAR, detail VARCHAR)');
  if (againstData) {
    await conn.run(`INSERT INTO upload_dups
      SELECT file_row, 'in_data', 'Email' FROM upload_keys WHERE em IN (SELECT email FROM people WHERE email IS NOT NULL)`);
    await conn.run(`INSERT INTO upload_dups
      SELECT file_row, 'in_data', 'Name + company' FROM upload_keys
      WHERE nc IS NOT NULL AND nc IN (
        SELECT ${personKey('name')} || '|' || ${personKey('company')} FROM people WHERE email IS NULL AND name IS NOT NULL AND company IS NOT NULL)`);
  }
  await conn.run(`INSERT INTO upload_dups
    SELECT file_row, 'in_file', CAST(first_row AS VARCHAR) FROM (
      SELECT file_row, min(file_row) OVER (PARTITION BY coalesce(em, nc)) AS first_row FROM upload_keys
      WHERE coalesce(em, nc) IS NOT NULL AND file_row NOT IN (SELECT file_row FROM upload_dups))
    WHERE file_row <> first_row`);
  await conn.run(`INSERT INTO skipped BY NAME
    SELECT s.file_row, d.reason, d.detail, s.name, s.email, s.company, ${REQUIRED_COLUMNS.map((c) => `s.${c.key}`).join(', ')}
    FROM staging s JOIN upload_dups d USING (file_row)`);
  await conn.run('DELETE FROM staging WHERE file_row IN (SELECT file_row FROM upload_dups)');
  const inData = await n("SELECT count(*)::BIGINT n FROM upload_dups WHERE reason = 'in_data'");
  const inFile = await n("SELECT count(*)::BIGINT n FROM upload_dups WHERE reason = 'in_file'");
  await conn.run('DROP TABLE upload_keys');
  await conn.run('DROP TABLE upload_dups');
  log(`Not imported: ${inData.toLocaleString('en-IN')} already in the data, ${inFile.toLocaleString('en-IN')} repeated in the file`);
  return { inData, inFile };
}
