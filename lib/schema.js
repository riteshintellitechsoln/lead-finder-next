// Shared database layout + build logic (DuckDB, one file: data/leads.duckdb).
// Used by the app (lib/db.js) and by the scripts (seed, import, migrate).
//
//   people     one row per person. title_id / company_id point at the lookup
//              tables below; size_bucket (1-5), revenue_bucket (1-7) and the
//              has_email / has_phone / has_direct flags are precomputed so
//              filters on 20M rows only compare small numbers.
//   titles     distinct job titles (+ lowercase copy for keyword search, + count)
//   companies  distinct companies with domain, industry, size, revenue, location,
//              technologies (install base) and people count
//   lists, list_values  uploaded include / exclude lists (company names, domains,
//              emails, titles, zip codes; any size), referenced by id from the URL
//   users, sessions, saved (per user), tasks (per user), meta
import fs from 'node:fs';
import { FUNCTIONS, SENIORITY_LEVELS, SIZE_EDGES, SIZE_KEYS } from './options.js';

export const SENIORITIES = SENIORITY_LEVELS;
export { SIZE_KEYS };

// Bump when the seniority / function rules or the headcount buckets change:
// existing data is then re-labelled once at startup (see upgradeIfNeeded).
export const LABELS_VERSION = '2';

// Columns of the temp table `staging` that every loader fills (all text except id;
// missing ones are added as NULL).
export const STAGING_COLS = ['id', 'name', 'first_name', 'last_name', 'title', 'seniority', 'department', 'company', 'domain', 'industry', 'employees',
  'revenue', 'techs', 'city', 'county', 'state', 'country', 'zip', 'email', 'email_status', 'phone', 'direct_phone', 'verified_at',
  'address1', 'address2', 'linkedin', 'company_linkedin', 'updated_at'];

// People columns added after the first release: added to an older database at startup
const ADDED_PEOPLE_COLS = [['first_name', 'VARCHAR'], ['last_name', 'VARCHAR'], ['address1', 'VARCHAR'], ['address2', 'VARCHAR'], ['linkedin', 'VARCHAR'], ['company_linkedin', 'VARCHAR'], ['updated_at', 'DATE']];

// Employees -> 1..8 (SIZE_KEYS), 0 = unknown
export function sizeBucket(n) {
  if (n == null || n < 1) return 0;
  const i = SIZE_EDGES.findIndex((e) => n <= e);
  return i < 0 ? SIZE_KEYS.length : i + 1;
}

export function sizeBucketSql(col) {
  return `CASE WHEN ${col} IS NULL OR ${col} < 1 THEN 0
    ${SIZE_EDGES.map((e, i) => `WHEN ${col} <= ${e} THEN ${i + 1}`).join(' ')} ELSE ${SIZE_KEYS.length} END`;
}

// Revenue in USD -> 1..7 (REVENUE_KEYS in filters.js), 0 = unknown
const REVENUE_EDGES = [1e6, 1e7, 5e7, 1e8, 5e8, 1e9];
export function revenueBucket(n) {
  if (n == null || n < 0) return 0;
  const i = REVENUE_EDGES.findIndex((e) => n < e);
  return i < 0 ? 7 : i + 1;
}
export function revenueBucketSql(col) {
  return `CASE WHEN ${col} IS NULL OR ${col} < 0 THEN 0
    ${REVENUE_EDGES.map((e, i) => `WHEN ${col} < ${e} THEN ${i + 1}`).join(' ')} ELSE 7 END`;
}

