# Lead Finder (Next.js + DuckDB)

An Apollo.io-style people search that stays fast with **2 crore (20 million)+ rows**: filters with live counts, pagination, saved leads, tasks and **CSV download** (opens in Excel). The app has two sides:

- **User side** (`/`): open to everyone, no login needed. Search people with filters, save leads, add tasks and download the results.
- **Admin panel** (`/admin`): dashboard, users (add, block, reset password, delete) and data (upload CSV, add / edit / delete people).

One Next.js app contains everything:
- **Frontend:** React pages and components (App Router). Works on phones (400px) and follows the system dark mode.
- **Backend:** Next.js Route Handlers under `app/api/` (Node.js runtime).
- **Database:** **DuckDB** through `@duckdb/node-api`, stored in one file (`data/leads.duckdb`). No database server to install.

The data lives only in the database. The browser never receives more than one page of rows (max 100); all filtering, counting, sorting and paging happens in DuckDB through the API routes.

## Run it (Windows PowerShell)

Requires **Node.js 20.9 or newer** (`node -v`).

```powershell
cd "C:\path\to\lead-finder-next"
npm install

# Option A: test with sample people (1,000,000 by default; 20,000,000 takes ~2.5 minutes)
npm run seed
npm run seed -- 20000000

# Option B: load your own data from a CSV
npm run import -- "C:\path\to\people.csv" --replace

# Option C (one time, after upgrading): copy the old SQLite data (people, users, saved leads, tasks)
npm run migrate-sqlite

# Development (hot reload)
npm run dev

# Production
npm run build
npm start                    # http://localhost:3000
$env:PORT=8080; npm start    # another port
```

> **Stop the website before running `seed`, `import` or `migrate-sqlite`.** A DuckDB file can be opened by one program at a time. If you forget, the script says the file is in use and what to do. (Uploading a CSV in **Admin > Data** works while the site runs.)

Open **http://localhost:3000**. Anyone can browse; **Sign in** / **Sign up** are in the top bar. On the first start two accounts are created:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@leadfinder.local` | `admin123` |
| User | `user@leadfinder.local` | `user123` |

**Change both passwords** in Admin > Users before going live (or set `ADMIN_*` / `USER_*` in `.env.local` before the first start).

## Guests and accounts

| | Guest (not signed in) | Signed in |
|---|---|---|
| Browse Home, People, Companies | Yes | Yes |
| Filter and download CSV | Yes | Yes |
| Save leads, tasks | Yes, but **in browser memory only: a page refresh clears them** | Yes, **stored in the database** until you remove them |

Every signed-in person has a **My profile** page (`/profile` for users, `/admin/profile` for admins; click your name in the top bar): change name and email, change password (needs the current one; other devices are logged out), see saved leads, tasks and logged-in devices, and log out.

**Sign-in is required.** Every page and API (except `/login`, `/signup` and `/api/auth/*`) needs a signed-in user; others are sent to `/login` and come back to the page they asked for (`proxy.js` checks for the cookie, and each page / route checks the session itself). Anyone can create an account at `/signup` with first name, surname, email, password and confirm password (set `ALLOW_SIGNUP=false` to allow only accounts the admin creates). *Keep me signed in* off makes the login end when the browser closes.

**Log in with Google.** Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (Google Cloud Console > APIs & Services > Credentials > OAuth client ID, type *Web application*) and add `<your site>/api/auth/google/callback` (e.g. `http://localhost:3000/api/auth/google/callback`) as an authorised redirect URI; behind nginx or on a domain also set `APP_URL`. The Google button then shows on both tabs. One click logs in; a new Google email gets a customer account automatically (only if sign-up is allowed). Code: `lib/google.js`, `app/api/auth/google/`.

## How the People page works

- Every filter is stored in the **URL**, e.g. `/people?personTitles=HR+Manager&city=Pune&page=2`. You can bookmark or share a search, and the browser Back button undoes the last filter.
- **Every filter option shows a live count** (like Apollo): how many people match that option *together with all the other active filters*. Typed job titles show their own count too. City and Industry have a search box that asks the server, so it works with thousands of values.
- Sort by clicking a column header or with the Sort menu; choose 10/25/50/100 per page. The bar shows the total and the query time in ms.
- When filters change quickly, the old request is cancelled (in the database too). Old results stay on screen, dimmed, with a moving bar, until the new ones arrive; after 30 seconds a clear message appears instead.
- **Download selected** exports the ticked rows (up to 1,000). **Download all results** exports everything matching the filters, up to `MAX_EXPORT_ROWS` (100,000). Downloads are streamed CSV files with a UTF-8 BOM (Excel shows Indian names correctly), and cells starting with `= + - @` get a leading `'` so Excel does not run them as formulas.
- Paging stops at row 50,000 (`MAX_OFFSET`); add filters to see the rest.

