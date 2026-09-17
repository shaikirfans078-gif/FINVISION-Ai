# FinVision AI — Backend

Express server (JWT auth, persistent file-based user + profile store) that
**also serves the frontend**, so a single `npm start` gives you a fully
working app at one URL — no separate static server needed.

## Run

```
npm install
npm start
```

Then open `http://localhost:3000/` — you'll get the full FinVision AI app
(not just the API). Set `PORT` to change the port.

A copy of the frontend lives in `public/index.html` and is served for `/`
and any other non-`/api` route. It's configured with `API_BASE_URL = ''`
so it always calls the API on whatever host/port it's loaded from — this
matters for environments like Codespaces/devcontainers where the forwarded
port URL isn't `localhost:3000`.

## Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET  /api/protected-data` (requires `Authorization: Bearer <accessToken>`)
- `GET  /api/profile` (requires `Authorization: Bearer <accessToken>`) — returns the logged-in user's saved dashboard data: `{ records, budgetPlan, goals, updatedAt }`. `records` holds up to the last 12 saved months.
- `PUT  /api/profile` (requires `Authorization: Bearer <accessToken>`) — saves/overwrites the logged-in user's `{ records, budgetPlan, goals }` (older months beyond the most recent 12 are automatically trimmed)

CORS is open, so the standalone `finvision-ai-frontend` project can still
call this API from a different origin/port if you choose to deploy the
frontend separately instead of using the bundled copy in `public/`.

## Data storage

Users, refresh tokens, and each account's saved dashboard profile (the
"Save Monthly Profile" months — shown in the dashboard's Previous Data
history, up to the last 12 months — Smart Budget Planner %, and Goals)
are now persisted to a JSON file on disk at `data/db.json` (see `db.js`),
not just kept in memory. That means:

- Restarting the server no longer wipes out registered users or saved data.
- Logging out and logging back into the **same account** restores that
  account's saved months, budget plan, and goals — they're stored
  server-side per-account, not just in the browser tab.

`data/db.json` is created automatically on first write and is git-ignored.
No extra database engine or npm package is required — if you want to swap
this for a real database (Postgres, SQLite, Mongo, etc.) later, everything
that touches storage goes through `db.js`, so that's the only file you'd
need to change.
