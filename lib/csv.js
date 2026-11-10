// Reads a CSV file with DuckDB's read_csv (millions of rows per minute, low
// memory) into the temp table `staging` used by the build step in schema.js.
// Column names are detected automatically, including Apollo exports.
// Shared by scripts/import-csv.js and the admin "Upload CSV" page.
import fs from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

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
    const e = new Error(`Could not find a name or email column. Headers in the file: ${headers.join(', ')}`);
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
    const e = new Error('The file has no data rows');
    e.status = 400;
    throw e;
  }
  return { rows, map };
}