### Filters

| Filter | How it works |
|---|---|
| Job titles | Include / Exclude. Type and press Enter, or **paste many at once** (`CEO, CTO, Founder` or one per line): each becomes its own chip with a live count. Upload a CSV / TXT of titles too |
| Department | Checkboxes (Sales, Engineering, HR, Finance, ...). From the file's `Department` column, else **guessed from the title** |
| Seniority | Checkboxes. From the file, else guessed from the title |
| Company name | Include / Exclude, typed (with suggestions) or a **file of any size** (4 lakh+ names). Matched exactly, ignoring case |
| Company domain | Include / Exclude, typed or file. `https://www.tcs.com/about` is read as `tcs.com`. If the file has no domain column, it comes from work emails |
| Industry | Checkboxes with server search |
| Location | Zip / PIN code (Include / Exclude, typed or file); typed zips show where they are (city, district, state, country). Or pick Country, State, County / District, City (each with search; the lists narrow to each other) |
| # Employees | 1–50 ... 5,000+ |
| Revenue | < $1M ... $1B+ (annual, USD) |
| Install base | Technologies the company uses: "Uses" / "Does not use" (e.g. uses Salesforce, not HubSpot) |
| Email list | Include / Exclude emails, typed or file (e.g. exclude everyone you already contacted) |
| Contact info | Has email / phone / direct phone (each Any / Has / No), Email status (Verified, Catch-all, Guessed, Unverified, Invalid), Verified on (last 30 days ... or custom dates) |

**Uploaded lists.** A file is streamed to the server once (`POST /api/lists`, signed-in users) and stored in the database; the URL keeps only its id (`companyList=…`), so a search with a 4 lakh row list is still a short, shareable link. For a CSV the right column is found by its header (`Company`, `Website`, `Email`, `Zip`, ...), else the first column is used; a TXT file has one value per line. Pasting more than 100 values uploads them the same way. Lists are removed after 180 days (`LIST_KEEP_DAYS`).

**Save all.** Next to *Download all*, **Save all** adds every person in the current results (up to `MAX_EXPORT_ROWS`, 1 lakh) to *Saved leads* in one go (`POST /api/saved {"query": "<filters>"}`, signed-in users). People already saved are skipped. The Saved page shows the same columns as People and has *Remove all* (`DELETE /api/saved`).

The **Companies** page has its own filters (name and domain lists, industry, size, revenue, location, install base) and a "View people at these companies" button that carries them over.

**Upgrading:** data imported with an older version is rebuilt once, automatically, when the app starts (new columns are filled where they can be guessed: department from the title, domain from work emails). Ids and saved leads are kept. Import again to fill revenue, phones, location and the rest.

## Importing your data

Use **Admin > Data > Upload CSV** (the site keeps working during the import) or the command line:

```powershell
npm run import -- "C:\Users\me\Downloads\apollo-export.csv"            # add to existing people
npm run import -- "C:\Users\me\Downloads\apollo-export.csv" --replace  # replace all people
```

Tip: drag the file into the PowerShell window to paste its full path; keep the quotes. Both use DuckDB's `read_csv` (millions of rows per minute, low memory). Delimiter, quotes and the UTF-8 BOM are detected automatically. Columns are matched by header name, ignoring case, spaces and symbols:

| Field | Header names it recognizes (examples) |
|---|---|
| name | `Name`, `Full Name`, or `First Name` + `Last Name` |
| title | `Title`, `Job Title`, `Designation`, `Position`, `Role` |
| seniority | `Seniority`, `Level`. Apollo values like `c_suite`, `vp`, `owner` are mapped. **If missing, it is guessed from the title** (CEO → C-Suite, HR Manager → Manager, Intern → Intern …) |
| department | `Department`, `Departments`, `Function`. Apollo values like `master_sales` work. **If missing, guessed from the title** |
| company | `Company`, `Company Name`, `Organization`, `Account Name` |
| domain | `Website`, `Domain`, `Company Domain`, `Company Website`. If missing, taken from work emails (not gmail etc.) |
| industry | `Industry`, `Sector` |
| employees | `# Employees`, `Employees`, `Employee Count`, `Company Size`. `1,200`, `51-200` and `10,001+` all work |
| revenue | `Annual Revenue`, `Revenue`. `$12.5M`, `12,500,000`, `1.2 billion`, `10M-50M` and `50 Cr` (INR, about USD) all work |
| techs | `Technologies`, `Tech Stack`, `Install Base`; comma, `;` or `|` separated |
| city / county / state / country | `City`, `County` or `District`, `State`, `Country` |
| zip | `Zip`, `Zip Code`, `Postal Code`, `PIN Code` |
| email | `Email`, `Email Address`, `Work Email` |
| email status | `Email Status`. `verified`, `valid`, `catch-all`, `accept_all`, `guessed`, `likely`, `unverified`, `invalid`, `bounced` ... are mapped |
| verified on | `Email Last Verified At`, `Verified On`, `Last Verified`. `2025-03-01` and `01/03/2025` (day first) work |
| phone | `Phone`, `Company Phone`, `Corporate Phone`, `Work Phone` |
| direct phone | `Direct Phone`, `Work Direct Phone`, `Mobile`, `Mobile Phone` |

