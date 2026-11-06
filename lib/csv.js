// Reads a CSV file with DuckDB's read_csv (millions of rows per minute, low
// memory) into the temp table `staging` used by the build step in schema.js.
// Column names are detected automatically, including Apollo exports.
// Shared by scripts/import-csv.js and the admin "Upload CSV" page.

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
  employees: ['employees', 'numberofemployees', 'noofemployees', 'employeecount', 'employeescount', 'numemployees', 'companysize', 'size', 'headcount', 'companyheadcount', 'staffcount'],
  revenue: ['revenue', 'annualrevenue', 'companyrevenue', 'estimatedrevenue', 'revenuerange', 'revenueusd', 'turnover'],
  techs: ['technologies', 'technology', 'techstack', 'installbase', 'installedbase', 'companytechnologies', 'tech', 'technographics'],
  city: ['city', 'personcity', 'contactcity', 'town', 'location', 'companycity'],
  county: ['county', 'district', 'personcounty', 'companycounty', 'companydistrict'],
  state: ['state', 'personstate', 'contactstate', 'province', 'stateprovince', 'region', 'companystate'],
  country: ['country', 'personcountry', 'contactcountry', 'nation', 'companycountry'],
  zip: ['zip', 'zipcode', 'postalcode', 'postcode', 'pincode', 'pin', 'personzip', 'personpostalcode', 'companyzip', 'companypostalcode', 'companypincode'],
  email: ['email', 'emailaddress', 'workemail', 'businessemail', 'emailid', 'mail', 'primaryemail', 'personalemail'],
  email_status: ['emailstatus', 'emailverificationstatus', 'emailverification', 'verificationstatus', 'emailconfidence', 'emailquality', 'primaryemailstatus'],
  phone: ['phone', 'companyphone', 'corporatephone', 'workphone', 'officephone', 'phonenumber', 'businessphone', 'telephone', 'tel', 'hqphone', 'firstphone', 'otherphone'],
  direct_phone: ['directphone', 'workdirectphone', 'directdial', 'directnumber', 'mobile', 'mobilephone', 'mobilenumber', 'mobileno', 'cell', 'cellphone', 'personalphone'],
  verified_at: ['verifiedon', 'verifiedat', 'verifieddate', 'lastverified', 'lastverifiedon', 'lastverifiedat', 'emailverifiedon', 'emailverifiedat', 'emaillastverifiedat', 'primaryemaillastverifiedat', 'verificationdate'],
};

export // Every staging column filled straight from one file column
const FIELDS = ['title', 'seniority', 'department', 'company', 'domain', 'industry', 'employees', 'revenue', 'techs',
  'city', 'county', 'state', 'country', 'zip', 'email', 'email_status', 'phone', 'direct_phone', 'verified_at'];

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

/** Creates TEMP TABLE staging from the CSV. Returns { rows, map }. */
export async function loadCsvIntoStaging(conn, csvPath, log = () => {}) {
  const src = `read_csv(${sqlString(csvPath)}, header = true, all_varchar = true, ignore_errors = true, null_padding = true)`;
  const headers = (await conn.runAndReadAll(`DESCRIBE SELECT * FROM ${src}`)).getRowObjectsJS().map((r) => r.column_name);
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
  await conn.run(`CREATE OR REPLACE TEMP TABLE staging AS
    SELECT NULL::BIGINT AS id, ${nameExpr} AS name,
      ${FIELDS.map((k) => `${col(k)} AS ${k}`).join(', ')}
    FROM ${src}`);
  const rows = Number((await conn.runAndReadAll('SELECT count(*)::BIGINT n FROM staging')).getRowObjectsJS()[0].n);
  log(`Read ${rows.toLocaleString('en-IN')} rows from the CSV (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  if (!rows) {
    const e = new Error('The file has no data rows');
    e.status = 400;
    throw e;
  }
  return { rows, map };
}
