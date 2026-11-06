// Generates N fake Indian people (default 1,000,000) into data/leads.duckdb.
//
//   npm run seed                      -> 1,000,000 people (replaces existing people; accounts and tasks are kept)
//   npm run seed -- 20000000          -> 20 million people
//   npm run seed -- 500000 --append   -> add 500k people to the existing data
//
// All rows are generated inside DuckDB with SQL (no JS loops), so 20M rows take
// a minute or two instead of an hour.
import '../lib/env.js';
import { DuckDBInstance } from '@duckdb/node-api';
import fs from 'node:fs';
import path from 'node:path';
import { explainDbError, rebuildDatabase } from '../lib/schema.js';

const args = process.argv.slice(2);
const append = args.includes('--append');
const nArg = args.find((a) => /^[\d_,]+$/.test(a));
const N = nArg ? Number(nArg.replace(/[_,]/g, '')) : 1_000_000;
if (!Number.isFinite(N) || N < 1) {
  console.error('Usage: npm run seed -- [count] [--append]');
  process.exit(1);
}
const dbPath = path.resolve(process.env.DB_PATH || 'data/leads.duckdb');

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan', 'Rohan', 'Rahul', 'Amit', 'Vikram', 'Suresh', 'Ramesh', 'Rajesh', 'Anil', 'Sunil', 'Manoj', 'Deepak', 'Karan', 'Nikhil', 'Siddharth', 'Varun', 'Harsh', 'Pranav', 'Yash', 'Akash', 'Gaurav', 'Abhishek', 'Ankit', 'Saurabh', 'Kunal', 'Tushar', 'Mohit', 'Naveen', 'Prakash', 'Sanjay', 'Venkat', 'Ananya', 'Diya', 'Aadhya', 'Saanvi', 'Pari', 'Anika', 'Navya', 'Myra', 'Sara', 'Isha', 'Priya', 'Pooja', 'Neha', 'Sneha', 'Kavya', 'Divya', 'Anjali', 'Shreya', 'Ritika', 'Swati', 'Meera', 'Lakshmi', 'Radhika', 'Nisha', 'Aishwarya', 'Shruti', 'Tanvi', 'Simran', 'Payal', 'Komal', 'Deepika', 'Sunita', 'Kiran', 'Rekha', 'Bhavna', 'Madhuri', 'Fatima', 'Zoya', 'Imran', 'Farhan'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel', 'Shah', 'Mehta', 'Joshi', 'Desai', 'Reddy', 'Rao', 'Naidu', 'Iyer', 'Iyengar', 'Nair', 'Menon', 'Pillai', 'Kulkarni', 'Deshpande', 'Patil', 'Jadhav', 'Pawar', 'Chavan', 'Bhosale', 'Mishra', 'Tiwari', 'Pandey', 'Dubey', 'Tripathi', 'Agarwal', 'Bansal', 'Goel', 'Jain', 'Malhotra', 'Kapoor', 'Khanna', 'Chopra', 'Bhatia', 'Sethi', 'Das', 'Banerjee', 'Chatterjee', 'Mukherjee', 'Ghosh', 'Bose', 'Sen', 'Dutta', 'Saxena', 'Srivastava', 'Chauhan', 'Rathore', 'Yadav', 'Thakur', 'Khan', 'Ansari', 'Qureshi', 'Fernandes', 'DSouza', 'Gill'];
// [city, district (county), state, first 3 digits of the PIN code, weight]. Big cities get more people.
const CITIES = [
  ['Bengaluru', 'Bengaluru Urban', 'Karnataka', '560', 3], ['Mumbai', 'Mumbai Suburban', 'Maharashtra', '400', 3],
  ['Delhi', 'New Delhi', 'Delhi', '110', 2], ['Pune', 'Pune', 'Maharashtra', '411', 2], ['Hyderabad', 'Hyderabad', 'Telangana', '500', 2],
  ['Chennai', 'Chennai', 'Tamil Nadu', '600', 2], ['Gurugram', 'Gurugram', 'Haryana', '122', 2], ['Noida', 'Gautam Buddh Nagar', 'Uttar Pradesh', '201', 2],
  ['Kolkata', 'Kolkata', 'West Bengal', '700', 1], ['Ahmedabad', 'Ahmedabad', 'Gujarat', '380', 1], ['Jaipur', 'Jaipur', 'Rajasthan', '302', 1],
  ['Lucknow', 'Lucknow', 'Uttar Pradesh', '226', 1], ['Indore', 'Indore', 'Madhya Pradesh', '452', 1], ['Chandigarh', 'Chandigarh', 'Chandigarh', '160', 1],
  ['Kochi', 'Ernakulam', 'Kerala', '682', 1], ['Coimbatore', 'Coimbatore', 'Tamil Nadu', '641', 1], ['Nagpur', 'Nagpur', 'Maharashtra', '440', 1],
  ['Surat', 'Surat', 'Gujarat', '395', 1], ['Vadodara', 'Vadodara', 'Gujarat', '390', 1], ['Bhopal', 'Bhopal', 'Madhya Pradesh', '462', 1],
  ['Visakhapatnam', 'Visakhapatnam', 'Andhra Pradesh', '530', 1], ['Thiruvananthapuram', 'Thiruvananthapuram', 'Kerala', '695', 1],
  ['Mysuru', 'Mysuru', 'Karnataka', '570', 1], ['Nashik', 'Nashik', 'Maharashtra', '422', 1], ['Rajkot', 'Rajkot', 'Gujarat', '360', 1],
  ['Ludhiana', 'Ludhiana', 'Punjab', '141', 1], ['Kanpur', 'Kanpur Nagar', 'Uttar Pradesh', '208', 1], ['Patna', 'Patna', 'Bihar', '800', 1],
  ['Bhubaneswar', 'Khordha', 'Odisha', '751', 1], ['Guwahati', 'Kamrup Metropolitan', 'Assam', '781', 1], ['Dehradun', 'Dehradun', 'Uttarakhand', '248', 1],
  ['Mangaluru', 'Dakshina Kannada', 'Karnataka', '575', 1], ['Madurai', 'Madurai', 'Tamil Nadu', '625', 1], ['Vijayawada', 'NTR', 'Andhra Pradesh', '520', 1],
  ['Raipur', 'Raipur', 'Chhattisgarh', '492', 1], ['Ranchi', 'Ranchi', 'Jharkhand', '834', 1], ['Panaji', 'North Goa', 'Goa', '403', 1],
  ['Aurangabad', 'Chhatrapati Sambhajinagar', 'Maharashtra', '431', 1], ['Jodhpur', 'Jodhpur', 'Rajasthan', '342', 1], ['Amritsar', 'Amritsar', 'Punjab', '143', 1],
  ['Thane', 'Thane', 'Maharashtra', '400', 1], ['Navi Mumbai', 'Thane', 'Maharashtra', '400', 1],
];
const TECHS = ['Salesforce', 'HubSpot', 'Zoho CRM', 'Microsoft 365', 'Google Workspace', 'AWS', 'Microsoft Azure', 'Google Cloud', 'SAP', 'Oracle',
  'Tally', 'Freshdesk', 'Zendesk', 'Slack', 'Microsoft Teams', 'Jira', 'Shopify', 'WordPress', 'Razorpay', 'Stripe', 'Workday', 'Darwinbox',
  'Keka', 'MongoDB', 'PostgreSQL', 'MySQL', 'Kubernetes', 'Docker', 'React', 'Angular', 'Node.js', 'Java', 'Python', 'Tableau', 'Power BI',
  'Google Analytics', 'Mailchimp', 'Zoom', 'Cisco', 'Adobe Experience Cloud'];
