# Lead Finder (Next.js)

People search for large data (tested with **10 lakh rows**): filters, pagination, saved leads, tasks and **CSV download**.

One Next.js app contains both parts:
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

Open **http://localhost:3000**

## Project structure

```
lead-finder-next/
├── app/
│   ├── layout.js                 shell: sidebar + top bar + toast
│   ├── page.js                   Home dashboard (Server Component, reads DB directly)
│   ├── people/page.js            People search (loads filter options on the server)
│   ├── companies/page.js         Companies list
│   ├── saved/page.js             Saved leads + download
│   ├── tasks/page.js             Tasks
│   ├── globals.css               all styles
│   ├── icon.svg                  favicon
│   └── api/                      backend
│       ├── people/route.js           GET  search + filter + paginate
│       ├── people/export/route.js    GET  CSV download (streamed)
│       ├── filters/route.js          GET  filter options with counts
│       ├── stats/route.js            GET  dashboard numbers
│       ├── companies/route.js        GET  companies
│       ├── saved/route.js            POST save leads
│       ├── saved/[id]/route.js       DELETE remove saved lead
│       ├── tasks/route.js            GET / POST tasks
│       └── tasks/[id]/route.js       PATCH / DELETE task
├── components/
│   ├── Sidebar.js  TopBar.js  Toast.js  Pager.js
│   ├── PeopleSearch.js           filter panel + results table + downloads
│   ├── PersonCell.js  TaskItem.js  HomeWidgets.js
├── lib/
│   ├── db.js                     SQLite connection, tables, indexes (server only)
│   ├── people.js                 people / company / saved / export queries (server only)
│   ├── tasks.js                  task queries (server only)
│   ├── route.js                  API error handling helper
│   ├── api.js                    browser fetch + download helpers
│   └── format.js                 number / date formatting (shared)
├── scripts/
│   ├── seed.js                   sample data generator
│   └── import-csv.js             CSV importer
└── data/leads.db                 created automatically
```

## How the People page works

- Every filter is stored in the **URL**, e.g. `/people?personTitles=HR+Manager&city=Pune&page=2`. You can bookmark or share a search, and the browser Back button undoes the last filter.
- When the URL changes, `PeopleSearch` calls `/api/people` with the same query string and shows one page of results.
- **Download selected** exports the ticked rows (up to 1,000). **Download all results** exports everything matching the filters, up to `MAX_EXPORT_ROWS` (100,000 by default).

## Importing your data

`scripts/import-csv.js` reads the CSV as a stream, so a file with millions of rows works without running out of memory. It matches columns by header name, ignoring case:

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

If your headers use other names, add them to `COLUMN_NAMES` at the top of the script. Without `--replace`, rows are added to existing data. **Restart the app after an import** so the filter lists and counts refresh. For an Excel file, save it as **CSV UTF-8** first.

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
saved=true
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

Put them in a `.env` file or set them in the shell.

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

There is **no login** yet, so anyone who can reach the port can see the data. Run it on a private network, or add authentication (e.g. Auth.js) before putting it on the internet.
