# Lead Finder (Next.js)

People search for large data (tested with **10 lakh rows**): filters, pagination, saved leads, tasks and **CSV download** (opens in Excel). The app has two sides:

- **User side** (`/`): open to everyone, no login needed. Search people with filters, save leads, add tasks and download the results.
- **Admin panel** (`/admin`): dashboard, users (add, block, reset password, delete) and data (upload CSV, add / edit / delete people).

One Next.js app contains everything:
- **Frontend:** React pages and components (App Router).
- **Backend:** Next.js Route Handlers under `app/api/` (Node.js runtime).
- **Database:** SQLite through `better-sqlite3`, stored in one file (`data/leads.db`). No database server to install.

## Run it

Requires **Node.js 20.9 or newer**.

```bash
npm install

# Option A: test with 10 lakh sample people
npm run seed

# Option B: load your own data from a CSV
npm run import -- path/to/your-people.csv --replace

# Development (hot reload)
npm run dev

# Production
npm run build
npm start
```

Open **http://localhost:3000**. Anyone can browse; **Sign in** / **Sign up** are in the top bar. On the first start two accounts are created:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@leadfinder.local` | `admin123` |
| User | `user@leadfinder.local` | `user123` |

**Change both passwords** in Admin > Users before going live (or set `ADMIN_*` / `USER_*` in `.env` before the first start).

## Guests and accounts

| | Guest (not signed in) | Signed in |
|---|---|---|
| Browse Home, People, Companies | Yes | Yes |
| Filter and download CSV | Yes | Yes |
| Save leads, tasks | Yes, but **in browser memory only: a page refresh clears them** | Yes, **stored in the database** until you remove them |

Every signed-in person has a **My profile** page (`/profile` for users, `/admin/profile` for admins; click your name in the top bar): change name and email, change password (needs the current one; other devices are logged out), see saved leads, tasks and logged-in devices, and log out.

Anyone can create an account at `/signup` (set `ALLOW_SIGNUP=false` to allow only accounts the admin creates). When a guest signs in or signs up, the leads they saved and their open tasks are copied into the account, so nothing is lost. The guest lists live in `components/Session.js`; every page uses the same `useSession()` actions, which call the API when signed in and change the in-memory lists for guests.

## Project structure

```
lead-finder-next/
├── app/
│   ├── layout.js                 html shell + toast + session
│   ├── login/  signup/           sign in / sign up (guest data is carried over)
│   ├── (shop)/                   user side (open to guests)
│   │   ├── layout.js                 sidebar + top bar (Sign in / Sign up for guests)
│   │   ├── page.js                   Home dashboard
│   │   └── people/  companies/  saved/  tasks/
│   ├── admin/                    admin panel (needs role 'admin')
│   │   ├── layout.js  page.js        dashboard: data, users, top cities
│   │   └── users/  data/
│   ├── globals.css  icon.svg
│   └── api/                      backend
│       ├── auth/login, auth/signup, auth/logout
│       ├── people, people/export, filters, companies, stats, saved, tasks
│       └── admin/                    stats, users, people, import
├── components/                   Session (guest lists + actions), Sidebar, TopBar, PeopleSearch, LoginForm, ...
│   └── admin/                    DataManager
├── lib/
│   ├── db.js                     SQLite connection, tables, first-run accounts, migration
│   ├── auth.js  password.js      sessions (httpOnly cookie) + scrypt password hashing
│   ├── session.js  guest.js      login cookie + copying a guest's lists into the account
│   ├── people.js                 search / saved / export queries
│   ├── admin.js                  admin dashboard, users, people edit
│   ├── import.js                 CSV importer (used by the script and Admin > Data)
│   └── tasks.js  route.js  api.js  format.js
├── scripts/
│   ├── seed.js                   sample data generator
│   └── import-csv.js             CSV importer from the command line
└── data/leads.db                 created automatically
```

