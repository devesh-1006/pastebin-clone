# Pastebin Clone

A small production-style paste service built with Next.js, TypeScript, Tailwind CSS, and PostgreSQL. It supports TTL-based expiry, max-view limits, safe HTML rendering, and API + HTML routes for creating and viewing pastes.

- Production app: https://take-home-henna.vercel.app
- Public source: https://github.com/devesh-1006/pastebin-clone

## Features

- Create a paste with arbitrary text content
- Optional TTL in seconds
- Optional max-view cap
- Shareable URL for each paste
- JSON API for creation and retrieval
- HTML page for public sharing
- Safe rendering of text content without executable HTML
- Database-backed persistence with automatic schema initialization
- Atomic, concurrency-safe view-count enforcement
- Deterministic expiry testing with `TEST_MODE=1`

## API endpoints

- `GET /api/healthz` — verifies database connectivity and returns `{ "ok": true }`
- `POST /api/pastes` — creates a paste from JSON input
- `GET /api/pastes/:id` — returns paste content and metadata, consuming a view
- `GET /p/:id` — human-readable HTML paste page

## Tech stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Neon serverless PostgreSQL via `@neondatabase/serverless`
- Vitest for automated tests

## Local setup

1. Install dependencies:

   ```powershell
   cd C:\Users\dpill\Desktop\take-home
   npm install
   ```

2. Copy `.env.example` to a real `.env.local` file and replace placeholders with your own values:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Start the app:

   ```powershell
   npm run dev
   ```

4. Open `http://localhost:3000` in your browser.

## Database configuration

This project is designed for Neon Postgres. Add a valid `DATABASE_URL` in `.env.local` before using the app in a real environment.

If no database is configured in local development or tests, the app falls back to an in-memory `pg-mem` database for quick smoke checks. Production requires `DATABASE_URL`; startup requests return a service error if it is missing instead of silently using non-persistent storage.

## Required environment variables

- `DATABASE_URL`: Neon PostgreSQL connection string
- `APP_URL`: public site origin, such as `https://your-domain.vercel.app`
- `TEST_MODE`: set to `1` only for deterministic time-testing; keep it `0` in production

## Persistence layer

The application stores paste rows in a PostgreSQL `pastes` table. The table is created automatically on first use so deployment does not require a separate manual migration step. The same schema is safe to run repeatedly because it uses `CREATE TABLE IF NOT EXISTS`.

The production deployment uses a Neon PostgreSQL resource connected through Vercel. Vercel provides `DATABASE_URL` to production functions. Local development and tests may use the in-memory `pg-mem` fallback when no database URL is configured; production refuses that fallback so non-persistent storage cannot appear healthy.

## Important design decisions

- View-limit enforcement is atomic: the database checks availability and increments the `views` column in one SQL operation. This prevents two concurrent requests from exceeding the configured `max_views` limit.
- Expiry is evaluated using the effective current time. In test mode, the header `x-test-now-ms` overrides the system clock.
- HTML paste pages count as successful views the same way as API fetches, and the route shares the same expiry checks.

## Tests and verification

Run the automated suite:

```powershell
npm test
```

Run the type checker:

```powershell
npm run typecheck
```

Run the linter:

```powershell
npm run lint
```

Create a production build:

```powershell
npm run build
```

## Deployment

1. Connect a Neon PostgreSQL resource to the Vercel project for the Production environment. This provides `DATABASE_URL`.
2. Set `APP_URL` to the deployed origin and `TEST_MODE` to `0`.
3. Deploy the project from Vercel or run `vercel deploy --prod`.
4. Confirm `/api/healthz` returns `{"ok":true}`, then verify paste creation and retrieval.

## Notes for learning

The main flow is simple:

- a user submits content from the home page
- the server validates the request
- the paste is written to PostgreSQL
- the API returns a unique share URL
- later requests read the record, enforce expiry and max-view rules atomically, and return the content or a 404

This project uses two main patterns: HTTP API routes and database queries. Together they let the app persist data across requests instead of keeping everything in JavaScript memory.