// Title (or a "Department" / "Function" column from the file) keyword -> function, in priority order.
// Labels are the FUNCTIONS in options.js. No match -> no function (NULL).
const DEPARTMENT_RULES = [
  ['Military and Protective Services', '\\b(military|army|navy|air force|armed forces|soldier|police|security guard|security supervisor|firefighter)\\b'],
  ['Entrepreneurship', '\\b(founder|co-?founder|owner|proprietor|entrepreneur|ceo|chief executive|managing director|chairman)\\b'],
  ['Human Resources', '\\b(hr|hrbp|human resources?|recruit\\w*|talent|chro|people (ops|operations|partner)|payroll)\\b'],
  ['Business Development', '\\b(business development|bdm|bde|partnerships?)\\b'],
  ['Sales', '\\b(sales|account (manager|executive)|relationship manager|pre-?sales)\\b'],
  ['Accounting', '\\b(accounts?|accountant|accounting|audit\\w*|tax|bookkeep\\w*)\\b'],
  ['Finance', '\\b(finance|financial|cfo|credit|treasury|controller|investment|banking|banker)\\b'],
  ['Legal', '\\b(legal|counsel|lawyer|attorney|advocate|compliance|paralegal)\\b'],
  ['Purchasing', '\\b(purchas\\w*|procurement|buyer|sourcing)\\b'],
  ['Quality Assurance', '\\b(qa|qc|quality|tester|testing)\\b'],
  ['Program and Project Management', '\\b(project manager|program manager|programme manager|project management|pmo|scrum master|project coordinator|project lead)\\b'],
  ['Media and Communication', '\\b(communications?|pr|public relations|journalist|reporter|editor|media|writer|copywriter)\\b'],
  ['Marketing', '\\b(marketing|cmo|seo|sem|content|brand|growth)\\b'],
  ['Customer Success and Support', '\\b(customer|client (success|service)|support|helpdesk|service desk|call cent(er|re))\\b'],
  ['Arts and Design', '\\b(design\\w*|ux|ui|graphic|creative|art director|artist|illustrator|photographer|animator)\\b'],
  ['Product Management', '\\b(product|cpo)\\b'],
  ['Research', '\\b(research\\w*|r&d|scientist)\\b'],
  ['Real Estate', '\\b(real estate|property|realtor|leasing)\\b'],
  ['Information Technology', '\\b(it|information technology|network|system administrator|sysadmin|cio|ciso|security|infrastructure|data|analyst|analytics|bi|business intelligence)\\b'],
  ['Engineering', '\\b(engineer\\w*|developer|devops|sde|software|cto|technology|technical|architect|programmer|machine learning|ml|ai)\\b'],
  ['Healthcare Services', '\\b(doctor|nurse|pharmac\\w*|medical|clinical|physician|surgeon|dentist|therapist|health\\w*)\\b'],
  ['Education', '\\b(teacher|professor|lecturer|faculty|tutor|educator|academic|trainer|education)\\b'],
  ['Community and Social Services', '\\b(social work\\w*|counsell?or|community|ngo|volunteer|welfare|case worker)\\b'],
  ['Consulting', '\\b(consultant|consulting|advisor|adviser)\\b'],
  ['Administrative', '\\b(admin\\w*|office manager|executive assistant|receptionist|secretary|front desk|clerk)\\b'],
  ['Operations', '\\b(operations?|coo|supply chain|logistics|store manager|branch manager|general manager|plant|production|warehouse|president|director|partner|chief|head)\\b'],
];
// Labels from older versions / other tools -> our function
const DEPARTMENT_ALIASES = {
  'customer success': 'Customer Success and Support', design: 'Arts and Design', product: 'Product Management',
  'medical & health': 'Healthcare Services', administration: 'Administrative', 'data & analytics': 'Information Technology',
  hr: 'Human Resources', it: 'Information Technology', 'project management': 'Program and Project Management',
};

export function departmentSql(deptCol, titleCol) {
  const d = `lower(replace(trim(${deptCol}), '_', ' '))`;
  const t = `lower(coalesce(${titleCol}, ''))`;
  const exact = FUNCTIONS.map((x) => `WHEN ${d} = '${x.toLowerCase()}' THEN '${x}'`).join('\n    ');
  const aliases = Object.entries(DEPARTMENT_ALIASES).map(([k, v]) => `WHEN ${d} = '${k}' THEN '${v}'`).join('\n    ');
  const rules = (col) => DEPARTMENT_RULES.map(([label, re]) => `WHEN regexp_matches(${col}, '${re}') THEN '${label}'`).join('\n    ');
  return `CASE
    ${exact}
    ${aliases}
    ${rules(d)}
    ${rules(t)}
    END`;
}

const text = (col) => `CAST(${col} AS VARCHAR)`;

/**
 * Every word of `value` is somewhere in `col` (lowercase), in any order:
 * "manager hr" matches "HR Manager", "prajapati ritesh" matches "Ritesh Prajapati".
 */
export const allWordsSql = (value, col) =>
  `list_bool_and(list_transform(string_split_regex(lower(trim(${value})), '[\\s,;/|()]+'), lambda w: w = '' OR contains(${col}, w)))`;

// "https://www.Acme.com/about" -> "acme.com"
export const domainSql = (col) =>
  `nullif(regexp_extract(regexp_replace(lower(trim(${text(col)})), '^([a-z]+://)?(www\\.)?', ''), '^[^/?#\\s]+', 0), '')`;

// Company domain from a work email when the file has no domain column
const FREE_MAIL = ['gmail.com', 'yahoo.com', 'yahoo.co.in', 'hotmail.com', 'outlook.com', 'live.com', 'rediffmail.com',
  'icloud.com', 'aol.com', 'protonmail.com', 'ymail.com', 'msn.com', 'zoho.com'];
const emailDomainSql = (email) => `CASE WHEN ${email} LIKE '%_@_%._%' AND split_part(${email}, '@', 2) NOT IN (${FREE_MAIL.map((d) => `'${d}'`).join(', ')})
    THEN split_part(${email}, '@', 2) END`;

// "$12.5M", "12,500,000", "1.2 billion", "10M-50M" (lower bound), "50 Cr" (INR, about USD) -> USD
export function revenueSql(col) {
  const v = `lower(${text(col)})`;
  const re = '([0-9][0-9,]*(\\.[0-9]+)?)\\s*([a-z]*)';
  // The first unit written after a number: "$50 - 100M" means $50M to $100M, so 50 gets the M
  return `TRY_CAST(TRY_CAST(replace(regexp_extract(${v}, '${re}', 1), ',', '') AS DOUBLE) *
    CASE regexp_extract(${v}, '[0-9]\\s*([a-z]+)', 1)
      WHEN 'k' THEN 1e3 WHEN 'thousand' THEN 1e3
      WHEN 'm' THEN 1e6 WHEN 'mn' THEN 1e6 WHEN 'mm' THEN 1e6 WHEN 'million' THEN 1e6
      WHEN 'b' THEN 1e9 WHEN 'bn' THEN 1e9 WHEN 'billion' THEN 1e9
      WHEN 't' THEN 1e12 WHEN 'trillion' THEN 1e12
      WHEN 'cr' THEN 1e7 / 83 WHEN 'crore' THEN 1e7 / 83 WHEN 'crores' THEN 1e7 / 83
      WHEN 'lakh' THEN 1e5 / 83 WHEN 'lakhs' THEN 1e5 / 83 WHEN 'lac' THEN 1e5 / 83
      ELSE 1 END AS BIGINT)`;
}