Search and download APIs (people, people/export, filters, companies, stats) are public. Saving leads and tasks needs a signed-in user, and `/api/admin/*` needs an admin (`requireUser()` / `requireAdmin()` in `lib/auth.js`). Users only ever see their own saved leads and tasks.

## How the People page works

- Every filter is stored in the **URL**, e.g. `/people?personTitles=HR+Manager&city=Pune&page=2`. You can bookmark or share a search, and the browser Back button undoes the last filter.
- When the URL changes, `PeopleSearch` calls `/api/people` with the same query string and shows one page of results.
- **Download selected** exports the ticked rows (up to 1,000). **Download all results** exports everything matching the filters, up to `MAX_EXPORT_ROWS` (100,000 by default).
- Downloads are CSV files with a UTF-8 BOM, so Excel opens them directly with the right characters.

## Importing your data

Upload the file in **Admin > Data > Upload CSV**, or run `scripts/import-csv.js`. Both read the CSV as a stream, so a file with millions of rows works without running out of memory. It matches columns by header name, ignoring case:

| Field | Header names it recognizes |
|---|---|
| name | `name`, `full name` or `first name` + `last name` |
| title | `title`, `job title`, `designation`, `position` |
| seniority | `seniority`, `level`. If missing, it is guessed from the title |
| company | `company`, `company name`, `organization` |
| industry | `industry`, `sector` |
| employees | `employees`, `# employees`, `employee count`, `company size` |
| city | `city`, `location` |
| email | `email`, `email address`, `work email` |

If your headers use other names, add them to `COLUMN_NAMES` in `lib/import.js`. Without *replace*, rows are added to existing data. *Replace* also clears every user's saved list, because the new rows get new ids. After an upload in the admin panel the counts refresh by themselves; **after the command-line script, restart the app**. For an Excel file, save it as **CSV UTF-8** first.

## API filters

`/api/people` and `/api/people/export` take the same parameters. Repeat a parameter to pass several values:

```
q=priya
personTitles=HR Manager&personTitles=Recruiter     (title contains any of these)
personNotTitles=Software Engineer                  (title does not contain)
city=Pune&city=Mumbai
seniority=Manager
industry=Software
employees=1-50 | 51-200 | 201-1000 | 1001-5000 | 5000+
hasEmail=true
saved=true                                         (my saved leads, signed in)
ids=1,2,3
sortBy=name|title|company|city|employees  sortDir=asc|desc
page=1  pageSize=25 (max 100)
```

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | Port for `npm start` |
| `MAX_EXPORT_ROWS` | 100000 | Most rows one download can contain |
| `DB_FILE` | `data/leads.db` | Database file location |
| `ALLOW_SIGNUP` | true | `false` turns off public sign-up |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `USER_EMAIL`, `USER_PASSWORD` | see above | Accounts created on the very first start |

Put them in a `.env` file (see `.env.example`) or set them in the shell.

## Performance (measured on 10 lakh rows)

| Action | Time |
|---|---|
| Plain page of 25 | ~8 ms |
| HR Manager filter | ~65 ms |
| 5 filters combined + sort | ~210 ms |
| Next page of the same search | ~2 ms (count is cached) |
| 100,000-row CSV download | ~0.3 s |

The browser only ever receives one page. Filtering, counting and sorting happen in SQLite with indexes, and downloads are streamed in batches of 5,000 rows.

**Beyond ~1 crore rows**, or if "contains" searches feel slow, switch to SQLite FTS5, PostgreSQL or Elasticsearch inside `lib/people.js`. The API stays the same, so the pages need no changes.

## Deploying

This app needs a **Node.js server** because it uses a native SQLite module and a local database file. Use a VPS or office machine, not Vercel serverless:

```bash
npm run build
npm install -g pm2
pm2 start npm --name lead-finder -- start
```

Serve it over **HTTPS** (e.g. Nginx or Caddy in front of port 3000); the session cookie is only marked secure on HTTPS. Back up `data/leads.db` regularly: it holds your users too.