To add more header names, edit `CANDIDATES` in `lib/csv.js`. Without *replace*, rows are added and keep their ids. *Replace* also clears every user's saved list (the old people are gone); accounts and tasks are always kept.

The command-line import builds a complete new database file and swaps it in at the end, so a failed import (bad file, Ctrl+C) never damages your data. **After the command-line import, start the app again.** For an Excel file, save it as **CSV UTF-8** first.

**Errors you may see:** `File not found` (check the path and quotes), `The database file is in use` (stop the website first), `Could not find a name or email column` (rename the headers).

## Project structure

```
lead-finder-next/
├── app/
│   ├── layout.js                 html shell + toast + session
│   ├── login/  signup/           sign in / sign up (guest data is carried over)
│   ├── (shop)/                   user side (open to guests): Home, people/, companies/, saved/, tasks/, profile/
│   ├── admin/                    admin panel (needs role 'admin'): dashboard, users/, data/, profile/
│   ├── globals.css  icon.svg
│   └── api/                      backend
│       ├── auth/login, auth/signup, auth/logout, me, me/password
│       ├── people, people/facets, people/export, filters, companies, stats, saved, tasks
│       └── admin/                    stats, users, people, import
├── components/                   Session, Sidebar, TopBar, PeopleSearch (filters + live counts), Pager, ...
├── lib/
│   ├── db.js                     DuckDB connection pool, priority queue, cancellation, caches, first-run accounts
│   ├── schema.js                 table layout, build/import step, seniority guessing
│   ├── people.js                 search, live counts, companies, saved leads, export
│   ├── filters.js                filters <-> URL (shared by browser and server)
│   ├── csv.js  import.js         CSV column detection; Admin > Data upload
│   ├── auth.js  password.js      sessions (httpOnly cookie) + scrypt password hashing
│   ├── session.js  guest.js      login cookie + copying a guest's lists into the account
│   └── admin.js  tasks.js  profile.js  route.js  api.js  format.js
├── scripts/
│   ├── seed.js                   sample data generator (inside DuckDB, ~2.5 min for 20M)
│   ├── import-csv.js             CSV importer from the command line
│   ├── migrate-sqlite.js         one-time copy from the old data/leads.db
│   ├── bench.js                  speed test (npm run bench)
│   ├── sql.js                    quick SQL: npm run sql -- "SELECT count(*) FROM people"
│   └── next.js                   starts Next.js with more worker threads (used by dev / start)
├── instrumentation.js            warms the caches when the server starts
├── ecosystem.config.cjs          pm2 config
└── data/leads.duckdb             the database (created automatically)
```

Search and download APIs (people, people/facets, people/export, filters, companies, stats) are public. Saving leads and tasks needs a signed-in user, and `/api/admin/*` needs an admin (`requireUser()` / `requireAdmin()` in `lib/auth.js`). Users only ever see their own saved leads and tasks. Every query uses `?` parameters; sort columns come from a whitelist.

## API filters

`/api/people`, `/api/people/facets` and `/api/people/export` take the same parameters. Repeat a parameter to pass several values:

```
q=priya                                            (name or company contains)
personTitles=HR Manager&personTitles=Recruiter     (title contains any of these)
personNotTitles=Intern                             (title does not contain)
department=Sales  seniority=Manager  industry=Software
company=Sutra Works   companyNot=...               (exact company name, any case)
domain=tcs.com        domainNot=...
email=a@b.com         emailNot=...
zip=411001            zipNot=...
titleList=<id> titleNotList=<id> companyList=<id> companyNotList=<id> domainList=<id> domainNotList=<id>
emailList=<id> emailNotList=<id> zipList=<id> zipNotList=<id>     (uploaded lists, from POST /api/lists)
country=India  state=Maharashtra  county=Pune  city=Pune&city=Mumbai
employees=1-50 | 51-200 | 201-1000 | 1001-5000 | 5000+
revenue=0-1M | 1M-10M | 10M-50M | 50M-100M | 100M-500M | 500M-1B | 1B+
tech=Salesforce  techNot=HubSpot                   (install base)
hasEmail=true|false  hasPhone=true|false  hasDirect=true|false
emailStatus=Verified | Catch-all | Guessed | Unverified | Invalid
verifiedFrom=2026-01-01  verifiedTo=2026-06-30
saved=true                                         (my saved leads, signed in)
ids=1,2,3                                          (up to 1,000)
sortBy=name|title|company|city|seniority|employees|revenue|verified  sortDir=asc|desc
page=1  pageSize=25 (max 100)
```