// "Salesforce; HubSpot | AWS" -> "AWS, HubSpot, Salesforce"
const techsSql = (col) => `nullif(array_to_string(list_sort(list_distinct(list_filter(
    regexp_split_to_array(trim(${text(col)}), '\\s*[,;|]\\s*'), lambda x: x <> ''))), ', '), '')`;

// "411 001" / "411001.0" -> "411001"
export const zipSql = (col) => `nullif(upper(regexp_replace(regexp_replace(trim(${text(col)}), '\\s+', '', 'g'), '\\.0$', '')), '')`;

// "2025-03-01", "2025-03-01 10:00", "01/03/2025" (day first), "Mar 1, 2025" -> DATE
const dateSql = (col) => `coalesce(TRY_CAST(left(trim(${text(col)}), 10) AS DATE),
    try_strptime(trim(${text(col)}), ['%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y', '%d.%m.%Y', '%d %b %Y', '%b %d, %Y', '%d %B %Y', '%B %d, %Y'])::DATE)`;

// Email status exactly as the file has it (trimmed). Nothing is added: a blank status stays blank.
function emailStatusSql(col, email) {
  return `CASE WHEN coalesce(${email} LIKE '%_@_%._%', false) THEN nullif(trim(${text(col)}), '') END`;
}

const phoneOk = (col) => `coalesce(length(regexp_replace(${col}, '[^0-9]', '', 'g')) >= 7, false)`;

// Title keyword -> seniority level (SENIORITY_LEVELS in options.js), in priority order.
// Shared by SQL (imports) and JS (admin edits). No match -> Staff.
const TITLE_RULES = [
  ['Staff', '\\b(intern|internship|trainee)\\b'],
  ['Owner / Partner', '\\b(owner|proprietor|co-?founder|founder)\\b'],
  ['CXO', '\\b(chief|ceo|cto|cfo|coo|cmo|cio|cxo|chro|ciso|cpo|managing director)\\b'],
  ['Owner / Partner', '\\bpartner\\b'],
  ['Vice President', '\\b(vp|svp|evp|avp|vice president)\\b'],
  ['Director', '\\b(director|head)\\b'],
  ['Manager', '\\b(manager|mgr)\\b'],
];
// Values found in exports (e.g. Apollo "c_suite") and older labels -> our levels
const SENIORITY_ALIASES = {
  'owner / partner': 'Owner / Partner', owner: 'Owner / Partner', founder: 'Owner / Partner', 'co-founder': 'Owner / Partner',
  cofounder: 'Owner / Partner', partner: 'Owner / Partner',
  cxo: 'CXO', c_suite: 'CXO', 'c-suite': 'CXO', 'c suite': 'CXO', 'c-level': 'CXO', executive: 'CXO',
  vp: 'Vice President', 'vice president': 'Vice President', head: 'Director', director: 'Director', manager: 'Manager',
  staff: 'Staff', senior: 'Staff', entry: 'Staff', junior: 'Staff', associate: 'Staff', intern: 'Staff', trainee: 'Staff',
};

export function guessSeniority(seniority, title) {
  const s = SENIORITY_ALIASES[String(seniority || '').trim().toLowerCase()];
  if (s) return s;
  const t = String(title || '').toLowerCase();
  if (!t) return null;
  for (const [label, re] of TITLE_RULES) if (new RegExp(re).test(t)) return label;
  return 'Staff';
}

export function senioritySql(senCol, titleCol) {
  const s = `lower(trim(${senCol}))`;
  const t = `lower(coalesce(${titleCol}, ''))`;
  const aliases = Object.entries(SENIORITY_ALIASES).map(([k, v]) => `WHEN ${s} = '${k}' THEN '${v}'`).join('\n    ');
  const rules = TITLE_RULES.map(([label, re]) => `WHEN regexp_matches(${t}, '${re}') THEN '${label}'`).join('\n    ');
  return `CASE
    ${aliases}
    WHEN ${t} = '' THEN NULL
    ${rules}
    ELSE 'Staff' END`;
}

const cleanSql = (col) => `nullif(trim(CAST(${col} AS VARCHAR)), '')`;
// "Rahul Kumar Sharma" -> first "Rahul", last "Kumar Sharma". A name that is really an email gives NULL.
const nameWords = (n) => `CASE WHEN ${n} NOT LIKE '%@%' THEN regexp_replace(trim(${n}), '\\s+', ' ', 'g') END`;
const firstNameSql = (n) => `nullif(split_part(${nameWords(n)}, ' ', 1), '')`;
const lastNameSql = (n) => `nullif(trim(substr(${nameWords(n)}, length(split_part(${nameWords(n)}, ' ', 1)) + 1)), '')`;
const sqlString = (s) => `'${String(s).replace(/'/g, "''")}'`;
const UTC_NOW = "timezone('UTC', current_timestamp)";

