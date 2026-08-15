# Sakustudi Agent Instructions

## Runtime And Commands

- Use Node 24+ and npm; keep `package-lock.json` synchronized with `package.json`.
- Run commands from repository root; migrations use relative path `./drizzle`.
- Install with `npm ci`; use `npm install <package>` only when intentionally changing dependencies.
- Local prerequisites: Docker with PostgreSQL 16 and Redis 7.
- Start local services with `docker compose -f docker-compose.dev.yml up -d postgres redis`.
- Do not use bare `docker compose` for local database work; production Compose does not publish PostgreSQL to host port 5432.
- Copy `.env.example` to `.env`; local mail can use `MAIL_ADAPTER=file` and `MAIL_FILE_PATH=.tmp/mail.json`.
- Apply schema and seed data in order: `npm run db:migrate`, then `npm run db:seed`.
- Run web with `npm run dev` and worker separately with `npm run worker`.
- `npm run start` is production mode and requires `npm run build` first; it runs `node server.js`.
- `npm run build` also bundles worker/migration/seed entrypoints through `vite.worker.config.ts`.
- Production worker command is `npm run start:worker`; development worker command is `npm run worker`.

## Verification

- Fast checks: `npm run typecheck`, `npm run lint`, `npm test`.
- Integration tests require PostgreSQL and Redis: `npm run test:integration`.
- Run one unit test with `npx vitest run --project unit tests/unit/<file>.test.ts`.
- Run one integration file with `npx vitest run --project integration tests/integration/<file>.integration.test.ts`.
- Run one browser spec with `npm run test:e2e -- tests/e2e/<file>.spec.ts`.
- Full gate is `npm run ci`; it includes typecheck, lint, unit, integration, build, and E2E.
- Playwright uses one worker because E2E mail capture uses shared `.tmp/mail.json`.
- Stop worker/server processes after interrupted E2E runs; stale BullMQ workers consume test jobs and cause false failures.
- On Windows, kill the process tree with `taskkill /PID <pid> /T /F`, not only the npm wrapper.

## Architecture

- This is one TypeScript app, not a monorepo: web routes/components live under `app/`; background jobs live under `worker/`.
- React Router v8 Framework Mode uses the explicit route tree in `app/routes.ts`; do not rely on implicit file routes.
- `server.js` is the Node/Express production listener; `build/server/index.js` is its imported app bundle, not the listener itself.
- `/` is the public Sakustudi landing page; `/dashboard` is the authenticated app entrypoint.
- Route loaders read data; route actions mutate data; domain services under `app/modules/` own business rules and authorization.
- Better Auth owns auth tables and sessions; derive `userId` from the server session, never from request form/query data.
- PostgreSQL is source of truth; Redis is BullMQ execution state. Activity changes write outbox/reminder rows before publishing jobs.
- Worker jobs must carry IDs/metadata only, never note HTML, file bytes, passwords, or email bodies.

## Database And Storage

- Add schema changes as new Drizzle migrations under `drizzle/`; inspect generated SQL before commit.
- Never use unreviewed schema push commands or edit an already-applied migration.
- Preserve user ownership predicates and indexes on every repository read/update/delete.
- Keep transactions short; never hold a DB transaction across SMTP, Redis, or storage calls.
- Local files use private `STORAGE_LOCAL_ROOT` (default `./storage`); S3/MinIO is optional and private.
- Upload validation is server-side: allowlisted PDF/PNG/JPEG/DOCX, MIME plus magic bytes, size/quota, generated storage key, checksum.
- Signed/download URLs require an ownership check; private files must not be served from public webroot.
- Rich text uses Tiptap for input and `sanitize-html` server-side before storing HTML/search text.

## Styling And Generated Files

- Use Tailwind CSS v4 through `@tailwindcss/vite` and CSS-first `@theme` in `app/styles/app.css`.
- Do not add `tailwind.config.ts` or v3 `@tailwind` directives; use Doze semantic tokens (`bg-canvas`, `bg-surface`, `text-ink`, `border-border`, `ring-focus`).
- Keep mobile controls at least 44px and expose text/ARIA state in addition to color.
- Do not edit generated `build/`, `.react-router/`, `node_modules/`, coverage, or Playwright artifacts.
- PWA output is under `build/client`; do not cache authenticated loader responses or private files.

## Deployment And Docs

- Production Compose requires `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL`.
- Production startup order: `docker compose build`, `docker compose up -d postgres redis`, `docker compose --profile tools run --rm migrate`, then `docker compose up -d`.
- Production Compose uses internal service names; local host commands use `localhost:5432` and `localhost:6379` from `docker-compose.dev.yml`.
- Update README/operations docs when changing env vars, migrations, storage, backup/restore, SMTP, or worker behavior.
- Never commit `.env`, credentials, UT student data, or copyrighted UT materials.