const STATUSES = [['Verified', 60], ['Guessed', 12], ['Catch-all', 10], ['Unverified', 13], ['Invalid', 5]];
const INDUSTRIES = ['Information Technology', 'Software', 'Financial Services', 'Banking', 'Insurance', 'Healthcare', 'Pharmaceuticals', 'Education', 'E-Learning', 'Retail', 'E-Commerce', 'Manufacturing', 'Automotive', 'Telecommunications', 'Real Estate', 'Construction', 'Hospitality', 'Logistics', 'Media', 'Marketing & Advertising', 'Consulting', 'Staffing & Recruiting', 'Human Resources', 'Food & Beverages', 'Textiles', 'Chemicals', 'Energy', 'Government', 'Non-Profit', 'Legal'];
const CO_A = ['Tata', 'Infini', 'Sun', 'Bharat', 'Indus', 'Ganga', 'Shakti', 'Vayu', 'Agni', 'Prithvi', 'Surya', 'Chandra', 'Nova', 'Apex', 'Zenith', 'Pinnacle', 'Vertex', 'Quantum', 'Nexus', 'Matrix', 'Orbit', 'Pixel', 'Cloud', 'Data', 'Smart', 'Bright', 'Blue', 'Green', 'Red', 'Silver', 'Golden', 'Royal', 'Prime', 'Global', 'United', 'National', 'Metro', 'Urban', 'Rural', 'Swift', 'Rapid', 'Alpha', 'Beta', 'Delta', 'Sigma', 'Omega', 'Kaveri', 'Narmada', 'Himalaya', 'Sahyadri', 'Deccan', 'Konkan', 'Malabar', 'Coromandel', 'Lotus', 'Peacock', 'Tiger', 'Elephant', 'Banyan', 'Neem', 'Tulsi', 'Mango', 'Saffron', 'Indigo', 'Ruby', 'Emerald', 'Sapphire', 'Pearl', 'Diamond', 'Crystal', 'Star', 'Galaxy', 'Cosmos', 'Horizon', 'Summit', 'Bridge', 'Gateway', 'Harbor', 'River', 'Ocean'];
const CO_B = ['Tech', 'Soft', 'Systems', 'Solutions', 'Infotech', 'Labs', 'Works', 'Digital', 'Networks', 'Analytics', 'Finance', 'Capital', 'Health', 'Pharma', 'Foods', 'Motors', 'Steel', 'Textiles', 'Logistics', 'Retail', 'Media', 'Learning', 'Energy', 'Power', 'Builders', 'Realty', 'Consulting', 'Services', 'Industries', 'Enterprises', 'Ventures', 'Innovations', 'Dynamics', 'Global', 'Group', 'Partners', 'Traders', 'Exports', 'Chemicals', 'Agro', 'Infra', 'Telecom', 'Mobility', 'Payments', 'Security', 'Insights', 'Robotics', 'Devices', 'Hotels', 'Travels', 'Fashion', 'Designs', 'Studios', 'Apparel', 'Hospitals', 'Clinics', 'Academy', 'Institute', 'Bank', 'Insurance', 'Housing', 'Estates', 'Mining', 'Plastics', 'Paper', 'Cement', 'Glass', 'Electronics', 'Electricals', 'Engineering', 'Projects', 'Constructions', 'Shipping', 'Cargo', 'Airways', 'Tours', 'Events', 'Brands', 'Marketing', 'Ads'];
const CO_C = ['Pvt Ltd', 'Ltd', 'Private Limited', 'LLP', 'Inc', 'India', 'Technologies', 'Corporation', 'Co', 'International', 'Holdings', 'Solutions Pvt Ltd', 'Software Pvt Ltd', 'Services LLP', 'India Pvt Ltd', 'Group'];
const LEVELS = ['', '', '', 'Senior ', 'Senior ', 'Junior ', 'Associate ', 'Lead ', 'Principal ', 'Assistant '];
const ROLES = ['Software Engineer', 'Software Developer', 'Data Analyst', 'Data Scientist', 'Data Engineer', 'DevOps Engineer', 'QA Engineer', 'Product Designer', 'UI/UX Designer', 'Business Analyst', 'HR Manager', 'HR Executive', 'HR Business Partner', 'Talent Acquisition Specialist', 'Recruiter', 'Accountant', 'Financial Analyst', 'Sales Manager', 'Sales Executive', 'Business Development Manager', 'Business Development Executive', 'Account Manager', 'Marketing Manager', 'Digital Marketing Executive', 'Content Writer', 'Product Manager', 'Project Manager', 'Operations Manager', 'Operations Executive', 'Customer Success Manager', 'Customer Support Executive', 'Admin Executive', 'Office Manager', 'Legal Counsel', 'Procurement Manager', 'Supply Chain Manager', 'Mechanical Engineer', 'Civil Engineer', 'Electrical Engineer', 'Teacher', 'Consultant', 'Pharmacist', 'Doctor', 'Nurse', 'Branch Manager', 'Relationship Manager', 'Credit Analyst', 'Store Manager', 'Graphic Designer', 'Network Engineer'];
const TOP_TITLES = ['Founder', 'Co-Founder', 'Founder & CEO', 'Owner', 'CEO', 'CTO', 'CFO', 'COO', 'CMO', 'CHRO', 'Managing Director', 'Partner', 'Vice President - Sales', 'VP Engineering', 'VP Marketing', 'AVP Finance', 'Head of HR', 'Head of Sales', 'Head of Engineering', 'Head of Marketing', 'Director of Operations', 'Director - Human Resources', 'Engineering Manager', 'General Manager', 'Software Engineering Intern', 'Marketing Intern', 'HR Intern', 'Management Trainee'];