// Admin uploads: one row per file (imports), and every row of it that was not imported
// (import_skipped). reason: 'wrong' (a value not in the allowed list; detail = the columns),
// 'in_data' (already in the data; detail = 'Email' or 'Name + company'),
// 'in_file' (repeated in the same file; detail = the row it repeats).
export const importTablesSql = (start = 1) => [
  `CREATE SEQUENCE IF NOT EXISTS imports_seq START ${start || 1}`,
  `CREATE TABLE IF NOT EXISTS imports (
    id BIGINT PRIMARY KEY DEFAULT nextval('imports_seq'),
    user_id BIGINT, file_name VARCHAR, replaced BOOLEAN NOT NULL DEFAULT false,
    file_rows BIGINT NOT NULL DEFAULT 0, imported BIGINT NOT NULL DEFAULT 0,
    wrong BIGINT NOT NULL DEFAULT 0, in_data BIGINT NOT NULL DEFAULT 0, in_file BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT ${UTC_NOW})`,
  `CREATE TABLE IF NOT EXISTS import_skipped (
    import_id BIGINT NOT NULL, file_row BIGINT, reason VARCHAR NOT NULL, detail VARCHAR,
    name VARCHAR, email VARCHAR, company VARCHAR,
    employees VARCHAR, department VARCHAR, seniority VARCHAR, country VARCHAR, industry VARCHAR)`,
];

// Creates the small app tables if they do not exist yet.
export async function ensureAppTables(conn, starts = {}) {
  await conn.run(`CREATE SEQUENCE IF NOT EXISTS users_seq START ${starts.users || 1}`);
  await conn.run(`CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY DEFAULT nextval('users_seq'),
    email VARCHAR NOT NULL UNIQUE,
    name VARCHAR,
    password_hash VARCHAR NOT NULL,
    role VARCHAR NOT NULL DEFAULT 'user',
    blocked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT ${UTC_NOW})`);
  await conn.run(`CREATE TABLE IF NOT EXISTS sessions (token VARCHAR PRIMARY KEY, user_id BIGINT NOT NULL, expires_at VARCHAR NOT NULL)`);
  // When the session was last used (ISO time): no activity for SESSION_IDLE_MINUTES logs out (lib/auth.js)
  await conn.run('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen VARCHAR');
  await conn.run(`CREATE TABLE IF NOT EXISTS saved (
    user_id BIGINT NOT NULL, person_id BIGINT NOT NULL, created_at TIMESTAMP DEFAULT ${UTC_NOW},
    PRIMARY KEY (user_id, person_id))`);
  await conn.run(`CREATE SEQUENCE IF NOT EXISTS tasks_seq START ${starts.tasks || 1}`);
  await conn.run(`CREATE TABLE IF NOT EXISTS tasks (
    id BIGINT PRIMARY KEY DEFAULT nextval('tasks_seq'),
    user_id BIGINT NOT NULL,
    title VARCHAR NOT NULL,
    who VARCHAR,
    due_date VARCHAR,
    done BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT ${UTC_NOW})`);
  // "Save all" of a search makes one named list (100k leads = one list), opened from the Saved page.
  await conn.run(`CREATE SEQUENCE IF NOT EXISTS saved_lists_seq START ${starts.savedLists || 1}`);
  await conn.run(`CREATE TABLE IF NOT EXISTS saved_lists (
    id BIGINT PRIMARY KEY DEFAULT nextval('saved_lists_seq'),
    user_id BIGINT NOT NULL,
    name VARCHAR NOT NULL,
    summary VARCHAR,
    query VARCHAR,
    created_at TIMESTAMP DEFAULT ${UTC_NOW})`);
  await conn.run(`CREATE TABLE IF NOT EXISTS saved_list_people (list_id BIGINT NOT NULL, person_id BIGINT NOT NULL)`);
  // kind 'search': only the filters are kept (query), with the number of results when saved.
  // kind 'list': "Save all", which also keeps the people as they were (saved_list_people).
  await conn.run(`ALTER TABLE saved_lists ADD COLUMN IF NOT EXISTS kind VARCHAR DEFAULT 'list'`);
  await conn.run('ALTER TABLE saved_lists ADD COLUMN IF NOT EXISTS result_count BIGINT');
  await conn.run(`CREATE TABLE IF NOT EXISTS meta (key VARCHAR PRIMARY KEY, value VARCHAR)`);
  for (const sql of importTablesSql(starts.imports)) await conn.run(sql);
  // Uploaded include / exclude lists. Ids are random, so a search link with a list keeps working when shared.
  await conn.run(`CREATE TABLE IF NOT EXISTS lists (
    id VARCHAR PRIMARY KEY, kind VARCHAR NOT NULL, name VARCHAR, size INTEGER NOT NULL DEFAULT 0, matched INTEGER,
    user_id BIGINT, created_at TIMESTAMP DEFAULT ${UTC_NOW})`);
  await conn.run('ALTER TABLE lists ADD COLUMN IF NOT EXISTS matched INTEGER');
  await conn.run(`CREATE TABLE IF NOT EXISTS list_values (list_id VARCHAR NOT NULL, value VARCHAR NOT NULL)`);
  // Download credits: 1 credit = 1 person downloaded. Users ask for credits, an admin grants them.
  await conn.run('ALTER TABLE users ADD COLUMN IF NOT EXISTS download_credits BIGINT DEFAULT 0');
  await conn.run(`CREATE SEQUENCE IF NOT EXISTS credit_requests_seq START ${starts.creditRequests || 1}`);
  await conn.run(`CREATE TABLE IF NOT EXISTS credit_requests (
    id BIGINT PRIMARY KEY DEFAULT nextval('credit_requests_seq'),
    user_id BIGINT NOT NULL,
    amount BIGINT NOT NULL,
    note VARCHAR,
    status VARCHAR NOT NULL DEFAULT 'pending',
    granted BIGINT,
    admin_note VARCHAR,
    created_at TIMESTAMP DEFAULT ${UTC_NOW},
    decided_at TIMESTAMP)`);
  await conn.run(`CREATE SEQUENCE IF NOT EXISTS downloads_seq START ${starts.downloads || 1}`);
  await conn.run(`CREATE TABLE IF NOT EXISTS downloads (
    id BIGINT PRIMARY KEY DEFAULT nextval('downloads_seq'),
    user_id BIGINT NOT NULL,
    row_count BIGINT NOT NULL,
    kind VARCHAR,
    created_at TIMESTAMP DEFAULT ${UTC_NOW})`);
  // What each download contained, so the admin can see it: its filters and the people in it.
  await conn.run('ALTER TABLE downloads ADD COLUMN IF NOT EXISTS query VARCHAR');
  await conn.run('CREATE TABLE IF NOT EXISTS download_people (download_id BIGINT NOT NULL, person_id BIGINT NOT NULL)');
}

