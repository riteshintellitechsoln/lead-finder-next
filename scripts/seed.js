// Generates sample people so you can test with millions of rows.
// Usage: node scripts/seed.js 1000000      (deletes existing people first)
import { db, createIndexes, dropIndexes } from '../lib/db.js';

const COUNT = parseInt(process.argv[2], 10) || 1000000;
const BATCH = 10000;

const FIRST = ['Aarav','Priya','Rohan','Sneha','Vikram','Ananya','Karan','Neha','Arjun','Pooja','Rahul','Kavya','Aditya','Isha','Siddharth','Meera','Nikhil','Riya','Manish','Divya','Harsh','Tanvi','Yash','Shruti','Amit','Sakshi','Varun','Nidhi','Gaurav','Anjali','Deepak','Swati','Kunal','Payal','Saurabh','Komal','Abhishek','Ritika','Mohit','Jyoti'];
const LAST = ['Sharma','Verma','Patel','Iyer','Gupta','Reddy','Joshi','Nair','Mehta','Kulkarni','Singh','Desai','Chauhan','Rao','Malhotra','Jain','Pillai','Bose','Agarwal','Mishra','Pandey','Shah','Kapoor','Saxena','Tiwari','Yadav','Bhat','Menon','Khanna','Dubey'];
const TITLES = [
  ['HR Manager','Manager'],['Senior HR Manager','Manager'],['HR Executive','Entry'],['Talent Acquisition Lead','Senior'],
  ['Talent Acquisition Specialist','Entry'],['HR Business Partner','Senior'],['Recruiter','Entry'],['Head of HR','Head'],
  ['VP Human Resources','VP'],['CHRO','C-Suite'],['Software Engineer','Entry'],['Senior Software Engineer','Senior'],
  ['Engineering Manager','Manager'],['Product Manager','Manager'],['CTO','C-Suite'],['CEO','C-Suite'],['Founder','Owner'],
  ['Sales Manager','Manager'],['Business Development Executive','Entry'],['Marketing Lead','Senior'],
  ['Operations Manager','Manager'],['Finance Manager','Manager'],['Data Analyst','Entry'],['Director of Sales','Director'],
];
const INDUSTRIES = ['IT Services','Software','Financial Services','Logistics','Healthcare','Retail','Education','Energy','Media','Construction','Food & Beverage','Manufacturing','Automotive','Telecom','Real Estate','Pharmaceuticals'];
const CITIES = ['Pune','Bengaluru','Mumbai','Hyderabad','Indore','Delhi NCR','Chennai','Ahmedabad','Kolkata','Jaipur','Bhopal','Nagpur','Kochi','Chandigarh','Lucknow','Coimbatore'];
const W1 = ['Nexora','Bluepeak','Kaveri','Orbitly','Sahyadri','Trinetra','Quillmark','Zenvolt','Monsoon','Ridgeway','Pixelwise','Aranya','Veda','Sutra','Indus','Garuda','Nimbus','Prism','Arka','Tarang','Kriti','Vistara','Omni','Lumen','Saffron','Narmada','Everest','Aakash','Mitra','Devika'];
const W2 = ['Systems','Fintech','Logistics','Labs','Health','Retail','Edu','Energy','Media','Infra','Studio','Foods','Technologies','Solutions','Motors','Networks','Realty','Pharma','Analytics','Works'];

// 30 x 20 = 600 companies, each with a fixed industry and size
const COMPANIES = [];
let s = 42;
const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
for (const a of W1) for (const b of W2) {
  const sizes = [20, 45, 120, 180, 450, 900, 2500, 4800, 12000];
  COMPANIES.push({ name: `${a} ${b}`, industry: pick(INDUSTRIES), employees: pick(sizes), domain: `${a}${b}`.toLowerCase() + '.com' });
}

console.log(`Seeding ${COUNT.toLocaleString('en-IN')} people...`);
const t0 = Date.now();
// New people get reused ids, so saved lists that point at old ids are cleared too
db.exec('DELETE FROM saved; DELETE FROM people;');
dropIndexes();

const insert = db.prepare(
  'INSERT INTO people (name, title, seniority, company, industry, employees, city, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
const insertBatch = db.transaction((n) => {
  for (let i = 0; i < n; i++) {
    const f = pick(FIRST), l = pick(LAST), [title, seniority] = pick(TITLES), c = pick(COMPANIES);
    const email = rnd() > 0.3 ? `${f}.${l}${Math.floor(rnd() * 100)}@${c.domain}`.toLowerCase() : null;
    insert.run(`${f} ${l}`, title, seniority, c.name, c.industry, c.employees, pick(CITIES), email);
  }
});

for (let done = 0; done < COUNT; done += BATCH) {
  insertBatch(Math.min(BATCH, COUNT - done));
  if ((done + BATCH) % 100000 === 0) console.log(`  ${(done + BATCH).toLocaleString('en-IN')} rows`);
}

console.log('Building indexes...');
createIndexes();
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