const lit = (arr) => `[${arr.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ')}]`;
// pick(list, seed) -> SQL picking a deterministic pseudo-random element of a list.
const pick = (arr, seed, key = 'i') => `${lit(arr)}[(hash(${key} * 1000 + ${seed}) % ${arr.length})::INTEGER + 1]`;

async function main() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const t0 = Date.now();
  console.log(`Generating ${N.toLocaleString('en-IN')} people into ${dbPath} ${append ? '(append)' : '(replacing existing data)'}`);

  const maxCombos = CO_A.length * CO_B.length * CO_C.length;
  const nCompanies = Math.max(50, Math.min(maxCombos, Math.ceil(N / 150)));

  const fillStaging = async (conn) => {
    // Companies: deterministic unique names "<A> <B> <C>", each with one industry and size.
    await conn.run(`CREATE OR REPLACE TEMP TABLE gen_companies AS
      SELECT k,
        ${lit(CO_A)}[(k % ${CO_A.length})::INTEGER + 1] || ' ' ||
        ${lit(CO_B)}[((k // ${CO_A.length}) % ${CO_B.length})::INTEGER + 1] || ' ' ||
        ${lit(CO_C)}[((k // ${CO_A.length * CO_B.length}) % ${CO_C.length})::INTEGER + 1] AS company,
        lower(${lit(CO_A)}[(k % ${CO_A.length})::INTEGER + 1] || ${lit(CO_B)}[((k // ${CO_A.length}) % ${CO_B.length})::INTEGER + 1])
          || (k // ${CO_A.length * CO_B.length})::VARCHAR || (CASE WHEN k % 3 = 0 THEN '.com' ELSE '.in' END) AS domain,
        ${pick(INDUSTRIES, 11, 'k')} AS industry,
        CASE (hash(k * 1000 + 12) % 20)::INTEGER
          WHEN 0 THEN 5001 + (hash(k * 1000 + 13) % 200000)::INTEGER
          WHEN 1 THEN 1001 + (hash(k * 1000 + 13) % 4000)::INTEGER
          WHEN 2 THEN 1001 + (hash(k * 1000 + 13) % 4000)::INTEGER
          WHEN 3 THEN 201 + (hash(k * 1000 + 13) % 800)::INTEGER
          WHEN 4 THEN 201 + (hash(k * 1000 + 13) % 800)::INTEGER
          WHEN 5 THEN 201 + (hash(k * 1000 + 13) % 800)::INTEGER
          WHEN 6 THEN 51 + (hash(k * 1000 + 13) % 150)::INTEGER
          WHEN 7 THEN 51 + (hash(k * 1000 + 13) % 150)::INTEGER
          WHEN 8 THEN 51 + (hash(k * 1000 + 13) % 150)::INTEGER
          WHEN 9 THEN 51 + (hash(k * 1000 + 13) % 150)::INTEGER
          ELSE 1 + (hash(k * 1000 + 13) % 50)::INTEGER END AS employees
      FROM range(${nCompanies}) t(k)`);
    // Revenue (USD) roughly follows size; one in ten unknown. 2-5 technologies each.
    await conn.run(`CREATE OR REPLACE TEMP TABLE gen_companies2 AS
      SELECT *,
        CASE WHEN hash(k * 1000 + 15) % 10 = 0 THEN NULL
          ELSE (employees * (20000 + hash(k * 1000 + 16) % 180000))::BIGINT END AS revenue,
        array_to_string([${[17, 18, 19, 20, 21].map((n) => pick(TECHS, n, 'k')).join(', ')}][1:2 + (hash(k * 1000 + 22) % 4)::INTEGER], ', ') AS techs
      FROM gen_companies`);
    await conn.run(`CREATE OR REPLACE TEMP TABLE gen_cities AS
      SELECT (row_number() OVER () - 1)::INTEGER AS ck, c.* FROM (VALUES ${CITIES.flatMap(([city, county, state, pin, w]) =>
        Array(w).fill(`(${[city, county, state, pin].map((x) => `'${x}'`).join(', ')})`)).join(', ')}) c(city, county, state, pin)`);
    const nCities = CITIES.reduce((n, c) => n + c[4], 0);
    let at = 0;
    const statusExpr = `CASE ${STATUSES.map(([label, w]) => `WHEN hash(i * 1000 + 30) % 100 < ${(at += w)} THEN '${label}'`).join(' ')} END`;

    const titleExpr = `CASE WHEN hash(i * 1000 + 5) % 100 < 12 THEN ${pick(TOP_TITLES, 6)}
      ELSE ${pick(LEVELS, 7)} || ${pick(ROLES, 8)} END`;

    // When appending, continue numbering (and the random sequence) after the existing people.
    let offset = 0;
    if (append) {
      const r = await conn.runAndReadAll(`SELECT coalesce(max(id), 0)::BIGINT m FROM old.people`).catch(() => null);
      offset = r ? Number(r.getRowObjectsJS()[0].m) : 0;
    }

    let t = Date.now();
    await conn.run(`CREATE OR REPLACE TEMP TABLE staging AS
      WITH g AS (
        SELECT i, ${pick(FIRST, 1)} AS first, ${pick(LAST, 2)} AS last,
          (hash(i * 1000 + 3) % ${nCompanies})::BIGINT AS k,
          (hash(i * 1000 + 9) % ${nCities})::INTEGER AS ck,
          hash(i * 1000 + 10) % 100 < 72 AS has_email,
          ${statusExpr} AS status
        FROM range(${offset}, ${offset + N}) t(i)
      )
      SELECT (g.i + 1)::BIGINT AS id,
        g.first || ' ' || g.last AS name,
        ${titleExpr} AS title,
        NULL::VARCHAR AS seniority,
        NULL::VARCHAR AS department,
        c.company, c.domain, c.industry, c.employees, c.revenue, c.techs,
        gc.city, gc.county, gc.state, 'India' AS country,
        gc.pin || lpad((hash(i * 1000 + 31) % 100)::VARCHAR, 3, '0') AS zip,
        CASE WHEN g.has_email
          THEN lower(g.first) || '.' || lower(g.last) || (CASE WHEN hash(i * 1000 + 14) % 3 = 0 THEN (i % 100)::VARCHAR ELSE '' END) || '@' || c.domain
          ELSE NULL END AS email,
        CASE WHEN g.has_email THEN g.status END AS email_status,
        CASE WHEN hash(i * 1000 + 32) % 100 < 70
          THEN '+91 ' || (20 + hash(g.k * 1000 + 33) % 70)::VARCHAR || ' ' || lpad((hash(g.k * 1000 + 34) % 100000000)::VARCHAR, 8, '0') END AS phone,
        CASE WHEN hash(i * 1000 + 35) % 100 < 38
          THEN '+91 ' || (70000 + hash(i * 1000 + 36) % 29999)::VARCHAR || ' ' || lpad((hash(i * 1000 + 37) % 100000)::VARCHAR, 5, '0') END AS direct_phone,
        CASE WHEN g.has_email AND g.status IN ('Verified', 'Catch-all', 'Invalid')
          THEN current_date - (hash(i * 1000 + 38) % 540)::INTEGER END AS verified_at
      FROM g JOIN gen_companies2 c ON c.k = g.k JOIN gen_cities gc ON gc.ck = g.ck`);
    console.log(`  generated rows (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  };

  const res = await rebuildDatabase({
    DuckDBInstance, dbPath, append, fillStaging,
    options: process.env.DUCKDB_MEMORY_LIMIT ? { memory_limit: process.env.DUCKDB_MEMORY_LIMIT } : {},
  });
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${Number(res.people).toLocaleString('en-IN')} people, ` +
    `${Number(res.companies).toLocaleString('en-IN')} companies, ${Number(res.titles).toLocaleString('en-IN')} titles.`);
  if (res.savedCleared) console.log('Saved leads were cleared because the people were replaced (accounts and tasks were kept).');
}

main().catch((e) => {
  console.error('Seed failed:', explainDbError(e, dbPath));
  process.exit(1);
});