export async function tableExists(conn, name, database = null) {
  const r = await conn.runAndReadAll(
    `SELECT count(*)::INTEGER n FROM duckdb_tables() WHERE table_name = ? AND NOT temporary ${database ? 'AND database_name = ?' : ''}`,
    database ? [name, database] : [name]);
  return r.getRowObjectsJS()[0].n > 0;
}

async function columnsOf(conn, table) {
  return new Set((await conn.runAndReadAll(`DESCRIBE ${table}`)).getRowObjectsJS().map((r) => r.column_name));
}

// One staging row -> one clean row (also used for single admin edits, see cleanRowSql).
function cleanSelect(maxId) {
  const email = `lower(${cleanSql('email')})`;
  // First / last name from the file when it has them, else split from Name
  const hasParts = `(${cleanSql('first_name')} IS NOT NULL OR ${cleanSql('last_name')} IS NOT NULL)`;
  return `coalesce(id, ${maxId} + row_number() OVER ())::BIGINT AS id,
      ${cleanSql('name')} AS name,
      CASE WHEN ${hasParts} THEN ${cleanSql('first_name')} ELSE ${firstNameSql(cleanSql('name'))} END AS first_name,
      CASE WHEN ${hasParts} THEN ${cleanSql('last_name')} ELSE ${lastNameSql(cleanSql('name'))} END AS last_name,
      ${cleanSql('title')} AS title,
      ${senioritySql('seniority', cleanSql('title'))} AS seniority,
      ${departmentSql(cleanSql('department'), cleanSql('title'))} AS department,
      ${cleanSql('company')} AS company,
      coalesce(${domainSql('domain')}, ${emailDomainSql(email)}) AS domain,
      ${cleanSql('industry')} AS industry,
      -- "1,200" -> 1200, "51-200" -> 51 (lower bound keeps the right size bucket), "10,001+" -> 10001
      TRY_CAST(replace(regexp_extract(CAST(employees AS VARCHAR), '[0-9][0-9,]*', 0), ',', '') AS INTEGER) AS employees,
      ${revenueSql('revenue')} AS revenue,
      ${techsSql('techs')} AS techs,
      ${cleanSql('city')} AS city,
      ${cleanSql('county')} AS county,
      ${cleanSql('state')} AS state,
      ${cleanSql('country')} AS country,
      ${zipSql('zip')} AS zip,
      ${email} AS email,
      ${emailStatusSql('email_status', email)} AS email_status,
      ${cleanSql('phone')} AS phone,
      ${cleanSql('direct_phone')} AS direct_phone,
      ${dateSql('verified_at')} AS verified_at,
      ${cleanSql('address1')} AS address1,
      ${cleanSql('address2')} AS address2,
      ${cleanSql('linkedin')} AS linkedin,
      ${cleanSql('company_linkedin')} AS company_linkedin,
      ${dateSql('updated_at')} AS updated_at`;
}

// Clean row (alias s) + lookup ids -> a people row
function peopleSelect(s, titleId, companyId) {
  return `${s}.id, coalesce(${s}.name, ${s}.email) AS name, ${s}.first_name, ${s}.last_name, ${s}.title, ${titleId} AS title_id, ${s}.seniority, ${s}.department,
      ${s}.company, ${companyId} AS company_id, ${s}.domain, ${s}.industry, ${s}.employees,
      (${sizeBucketSql(`${s}.employees`)})::UTINYINT AS size_bucket,
      ${s}.revenue, (${revenueBucketSql(`${s}.revenue`)})::UTINYINT AS revenue_bucket, ${s}.techs,
      ${s}.city, ${s}.county, ${s}.state, ${s}.country, ${s}.zip,
      ${s}.email, ${s}.email_status, coalesce(${s}.email LIKE '%_@_%._%', false) AS has_email,
      ${s}.phone, ${phoneOk(`${s}.phone`)} AS has_phone,
      ${s}.direct_phone, ${phoneOk(`${s}.direct_phone`)} AS has_direct,
      ${s}.verified_at, ${s}.address1, ${s}.address2, ${s}.linkedin, ${s}.company_linkedin, ${s}.updated_at`;
}