`/api/people/facets` also takes `facet=city&fq=pu` to search one filter group (`facet=tech` for technologies).
`/api/companies` takes the company filters above (`q`, company / domain lists, industry, employees, revenue, country, state, city, tech, techNot) plus `sort=people|name|employees|revenue`.

```
POST /api/lists?kind=company&format=csv&name=list.csv   body: the file   -> { id, size, matched }
     kind: title | company | domain | email | zip     format: csv (column found by header) | lines
GET  /api/lists?ids=a,b                                -> names and sizes
GET  /api/locations?zip=411001&zip=560034              -> where each zip code is
```

Errors come back as `{"error": "..."}`.

## Settings (environment variables)

Put them in `.env.local` (see `.env.example`); the scripts read the same file.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | Port for `npm start` |
| `DB_PATH` | `data/leads.duckdb` | Database file |
| `DUCKDB_MEMORY_LIMIT` | `1GB` | RAM DuckDB may use for caching; 1GB suits a 4 GB server |
| `DUCKDB_THREADS` | all cores | CPU threads per query |
| `DB_CONCURRENCY` | 4 | Big queries running at once (others wait in a priority queue) |
| `MAX_EXPORT_ROWS` | 100000 | Most rows one download can contain |
| `MAX_OFFSET` | 50000 | Deepest row you can page to |
| `ALLOW_SIGNUP` | true | `false` turns off public sign-up (also for new Google accounts) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | – | Turns on Log in with Google |
| `APP_URL` | the browser's address | Public address of the site, for the Google redirect |
| `MAX_LIST_MB` | 200 | Largest include / exclude file |
| `MAX_LIST_VALUES` | 5000000 | Most values in one uploaded list (job title lists: 2,000) |
| `LIST_KEEP_DAYS` | 180 | Uploaded lists older than this are removed |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `USER_EMAIL`, `USER_PASSWORD` | see above | Accounts created on the very first start |

## Performance (measured on 2 crore rows)

`npm run bench` (website stopped) measures on your machine. Results on a 6-core PC with SSD, DuckDB limited to 1 GB RAM; "cold" means that filter combination was never searched before:

| Action | Time | Target |
|---|---|---|
| Filtered search + exact count, cold (8 different searches) | 60–224 ms | < 500 ms |
| Next page of the same search | 19–90 ms | < 100 ms |
| Live counts for all filter groups, cold | 142–307 ms | loads beside the results |
| Deepest page (row 50,000, sorted by name) | ~0.5 s | |
| Companies page / search | ~15 ms | |
| 100,000-row CSV download | ~2 s (first byte in ~10 ms) | |
| Server memory | ~0.9 GB | 4 GB server |

Why it is fast:
- **Columnar database.** DuckDB reads only the columns a query needs, using all CPU cores.
- **Small lookup tables.** Job titles and companies have their own tables, so "hr manager" is matched against a few thousand titles, not 20 million rows. Company size (`size_bucket`) and `has_email` are precomputed at import.
- **Late materialization.** A page first finds its 25 ids using only the filter and sort columns, then reads names and emails for just those rows.
- **One scan for many counts.** Filter groups that are not in use are counted together with `GROUPING SETS`.
- **Caches** for totals, filter lists, the count of each search (so the next page skips counting) and live counts. They are filled when the server starts and cleared when data changes.
- **Never hangs.** Queries run on worker threads, so pages keep loading while DuckDB works. A priority queue keeps small queries (login, badges, saved leads, tasks) ahead of big scans.

## Deploying with pm2

This app needs a **Node.js server** (native DuckDB module + a local database file). Use a VPS or office machine, not Vercel serverless.

```powershell
npm install -g pm2
npm install
npm run build
pm2 start ecosystem.config.cjs     # port 3000 (change "args" in the file for another port)
pm2 save
pm2 logs lead-finder
```

Start on boot: **Windows** `npm install -g pm2-windows-startup`, then `pm2-startup install`, then `pm2 save`. **Linux** `pm2 startup` (run the printed command), then `pm2 save`.

Keep **one instance in fork mode** (as in `ecosystem.config.cjs`): only one process can open the DuckDB file, so never use cluster mode. To import from the command line: `pm2 stop lead-finder`, `npm run import -- file.csv`, `pm2 start lead-finder`.

Serve it over **HTTPS** (e.g. Nginx, Caddy or IIS in front of port 3000); the session cookie is only marked secure on HTTPS. Back up `data/leads.duckdb` regularly (copy it while the app is stopped): it holds your users too.