const stagingParams = () => `SELECT ${STAGING_COLS.map((c) => `?::${c === 'id' ? 'BIGINT' : 'VARCHAR'} AS ${c}`).join(', ')}`;

/** One raw row (params in STAGING_COLS order) -> the clean values the importer would store */
export const cleanRowSql = () => `WITH staging AS (${stagingParams()}) SELECT ${cleanSelect(0)} FROM staging`;

/** INSERT of one raw row: params in STAGING_COLS order, then title_id, company_id */
export const insertPersonSql = () => `INSERT INTO people BY NAME (
  WITH staging AS (${stagingParams()}), s AS (SELECT ${cleanSelect(0)} FROM staging)
  SELECT ${peopleSelect('s', '?::INTEGER', '?::INTEGER')} FROM s)`;

// Builds people/titles/companies (+ `suffix`) from a temp table `staging` with
// the STAGING_COLS columns (id may be NULL; missing columns are added).
// `oldPeople` (a table name) is kept and the new rows get ids after it.
async function buildPeople(conn, { oldPeople = null, suffix = '', log = () => {} }) {
  const step = async (label, sql) => {
    const t = Date.now();
    await conn.run(sql);
    log(`  ${label} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  };
  for (const c of STAGING_COLS) await conn.run(`ALTER TABLE staging ADD COLUMN IF NOT EXISTS ${c} ${c === 'id' ? 'BIGINT' : 'VARCHAR'}`);
  const maxId = oldPeople
    ? Number((await conn.runAndReadAll(`SELECT coalesce(max(id), 0)::BIGINT m FROM ${oldPeople}`)).getRowObjectsJS()[0].m)
    : 0;
  if (oldPeople) {
    // Old rows go through the same cleaning (it gives the same result for clean
    // values), so data from an older version gets the new columns too.
    const have = await columnsOf(conn, oldPeople);
    await step('existing people', `INSERT INTO staging BY NAME SELECT ${STAGING_COLS.filter((c) => have.has(c)).join(', ')} FROM ${oldPeople}`);
  }

  await step('cleaning rows', `CREATE OR REPLACE TEMP TABLE src AS
    SELECT ${cleanSelect(maxId)}
    FROM staging
    WHERE ${cleanSql('name')} IS NOT NULL OR ${cleanSql('email')} IS NOT NULL`);
  await conn.run('DROP TABLE staging');

  await step('titles', `CREATE OR REPLACE TABLE titles${suffix} AS
    SELECT (row_number() OVER (ORDER BY title))::INTEGER AS id, title, lower(title) AS title_lc, count(*)::INTEGER AS people
    FROM src WHERE title IS NOT NULL GROUP BY title`);
  await step('companies', `CREATE OR REPLACE TABLE companies${suffix} AS
    SELECT * EXCLUDE (hq), hq.city AS city, hq.state AS state, hq.country AS country,
      list_transform(techs, lambda x: lower(x)) AS techs_lc FROM (
      SELECT (row_number() OVER (ORDER BY company))::INTEGER AS id, company AS name, lower(company) AS name_lc,
        mode(domain) AS domain, mode(industry) AS industry,
        max(employees)::INTEGER AS employees, (${sizeBucketSql('max(employees)')})::UTINYINT AS size_bucket,
        max(revenue)::BIGINT AS revenue, (${revenueBucketSql('max(revenue)')})::UTINYINT AS revenue_bucket,
        -- the most common location of its people, taken as one (city, state and country together)
        mode(struct_pack(city := city, state := state, country := country)) AS hq,
        string_split(mode(techs), ', ') AS techs,
        count(*)::INTEGER AS people
      FROM src WHERE company IS NOT NULL GROUP BY company)`);
  await step('people', `CREATE OR REPLACE TABLE people${suffix} AS
    SELECT ${peopleSelect('s', 't.id', 'c.id')}
    FROM src s
    LEFT JOIN titles${suffix} t ON t.title = s.title
    LEFT JOIN companies${suffix} c ON c.name = s.company
    ORDER BY s.id`);
  // No domain in the file and no work email: the company's domain (from its other people)
  await step('domains from company', `UPDATE people${suffix} SET domain = c.domain FROM companies${suffix} c
    WHERE people${suffix}.domain IS NULL AND people${suffix}.company_id = c.id AND c.domain IS NOT NULL`);
  await conn.run('DROP TABLE src');
  const r = await conn.runAndReadAll(`SELECT (SELECT count(*) FROM people${suffix})::BIGINT people,
    (SELECT count(*) FROM companies${suffix})::BIGINT companies, (SELECT count(*) FROM titles${suffix})::BIGINT titles`);
  const out = r.getRowObjectsJS()[0];
  return { people: Number(out.people), companies: Number(out.companies), titles: Number(out.titles) };
}

// For the command-line scripts (website stopped): builds a complete new
// database next to the old one and swaps the files. If anything fails the old
// file is untouched. Users, sessions and tasks are always carried over; saved
// leads too when the old people are kept (append).
//
// fillStaging(conn) must create the temp table `staging` (see buildPeople).
// While it runs, the old database is attached as `old` (if it exists).
// Optional for other sources (scripts/migrate-sqlite.js): appStarts(conn) returns
// the highest { users, tasks } ids it will copy, and copyApp(conn) copies them.
export async function rebuildDatabase({ DuckDBInstance, dbPath, append = false, fillStaging, appStarts, copyApp, log = console.log, options = {} }) {
  const building = `${dbPath}.building`;
  for (const f of [building, `${building}.wal`]) fs.rmSync(f, { force: true });
  const hasOld = fs.existsSync(dbPath);
  if (hasOld) {
    // Fails with a "file is in use" error (see explainDbError) if the website is running.
    const probe = await DuckDBInstance.create(dbPath);
    probe.closeSync();
  }

  const instance = await DuckDBInstance.create(building, { memory_limit: '2GB', preserve_insertion_order: 'false', ...options });
  const conn = await instance.connect();
  let result;
  try {
    if (hasOld) await conn.run(`ATTACH ${sqlString(dbPath)} AS old (READ_ONLY)`);
    const oldHas = async (t) => hasOld && tableExists(conn, t, 'old');
    const keepOld = append && (await oldHas('people'));

    await fillStaging(conn);
    result = await buildPeople(conn, { oldPeople: keepOld ? 'old.people' : null, log });

    const max = async (t) => ((await oldHas(t))
      ? Number((await conn.runAndReadAll(`SELECT coalesce(max(id), 0)::BIGINT m FROM old.${t}`)).getRowObjectsJS()[0].m)
      : 0);
    const extra = appStarts ? await appStarts(conn) : {};
    await ensureAppTables(conn, {
      users: Math.max(await max('users'), extra.users || 0) + 1,
      tasks: Math.max(await max('tasks'), extra.tasks || 0) + 1,
      savedLists: (await max('saved_lists')) + 1,
      creditRequests: (await max('credit_requests')) + 1,
      downloads: (await max('downloads')) + 1,
      imports: (await max('imports')) + 1,
    });
    for (const t of ['users', 'sessions', 'tasks', 'lists', 'list_values', 'credit_requests', 'downloads', 'imports', 'import_skipped']) {
      if (await oldHas(t)) await conn.run(`INSERT INTO ${t} BY NAME SELECT * FROM old.${t}`);
    }
    if (keepOld && (await oldHas('saved'))) {
      await conn.run('INSERT INTO saved SELECT * FROM old.saved WHERE person_id IN (SELECT id FROM people)');
    }
    if (keepOld && (await oldHas('download_people'))) {
      await conn.run('INSERT INTO download_people SELECT * FROM old.download_people WHERE person_id IN (SELECT id FROM people)');
    }
    if (keepOld && (await oldHas('saved_lists')) && (await oldHas('saved_list_people'))) {
      await conn.run('INSERT INTO saved_lists BY NAME SELECT * FROM old.saved_lists');
      await conn.run(`INSERT INTO saved_list_people SELECT list_id, person_id FROM old.saved_list_people
        WHERE person_id IN (SELECT id FROM people)`);
    } else if ((await oldHas('saved_lists')) && (await columnsOf(conn, 'old.saved_lists')).has('kind')) {
      // Saved searches are only filters, so they stay when the people are replaced
      await conn.run("INSERT INTO saved_lists BY NAME SELECT * FROM old.saved_lists WHERE kind = 'search'");
    }
    if (copyApp) await copyApp(conn);
    result.savedCleared = !keepOld && (await oldHas('saved'))
      && Number((await conn.runAndReadAll('SELECT count(*)::BIGINT n FROM old.saved')).getRowObjectsJS()[0].n) > 0;
    await conn.run(`INSERT OR REPLACE INTO meta VALUES ('built_at', CAST(current_timestamp AS VARCHAR))`);
    await conn.run(`INSERT OR REPLACE INTO meta VALUES ('labels_version', '${LABELS_VERSION}')`);
    if (hasOld) await conn.run('DETACH old');
    await conn.run('CHECKPOINT');
  } catch (e) {
    try { conn.closeSync(); instance.closeSync(); } catch { /* ignore */ }
    for (const f of [building, `${building}.wal`]) fs.rmSync(f, { force: true });
    throw e;
  }
  conn.closeSync();
  instance.closeSync();

  // Swap files: old -> .old, new -> live, then delete the old one.
  if (hasOld) fs.renameSync(dbPath, `${dbPath}.old`);
  fs.rmSync(`${dbPath}.wal`, { force: true });
  fs.renameSync(building, dbPath);
  fs.rmSync(`${dbPath}.old`, { force: true });
  return result;
}

// For the admin "Upload CSV" page (website running): builds new tables next to
// the live ones and swaps them in one transaction. Searches keep working on the
// old data until the swap. Saved leads are cleared on replace.
export async function rebuildInPlace(conn, { append = false, keepSaved = false, log = () => {} }) {
  const hasPeople = await tableExists(conn, 'people');
  const result = await buildPeople(conn, { oldPeople: append && hasPeople ? 'people' : null, suffix: '_new', log });
  await conn.run('BEGIN TRANSACTION');
  try {
    for (const t of ['people', 'titles', 'companies']) {
      await conn.run(`DROP TABLE IF EXISTS ${t}`);
      await conn.run(`ALTER TABLE ${t}_new RENAME TO ${t}`);
    }
    if (append || keepSaved) {
      await conn.run('DELETE FROM saved WHERE person_id NOT IN (SELECT id FROM people)');
      await conn.run('DELETE FROM saved_list_people WHERE person_id NOT IN (SELECT id FROM people)');
      await conn.run('DELETE FROM download_people WHERE person_id NOT IN (SELECT id FROM people)');
    } else {
      await conn.run('DELETE FROM download_people'); // new data, new ids; the count and filters of each download stay
      await conn.run('DELETE FROM saved');
      await conn.run('DELETE FROM saved_list_people');
      await conn.run("DELETE FROM saved_lists WHERE coalesce(kind, 'list') <> 'search'"); // saved searches are only filters
    }
    await conn.run(`INSERT OR REPLACE INTO meta VALUES ('built_at', CAST(current_timestamp AS VARCHAR))`);
    await conn.run(`INSERT OR REPLACE INTO meta VALUES ('labels_version', '${LABELS_VERSION}')`);
    await conn.run('COMMIT');
  } catch (e) {
    await conn.run('ROLLBACK').catch(() => {});
    throw e;
  }
  await conn.run('CHECKPOINT');
  return result;
}

// Data built by an older version (no department, revenue, location, phone,
// technologies...) is rebuilt once with the new columns. Ids, saved leads and
// everything else stay. Returns true when it ran.
export async function upgradeIfNeeded(conn, log = console.log) {
  if (!(await tableExists(conn, 'people'))) return false;
  for (const [col, type] of ADDED_PEOPLE_COLS) await conn.run(`ALTER TABLE people ADD COLUMN IF NOT EXISTS ${col} ${type}`);
  // People stored before first / last name existed: split their Name once
  await conn.run(`UPDATE people SET first_name = ${firstNameSql('name')}, last_name = ${lastNameSql('name')}
    WHERE first_name IS NULL AND last_name IS NULL AND name IS NOT NULL AND name NOT LIKE '%@%'`);
  // People with no domain: their company's domain, when the company has one
  if (await tableExists(conn, 'companies')) {
    await conn.run(`UPDATE people SET domain = c.domain FROM companies c
      WHERE people.domain IS NULL AND people.company_id = c.id AND c.domain IS NOT NULL`);
  }
  if ((await columnsOf(conn, 'companies').catch(() => new Set())).has('techs_lc')) {
    await clearAddedEmailStatus(conn, log);
    return relabelIfNeeded(conn, log);
  }
  const t = Date.now();
  log('[db] Upgrading the people tables to the new filters (department, revenue, location, phone, ...). This runs once.');
  const have = await columnsOf(conn, 'people');
  await conn.run(`CREATE OR REPLACE TEMP TABLE staging AS SELECT ${STAGING_COLS.filter((c) => have.has(c)).join(', ')} FROM people`);
  await rebuildInPlace(conn, { keepSaved: true, log });
  log(`[db] Upgrade done in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  return true;
}

// Older versions wrote "Unverified" for every email whose file had no status. The status
// now comes only from the file, so that added label is removed once.
async function clearAddedEmailStatus(conn, log) {
  const r = await conn.runAndReadAll(`SELECT value FROM meta WHERE key = 'email_status_from_file'`);
  if (r.getRowObjectsJS()[0]?.value === '1') return;
  const n = await conn.runAndReadAll(`SELECT count(*)::BIGINT AS n FROM people WHERE email_status = 'Unverified'`);
  await conn.run(`UPDATE people SET email_status = NULL WHERE email_status = 'Unverified'`);
  await conn.run(`INSERT OR REPLACE INTO meta VALUES ('email_status_from_file', '1')`);
  log(`[db] Removed the "Unverified" email label the app had added (${n.getRowObjectsJS()[0]?.n ?? 0} people). Email status now shows only what the file says.`);
}

// Seniority levels, functions or headcount buckets changed (LABELS_VERSION):
// re-label the existing rows in place, once. Ids and saved leads stay.
async function relabelIfNeeded(conn, log) {
  const r = await conn.runAndReadAll(`SELECT value FROM meta WHERE key = 'labels_version'`);
  if (r.getRowObjectsJS()[0]?.value === LABELS_VERSION) return false;
  const t = Date.now();
  log('[db] Updating seniority, function and company headcount labels to the new dropdown values. This runs once.');
  await conn.run('BEGIN TRANSACTION');
  try {
    await conn.run(`UPDATE people SET seniority = ${senioritySql('seniority', 'title')},
      department = ${departmentSql('department', 'title')},
      size_bucket = (${sizeBucketSql('employees')})::UTINYINT`);
    await conn.run(`UPDATE companies SET size_bucket = (${sizeBucketSql('employees')})::UTINYINT`);
    await conn.run(`INSERT OR REPLACE INTO meta VALUES ('labels_version', '${LABELS_VERSION}')`);
    await conn.run('COMMIT');
  } catch (e) {
    await conn.run('ROLLBACK').catch(() => {});
    throw e;
  }
  await conn.run('CHECKPOINT');
  log(`[db] Labels updated in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  return true;
}

// Friendly messages for the errors people actually hit when running scripts.
export function explainDbError(e, dbPath) {
  const msg = String(e?.message || e);
  if (/lock|being used by another process|resource temporarily unavailable/i.test(msg)) {
    return `The database file is in use: ${dbPath}\n` +
      `Another program (probably the Lead Finder website: "npm run dev" or "npm start" / pm2) has it open.\n` +
      `Stop the website first (Ctrl+C in its window, or "pm2 stop lead-finder"), then run this command again.\n\nDetails: ${msg}`;
  }
  return msg;
}
