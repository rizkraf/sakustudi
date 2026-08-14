# Sakustudi MVP Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted, mobile-first Sakustudi MVP Core for UT students with authentication, onboarding, academic tracking, notes, private files, calendar events, reminders, export, and account deletion.

**Architecture:** Use a React Router v7 Framework Mode modular monolith. Route loaders/actions call authenticated domain services, Drizzle persists to PostgreSQL, and a separate BullMQ worker uses Redis for reminder, email, export, and cleanup jobs. PostgreSQL remains source of truth; an outbox protects publication to Redis.

**Tech Stack:** React Router v7, Vite, React, TypeScript, Tailwind CSS v4, Node.js, PostgreSQL, Drizzle ORM, Better Auth, BullMQ, Redis, Tiptap StarterKit, sanitize-html, Zod, vite-plugin-pwa, Vitest, Playwright, Docker Compose.

## Global Constraints

- Product audience: UT students only for MVP.
- Course data: versioned UT seed catalog plus user-created custom courses.
- Timezone: display and reminder calculations use `Asia/Jakarta`; database timestamps use UTC.
- Deadline without time: interpret as `23:59` in `Asia/Jakarta`.
- Reminder schedule: three days and one day before deadline at 09:00 local time.
- SMTP: required for auth verification/password reset; optional for reminder email.
- Queue: BullMQ + Redis; PostgreSQL is source of truth.
- Queue payloads contain IDs and metadata, never note or file contents.
- Notes: Tiptap WYSIWYG UI, server-side `sanitize-html`, searchable plain text.
- Styling: Tailwind CSS v4 CSS-first `@theme`; no `tailwind.config.ts` or v3 `@tailwind` directives.
- Auth: Better Auth database-backed sessions; no custom password hashing.
- Authorization: derive `userId` from server session; never trust client `userId`.
- Storage: private local volume by default; S3-compatible storage is optional.
- PWA: installable app shell; no offline mutations or authenticated response caching.
- UI: NeedMCP Doze tokens, 44px minimum interactive hit areas, status never color-only.
- MVP excludes billing, AI, admin dashboard, UT login, scraping, and WhatsApp.
- Production migrations are committed Drizzle migrations, never unreviewed schema push.
- Every task must leave typecheck, lint, and relevant tests passing.

---

## File Map

Create focused files with one responsibility:

| Path | Responsibility |
| --- | --- |
| `app/root.tsx` | Document shell, global providers, PWA registration, error boundary |
| `app/routes.ts` | React Router route tree and protected route middleware |
| `app/routes/` | Public, onboarding, academic, privacy, and settings route modules |
| `app/components/` | App shell, form, feedback, navigation, and domain UI components |
| `app/styles/` | Tailwind CSS entrypoint, Doze `@theme` tokens, rich text styles, responsive layout |
| `app/lib/auth/` | Better Auth server/client setup and session helpers |
| `app/lib/db/` | Drizzle client, schemas, migrations, seed entrypoint |
| `app/lib/errors/` | Stable application error codes and route response mapping |
| `app/lib/request/` | Request ID, origin/CSRF checks, rate-limit boundary |
| `app/lib/storage/` | Storage interface and local/S3-compatible implementations |
| `app/lib/queue/` | BullMQ connection, queue names, enqueue helpers, job IDs |
| `app/lib/time/` | UTC/local conversion and reminder schedule calculation |
| `app/lib/validation/` | Zod schemas shared by forms and domain commands |
| `app/modules/` | Domain services and repository functions by feature |
| `worker/index.ts` | BullMQ worker process and graceful shutdown |
| `worker/tasks/` | Reminder, email, export, cleanup, and outbox tasks |
| `tests/unit/` | Pure domain and utility tests |
| `tests/integration/` | PostgreSQL, Redis, auth, storage, and worker tests |
| `tests/e2e/` | Playwright browser workflows |
| `drizzle/` | Generated and custom SQL migrations |
| `scripts/` | Seed, migration, reconciliation, and local operations scripts |
| `docker/` | Container entrypoints and health checks |
| `Dockerfile` | Production web/worker image |
| `docker-compose.yml` | Self-hosted PostgreSQL, Redis, web, worker, optional MinIO |
| `.env.example` | Non-secret configuration reference |
| `README.md` | Setup, development, self-hosting, and test commands |
| `docs/operations/` | Backup, restore, SMTP, storage, and worker operations |
| `docs/legal/` | Terms and Privacy Policy source content |
| `.github/workflows/ci.yml` | Typecheck, lint, test, build, security, and E2E CI |

---

## Task 1: Bootstrap React Router and Toolchain

**Files:**
- Create: generated React Router Framework Mode files under `app/` and `server/`
- Create: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `react-router.config.ts`
- Create: `vitest.config.ts`, `tests/setup.ts`
- Create: `eslint.config.js`, `.prettierrc`, `.gitignore`
- Modify: preserve `prd-sakustudi.md` and `docs/` unchanged
- Test: generated root route and `tests/unit/bootstrap.test.ts`

**Interfaces:**
- Produces npm scripts: `dev`, `build`, `start`, `typecheck`, `lint`, `format`, `test`, `test:integration`, `test:e2e`, `test:coverage`, `ci`, `db:migrate`, `db:seed`, `worker`.
- Produces a Node production server that can serve the React Router build.
- Produces strict TypeScript configuration used by every later task.

- [ ] **Step 1: Scaffold the Node custom-server template without overwriting product docs**

Run from repository root:

```bash
npx create-react-router@latest . --template remix-run/react-router-templates/node-custom-server
```

If the generator refuses a non-empty directory, generate into a temporary
directory and copy only generated application/config files into the repository.
Do not replace `prd-sakustudi.md`, `docs/superpowers/specs/`, or
`docs/superpowers/plans/`.

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install better-auth @better-auth/drizzle-adapter drizzle-orm pg bullmq ioredis zod sanitize-html @tiptap/react @tiptap/starter-kit @tiptap/extension-link vite-plugin-pwa nodemailer date-fns-tz @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 3: Install development and test dependencies**

```bash
npm install --save-dev typescript @types/node @types/react @types/react-dom @types/pg @types/sanitize-html eslint prettier vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @playwright/test tsx tailwindcss @tailwindcss/vite
```

- [ ] **Step 4: Set strict scripts and compiler settings**

Keep the generated React Router commands and expose these scripts:

```json
{
  "scripts": {
    "dev": "react-router dev",
    "build": "react-router build",
    "start": "node ./build/server/index.js",
    "typecheck": "react-router typegen && tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:e2e": "playwright test",
    "test:coverage": "vitest run --coverage",
    "ci": "npm run typecheck && npm run lint && npm test && npm run test:integration && npm run build && npm run test:e2e",
    "db:migrate": "tsx scripts/migrate.ts",
    "db:seed": "tsx scripts/seed.ts",
    "worker": "tsx worker/index.ts"
  }
}
```

Configure `moduleResolution` for the selected Node/Vite runtime, enable
`strict`, and keep generated React Router route types in the typecheck path.
Create `vitest.config.ts` with a `unit` project for `tests/unit/**/*.{test,spec}`
using `jsdom`, and an `integration` project for
`tests/integration/**/*.integration.test.ts` using the Node environment.

- [ ] **Step 5: Add a minimal health route and smoke test**

Create `app/routes/healthz.ts` returning:

```ts
export async function loader() {
  return Response.json({ status: "ok" });
}
```

Add a unit test that imports the loader and expects status `200` and body
`{ status: "ok" }`.

- [ ] **Step 6: Run bootstrap verification**

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Expected: all commands pass and the generated app starts with `npm run dev`.

- [ ] **Step 7: Commit the working scaffold**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts react-router.config.ts app server tests .gitignore eslint.config.js .prettierrc
git commit -m "chore: bootstrap React Router application"
```

## Task 2: Add Tailwind Doze UI Foundation and PWA Shell

**Files:**
- Create: `app/styles/app.css`, `app/styles/rich-text.css`
- Create: `app/components/layout/AppShell.tsx`, `app/components/layout/MobileNav.tsx`, `app/components/layout/DesktopNav.tsx`
- Create: `app/components/feedback/EmptyState.tsx`, `app/components/feedback/LoadingState.tsx`, `app/components/feedback/ErrorState.tsx`
- Modify: `app/root.tsx`, `vite.config.ts`
- Test: `tests/unit/app-shell.test.tsx`, `tests/e2e/pwa-installability.spec.ts`

**Interfaces:**
- `AppShell({ children, user, activeRoute }): JSX.Element` owns responsive navigation.
- `MobileNav({ activeRoute }): JSX.Element` exposes accessible labels for every icon-only item.
- `ErrorState({ title, message, retryHref }): JSX.Element` renders safe user-facing errors.

- [ ] **Step 1: Configure Tailwind CSS v4 and define Doze theme tokens**

Add the first-party Vite plugin in `vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
});
```

Create `app/styles/app.css` using CSS-first configuration. Doze tokens must be
available through semantic Tailwind utilities:

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --font-sans: Geist, sans-serif;
  --font-mono: "Geist Mono", monospace;
  --color-primary: #ffce54;
  --color-success: #cbe273;
  --color-danger: #ff6b6b;
  --color-info: #60a5fa;
  --color-canvas: #fafafa;
  --color-surface: #ffffff;
  --color-ink: #171717;
  --color-muted: #767676;
  --color-border: #e5e7eb;
  --color-focus: rgba(255, 206, 84, 0.5);
  --radius-input: 4px;
  --radius-control: 8px;
  --radius-card: 12px;
  --spacing-page: 24px;
}

:root {
  color-scheme: light;
}

.dark {
  color-scheme: dark;
  --color-canvas: #151515;
  --color-surface: #2a2c2e;
  --color-ink: #fcfcfc;
  --color-muted: #929292;
  --color-border: #374151;
  --color-focus: rgba(255, 206, 84, 0.6);
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply min-h-screen bg-canvas font-sans text-ink antialiased;
  }
}
```

Import `app.css` from `app/root.tsx`. Do not create `tailwind.config.ts`, use
v3 `@tailwind base/components/utilities`, or hardcode new color values in
feature components. Use semantic classes such as `bg-canvas`, `bg-surface`,
`text-ink`, `text-muted`, `border-border`, and `ring-focus`.

- [ ] **Step 2: Implement the responsive shell**

Use Tailwind responsive utilities for 24px mobile gutters, a fixed bottom nav
with 44px hit areas, and a desktop sidebar/navigation bar. Every icon-only
control includes an accessible label.
The navigation routes are `/dashboard`, `/academic-terms`, `/calendar`,
`/notes`, and `/settings/profile`.

- [ ] **Step 3: Add shared feedback primitives**

Implement empty, loading, error, and retry states with visible text and
semantic status. Add `aria-live="polite"` to asynchronous status regions.

- [ ] **Step 4: Configure the PWA manifest and service worker**

Configure `VitePWA` with `registerType: "prompt"`, app metadata, theme color
`#ffce54`, and 192px/512px icons. Precache only static assets. Do not add a
runtime cache for authenticated loaders or private files.

- [ ] **Step 5: Test both themes and mobile layout**

Use Vitest to verify navigation labels and route state. Use Playwright at a
400px-wide viewport to verify no horizontal overflow and visible bottom nav.
Verify both light and dark semantic token classes.

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck
npm run lint
npm test
npm run build
git add app/root.tsx app/components app/styles vite.config.ts tests package.json package-lock.json
git commit -m "feat: add Tailwind Doze app shell and PWA foundation"
```

## Task 3: Build PostgreSQL Schema, Migrations, and Seeds

**Files:**
- Create: `app/lib/db/client.ts`, `app/lib/db/schema/auth.ts`, `app/lib/db/schema/app.ts`, `app/lib/db/schema/index.ts`
- Create: `drizzle.config.ts`, `scripts/migrate.ts`, `scripts/seed.ts`, `docker-compose.dev.yml`
- Create: `drizzle/*.sql`
- Create: `tests/integration/db-schema.integration.test.ts`
- Modify: `package.json`, `.env.example`

**Interfaces:**
- `db: NodePgDatabase<AppSchema>` exported from `app/lib/db/client.ts`.
- `getDb(): NodePgDatabase<AppSchema>` returns the pooled Drizzle client.
- `seedCatalog(db): Promise<void>` inserts idempotent UT programs and catalog courses.
- App schemas reference the Better Auth user ID as `text`.

- [ ] **Step 1: Configure pooled PostgreSQL access**

Create a single `pg.Pool` using `DATABASE_URL`, `max`, and idle timeout from
environment. Export one Drizzle database instance; never create a connection
per request.

Start the disposable development database before integration tests:

```bash
docker compose -f docker-compose.dev.yml up -d postgres
```

Use this minimal local service definition before the production Compose task:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: sakustudi
      POSTGRES_USER: sakustudi
      POSTGRES_PASSWORD: sakustudi
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sakustudi -d sakustudi"]
      interval: 5s
      timeout: 5s
      retries: 10
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
```

- [ ] **Step 2: Generate Better Auth schema through the adapter**

Configure the Drizzle adapter and generate the auth schema with the Better Auth
CLI. Include the generated user/session/account/verification tables in the
Drizzle migration flow. Do not hand-edit generated auth columns.

- [ ] **Step 3: Define application tables and constraints**

Define these tables in `app/lib/db/schema/app.ts`:

```text
profiles
legal_consents
study_programs
course_catalog
academic_terms
courses
activities
notes
attachments
calendar_events
useful_links
reminders
outbox_events
data_exports
audit_logs
analytics_events
```

Add foreign keys, user ownership indexes, enum/check constraints, one active
term partial unique index, attachment parent check, unique reminder
idempotency key, and outbox event key.

- [ ] **Step 4: Generate and inspect migrations**

```bash
npx drizzle-kit generate
```

Read generated SQL before committing. Add custom SQL migrations for partial
indexes, check constraints, or seed data that Drizzle cannot express safely.

- [ ] **Step 5: Implement migration and seed scripts**

`scripts/migrate.ts` applies committed migrations and exits nonzero on failure.
`scripts/seed.ts` inserts a small versioned catalog fixture and is idempotent
by stable catalog codes.

- [ ] **Step 6: Write integration tests against real PostgreSQL**

Test that:

- migrations create all expected tables;
- two active terms for one user violate the partial unique index;
- an attachment with two parents violates the check constraint;
- user-owned rows can be deleted by foreign-key policy;
- catalog seed can run twice without duplicate codes.

- [ ] **Step 7: Verify and commit**

```bash
npm run db:migrate
npm run db:seed
npm run typecheck
npm run test:integration
git add app/lib/db drizzle scripts package.json .env.example tests/integration
git commit -m "feat: add PostgreSQL schema and catalog seed"
```

## Task 4: Integrate Better Auth and Legal Consent

**Files:**
- Create: `app/lib/auth/server.ts`, `app/lib/auth/client.ts`, `app/lib/auth/session.ts`
- Create: `app/lib/mail/mailer.ts`, `app/lib/mail/templates.ts`
- Create: `app/routes/api.auth.ts`, `app/routes/register.tsx`, `app/routes/login.tsx`, `app/routes/forgot-password.tsx`, `app/routes/reset-password.$token.tsx`
- Create: `app/routes/legal.privacy.tsx`, `app/routes/legal.terms.tsx`
- Create: `app/modules/auth/consent.server.ts`, `app/modules/auth/consent.schema.ts`
- Create: `tests/integration/auth.integration.test.ts`, `tests/e2e/auth.spec.ts`
- Modify: `app/routes.ts`, `.env.example`

**Interfaces:**
- `getSessionUser(request): Promise<SessionUser | null>`.
- `requireSessionUser(request): Promise<SessionUser>` throws a redirect or typed unauthorized response.
- `recordRequiredConsents(userId, input): Promise<void>` records accepted document versions.
- `auth.handler(request): Promise<Response>` serves Better Auth endpoints.
- `type SessionUser = { id: string; email: string; name: string | null }`.
- `type AuthEmailInput = { kind: "verification" | "password_reset"; to: string; url: string; displayName: string | null }`.
- `sendAuthEmail(input: AuthEmailInput): Promise<void>` sends verification and reset messages through the configured mail adapter.

- [ ] **Step 1: Configure Better Auth with Drizzle and explicit origins**

Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and
`BETTER_AUTH_TRUSTED_ORIGINS`. Enable email/password, require email
verification, configure password limits, and implement callbacks for
verification/reset emails through `sendAuthEmail`. Use an in-memory mail
adapter in tests and the SMTP adapter in production. Reminder email moves
through BullMQ in Task 10; auth recovery email remains available before the
worker task so the auth milestone is independently testable.

- [ ] **Step 2: Add the auth catch-all route**

Map `/api/auth/*` to `auth.handler(request)`. The handler must preserve Better
Auth cookies and return the native `Response` without exposing secrets.

- [ ] **Step 3: Add legal consent enforcement**

Validate ToS and Privacy Policy checkboxes before sign-up. Record document
versions after user creation, then block authenticated app routes when required
consent rows are missing. Do not record password or raw tokens in consent data.

- [ ] **Step 4: Add protected-route session middleware**

Define route middleware that loads the Better Auth session, stores the user in
router context, and redirects to `/login` when absent. Use the server session
user ID for every later domain service call.

- [ ] **Step 5: Test auth and session edge cases**

Integration tests cover valid/invalid login, verification requirement, reset
callback, session revocation, trusted origin rejection, missing consent, and
account deletion re-authentication requirement. E2E tests cover registration,
login, and reset-password UI.

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck
npm run lint
npm run test:integration
npm run test:e2e -- tests/e2e/auth.spec.ts
git add app/lib/auth app/routes app/modules/auth tests app/routes.ts .env.example
git commit -m "feat: add Better Auth and legal consent"
```

## Task 5: Establish Domain Services, Authorization, and Error Contracts

**Files:**
- Create: `app/lib/errors/codes.ts`, `app/lib/errors/AppError.ts`, `app/lib/errors/response.ts`
- Create: `app/lib/request/request-id.server.ts`, `app/lib/request/security.server.ts`
- Create: `app/lib/authorization/ownership.server.ts`
- Create: `app/lib/validation/form-data.ts`
- Create: `app/modules/shared/repository.ts`, `app/modules/shared/types.ts`
- Create: `tests/unit/errors.test.ts`, `tests/integration/authorization.integration.test.ts`

**Interfaces:**
- `type AppErrorCode = "VALIDATION_FAILED" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "LIMIT_EXCEEDED" | "RATE_LIMITED" | "DEPENDENCY_UNAVAILABLE"`.
- `class AppError extends Error { code: AppErrorCode; fieldErrors?: Record<string, string[]> }`.
- `requireOwnedUser(userId, resource): void`.
- `toActionResponse(error: unknown): Response`.
- `type FieldErrorResponse = { ok: false; fieldErrors: Record<string, string[]>; formErrors: string[] }`.
- `parseForm<T>(schema: ZodSchema<T>, formData: FormData): T | FieldErrorResponse`.

- [ ] **Step 1: Define stable errors and route mapping**

Map validation failures to field errors, auth failures to redirect/401,
ownership failures to generic 404/403, conflicts to 409, and unexpected errors
to a request-ID response. Never serialize database or provider error details to
the browser.

- [ ] **Step 2: Add request IDs and structured logging context**

Generate or preserve `x-request-id`. Add it to response headers and structured
logs containing route, user ID hash, error code, and duration. Exclude note HTML,
file content, passwords, auth tokens, and email bodies.

- [ ] **Step 3: Add application mutation CSRF/origin boundary**

For cookie-authenticated state changes, validate `Origin` against configured
origins and require the application CSRF token for form mutations. Keep Better
Auth origin/CSRF checks enabled separately for auth endpoints.

- [ ] **Step 4: Add repository ownership helpers**

Repositories must accept `userId` as the first argument and include it in every
select/update/delete predicate. Add an integration test proving User A cannot
read, update, delete, or download User B resources.

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
git add app/lib/errors app/lib/request app/lib/authorization app/lib/validation app/modules/shared tests
git commit -m "feat: add domain error and ownership boundaries"
```

## Task 6: Implement UT Catalog, Terms, and Onboarding

**Files:**
- Create: `app/modules/catalog/catalog.repository.ts`, `app/modules/catalog/catalog.service.ts`
- Create: `app/modules/academic-terms/terms.repository.ts`, `app/modules/academic-terms/terms.service.ts`, `app/modules/academic-terms/terms.schema.ts`
- Create: `app/modules/onboarding/onboarding.service.ts`, `app/modules/onboarding/onboarding.schema.ts`
- Create: `app/routes/onboarding.tsx`, `app/routes/academic-terms._index.tsx`, `app/routes/academic-terms.$termId.tsx`
- Create: `app/components/catalog/CoursePicker.tsx`, `app/components/onboarding/OnboardingChecklist.tsx`
- Create: `tests/unit/onboarding.test.ts`, `tests/integration/onboarding.integration.test.ts`, `tests/e2e/onboarding.spec.ts`
- Modify: `app/routes.ts`

**Interfaces:**
- `listCatalogCourses(userId, query): Promise<CourseCatalogItem[]>`.
- `createAcademicTerm(userId, input): Promise<AcademicTerm>`.
- `setActiveTerm(userId, termId): Promise<AcademicTerm>`.
- `createCourseFromCatalog(userId, termId, catalogCourseId): Promise<Course>`.
- `createCustomCourse(userId, termId, input): Promise<Course>`.
- `completeOnboarding(userId): Promise<void>`.

- [ ] **Step 1: Implement catalog queries**

Return only active seed rows, filter by program and normalized search text, and
never allow users to mutate catalog rows.

- [ ] **Step 2: Implement term commands**

Validate dates and owner. Enforce one active term through the database partial
unique index and return `CONFLICT` when a concurrent activation loses.

- [ ] **Step 3: Implement catalog/custom course commands**

Copy catalog identity into the user-owned course relation. Custom courses have
nullable catalog reference and require name/code input validation.

- [ ] **Step 4: Build the three-step onboarding UI**

Program selection, active term selection, and course selection must preserve
form errors, work with keyboard controls, and expose a clear first-value
checklist. Redirect a completed user to `/dashboard`.

- [ ] **Step 5: Test onboarding**

Unit test step validation. Integration test catalog copy, custom course, active
term uniqueness, and ownership. E2E test a fresh user completing onboarding.

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:e2e -- tests/e2e/onboarding.spec.ts
git add app/modules/catalog app/modules/academic-terms app/modules/onboarding app/routes app/components/catalog app/components/onboarding tests app/routes.ts
git commit -m "feat: add UT catalog and onboarding"
```

## Task 7: Implement Courses, Activities, Progress, and Dashboard

**Files:**
- Create: `app/modules/courses/courses.repository.ts`, `app/modules/courses/courses.service.ts`
- Create: `app/modules/activities/activities.repository.ts`, `app/modules/activities/activities.service.ts`, `app/modules/activities/activities.schema.ts`
- Create: `app/modules/dashboard/dashboard.service.ts`
- Create: `app/lib/time/deadlines.ts`, `app/lib/time/progress.ts`
- Create: `app/routes/dashboard.tsx`, `app/routes/activities._index.tsx`, `app/routes/activities.new.tsx`, `app/routes/activities.$activityId.tsx`, `app/routes/activities.$activityId.edit.tsx`, `app/routes/courses.$courseId.tsx`
- Create: `app/components/activities/ActivityForm.tsx`, `app/components/activities/ActivityCard.tsx`, `app/components/dashboard/DashboardSummary.tsx`, `app/components/dashboard/UpcomingDeadlines.tsx`, `app/components/dashboard/ProgressCard.tsx`
- Create: `tests/unit/activity-rules.test.ts`, `tests/unit/progress.test.ts`, `tests/integration/activities.integration.test.ts`, `tests/e2e/activities.spec.ts`
- Modify: `app/routes.ts`

**Interfaces:**
- `createActivity(userId, input): Promise<Activity>`.
- `updateActivity(userId, activityId, input): Promise<Activity>`.
- `setActivityStatus(userId, activityId, status): Promise<Activity>`.
- `listUpcomingActivities(userId, termId, range): Promise<Activity[]>`.
- `calculateCourseProgress(completedCount, totalCount): number`.
- `deriveActivityState(activity, now): "not_started" | "in_progress" | "completed" | "overdue"`.

- [ ] **Step 1: Implement activity schema validation**

Require title, course, type, and deadline. Accept optional note, link, and
attachment references. Convert date-only input to 23:59 `Asia/Jakarta`, then
store UTC.

- [ ] **Step 2: Implement activity commands and status rules**

Permit `not_started -> in_progress -> completed`, with completion timestamp
set only for completed. Allow reopening completed activities while clearing
completion timestamp. Derive overdue without persisting a manual overdue state.

- [ ] **Step 3: Implement progress and dashboard queries**

Return active term, course count, nearest deadlines, overdue activities, and
course progress in one bounded query shape. Add pagination to activity lists.

- [ ] **Step 4: Build activity and dashboard routes**

Use loader reads and action mutations. Show pending submission state, field
errors, empty states, and a quick action for new activity. Revalidate dashboard
and calendar data after mutation.

- [ ] **Step 5: Test the workflow**

Unit test date conversion, overdue derivation, status transitions, and progress.
Integration test cross-user activity access and concurrent status updates. E2E
test create, edit, complete, reopen, and dashboard visibility.

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:e2e -- tests/e2e/activities.spec.ts
git add app/modules/courses app/modules/activities app/modules/dashboard app/lib/time app/routes app/components/activities app/components/dashboard tests app/routes.ts
git commit -m "feat: add academic activity dashboard"
```

## Task 8: Implement Notes, Rich Text, Search, and Links

**Files:**
- Create: `app/modules/notes/notes.repository.ts`, `app/modules/notes/notes.service.ts`, `app/modules/notes/notes.schema.ts`
- Create: `app/modules/links/links.repository.ts`, `app/modules/links/links.service.ts`
- Create: `app/components/links/UsefulLinks.tsx`
- Create: `app/lib/content/sanitize.ts`, `app/lib/content/plain-text.ts`
- Create: `app/components/editor/RichTextEditor.tsx`, `app/components/editor/EditorToolbar.tsx`, `app/components/editor/RichTextViewer.tsx`
- Create: `app/routes/notes._index.tsx`, `app/routes/notes.new.tsx`, `app/routes/notes.$noteId.tsx`
- Create: `tests/unit/sanitize.test.ts`, `tests/unit/notes-search.test.ts`, `tests/integration/notes.integration.test.ts`, `tests/e2e/notes.spec.ts`
- Modify: `app/routes.ts`, `app/styles/rich-text.css`

**Interfaces:**
- `sanitizeNoteHtml(dirtyHtml): string`.
- `extractPlainText(sanitizedHtml): string`.
- `createNote(userId, input): Promise<Note>`.
- `updateNote(userId, noteId, input): Promise<Note>`.
- `searchNotes(userId, query, filters): Promise<NoteSummary[]>`.
- `listUsefulLinks(userId, courseId?): Promise<UsefulLink[]>`.

- [ ] **Step 1: Configure Tiptap**

Use `StarterKit` and Link extension. Toolbar exposes bold, italic, headings,
bullet list, numbered list, link, and undo/redo. Set `immediatelyRender: false`
for SSR compatibility. Read submitted content with `editor.getHTML()`.

- [ ] **Step 2: Implement server sanitizer**

Allow only the tags required by the toolbar: paragraphs, headings, emphasis,
strong, lists, list items, links, and line breaks. Allow only `href` on links,
allow `http`, `https`, and `mailto`, disable protocol-relative URLs, and strip
scripts, event handlers, iframes, styles, and unsafe attributes.

- [ ] **Step 3: Persist sanitized HTML and plain text**

Sanitize before database write. Generate `content_text` from sanitized output.
Search only the plain-text field or PostgreSQL full-text index; never search raw
HTML with string concatenation.

- [ ] **Step 4: Build notes and links routes**

Support create, edit, view, delete, search, course filter, and tags. Render
`UsefulLinks` inside course detail and settings surfaces; links open in a new
tab with safe `rel="noreferrer noopener"`.

- [ ] **Step 5: Test security and editor behavior**

Unit test removal of script tags, event attributes, `javascript:` URLs, and
iframes. Integration test user ownership, search indexing, and link mutation.
E2E test non-technical toolbar usage and note persistence after navigation.

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:e2e -- tests/e2e/notes.spec.ts
git add app/modules/notes app/modules/links app/lib/content app/components/editor app/routes app/styles/rich-text.css tests app/routes.ts
git commit -m "feat: add rich text notes and search"
```

## Task 9: Implement Private File Storage

**Files:**
- Create: `app/lib/storage/storage.ts`, `app/lib/storage/local-storage.server.ts`, `app/lib/storage/s3-storage.server.ts`
- Create: `app/modules/files/files.repository.ts`, `app/modules/files/files.service.ts`, `app/modules/files/files.schema.ts`
- Create: `app/routes/files.$attachmentId.ts`, `app/components/files/AttachmentPicker.tsx`, `app/components/files/AttachmentList.tsx`
- Create: `tests/unit/file-validation.test.ts`, `tests/integration/files.integration.test.ts`, `tests/e2e/files.spec.ts`
- Modify: `.env.example`, `app/routes.ts`, `docker-compose.yml`

**Interfaces:**
- `type PutObjectInput = { key: string; body: Buffer; contentType: string; size: number; checksum: string }`.
- `type StoredObject = { key: string; size: number; checksum: string; contentType: string }`.
- `interface FileStorage { put(input: PutObjectInput): Promise<StoredObject>; get(key: string): Promise<ReadableStream>; delete(key: string): Promise<void>; exists(key: string): Promise<boolean> }`.
- `type AttachmentParent = { kind: "note" | "activity"; id: string }`.
- `validateUpload(file): Promise<ValidatedUpload>`.
- `createAttachment(userId: string, parent: AttachmentParent, file: File): Promise<Attachment>`.
- `downloadAttachment(userId, attachmentId): Promise<Response>`.
- `deleteAttachment(userId, attachmentId): Promise<void>`.

- [ ] **Step 1: Define upload policy**

Use an allowlist for MVP documents and images: PDF, PNG, JPEG, and DOCX. Set a
per-file limit through `MAX_UPLOAD_BYTES` and a user storage limit through
`MAX_STORAGE_BYTES`. Reject executable extensions, archive files, path-like
filenames, and MIME/signature mismatches.

- [ ] **Step 2: Implement local private storage**

Store objects outside the public web root under a random ID path. Apply safe
filesystem permissions. The local adapter must never construct a path from the
raw original filename.

- [ ] **Step 3: Implement optional S3-compatible adapter**

Use AWS SDK only when `STORAGE_DRIVER=s3`. Keep bucket private. Implement
download signing behind the ownership service; do not expose storage credentials
to the browser.

- [ ] **Step 4: Implement authorized upload/download/delete**

For MVP, stream upload through the server action/handler, validate before
storage, then write metadata. Use `pending` metadata only if the S3 adapter
requires a two-step upload. Download checks `userId` and attachment ownership
before streaming or signing.

- [ ] **Step 5: Add cleanup jobs and orphan detection**

Worker cleanup removes objects marked for deletion and objects with no matching
database metadata after a safe grace period. Deletion is idempotent when the
object is already absent.

- [ ] **Step 6: Test file security**

Test extension allowlist, MIME spoofing, signature mismatch, size limit, random
object key, cross-user download, path traversal, deletion retry, and private
storage behavior.

- [ ] **Step 7: Verify and commit**

```bash
npm run typecheck
npm run lint
npm run test:integration
npm run test:e2e -- tests/e2e/files.spec.ts
git add app/lib/storage app/modules/files app/routes/files.* app/components/files tests .env.example docker-compose.yml app/routes.ts
git commit -m "feat: add private attachment storage"
```

## Task 10: Implement Calendar, Outbox, BullMQ, and Reminders

**Files:**
- Create: `app/lib/queue/connection.ts`, `app/lib/queue/names.ts`, `app/lib/queue/job-ids.ts`, `app/lib/queue/publish.ts`
- Create: `app/lib/time/reminders.ts`
- Create: `app/modules/calendar/calendar.repository.ts`, `app/modules/calendar/calendar.service.ts`
- Create: `app/modules/reminders/reminders.repository.ts`, `app/modules/reminders/reminders.service.ts`
- Create: `app/modules/outbox/outbox.repository.ts`, `app/modules/outbox/outbox.service.ts`
- Create: `app/routes/calendar.tsx`, `app/routes/settings.reminders.tsx`
- Create: `worker/index.ts`, `worker/tasks/publish-outbox.ts`, `worker/tasks/send-reminder.ts`, `worker/tasks/send-email.ts`, `worker/tasks/reconcile.ts`, `worker/shutdown.ts`
- Create: `tests/unit/reminder-schedule.test.ts`, `tests/integration/queue.integration.test.ts`, `tests/e2e/reminders.spec.ts`
- Modify: `app/modules/activities/activities.service.ts`, `docker-compose.yml`, `.env.example`, `app/routes.ts`

**Interfaces:**
- `calculateReminderTimes(deadlineUtc, timezone): Date[]` returns at most two UTC timestamps for the configured 3-day/1-day schedule.
- `buildReminderJobId(reminderId, deadlineVersion, channel): string`.
- `enqueueOutboxEvent(eventId): Promise<void>`.
- `createReminderSchedule(userId, activity): Promise<Reminder[]>`.
- `cancelReminderSchedule(userId, activityId): Promise<void>`.
- `publishPendingOutbox(limit): Promise<number>`.
- `type ReminderJobPayload = { reminderId: string; userId: string; channel: "in_app" | "email" }`.
- `sendReminder(job: ReminderJobPayload): Promise<void>`.

- [ ] **Step 1: Implement timezone-safe reminder calculation**

Use `date-fns-tz` to convert deadline UTC to `Asia/Jakarta`, subtract three
days and one day by calendar date, set 09:00 local time, and convert back to
UTC. Skip times already in the past. Unit test daylight/timezone conversion
with fixed clock values.

- [ ] **Step 2: Implement calendar events and reminder rows**

Create user-owned calendar event commands. Activity deadlines are projected
without duplicate mutable calendar rows. Reminder rows include channel,
scheduled time, status, deadline version, and unique idempotency key.

- [ ] **Step 3: Add transactional outbox writes**

When an activity is created or its deadline/status changes, write the activity,
reminder rows, and outbox event in one PostgreSQL transaction. Never enqueue to
Redis inside that transaction.

- [ ] **Step 4: Configure BullMQ queues**

Create `reminders`, `emails`, `exports`, and `cleanup` queues using a shared
Redis connection. Set `attempts: 3` and exponential backoff for email tasks.
Set deterministic `jobId` values so duplicate publication is harmless.

- [ ] **Step 5: Implement the worker and graceful shutdown**

Register workers with bounded concurrency. On SIGINT/SIGTERM, stop accepting
jobs, await active jobs, close BullMQ workers, close Redis, and exit with the
correct status. Log failed jobs with IDs and error codes, never private payloads.

- [ ] **Step 6: Implement outbox publisher and reconciliation**

Publisher selects pending outbox rows in short transactions, publishes by
deterministic job ID, and marks publication. Reconciliation re-enqueues pending
outbox/reminder rows after Redis recovery. Use a unique key and worker-side
state check to tolerate at-least-once execution.

- [ ] **Step 7: Implement reminder delivery**

The worker loads the reminder by ID, verifies it is still pending and its
activity is incomplete, creates the in-app reminder state, and optionally sends
email through SMTP. Update sent/failed state in a short transaction. Completed,
deleted, or rescheduled activities must not send stale reminders.

- [ ] **Step 8: Add calendar and reminder UI**

Show activity deadlines and manual events in the calendar. Show unread in-app
reminders, read state, and reminder preferences. Expose email reminder toggle
only when SMTP capability is configured.

- [ ] **Step 9: Test queue correctness**

Integration test outbox publication, deterministic duplicate jobs, retry and
backoff, worker restart reconciliation, completed-activity cancellation,
deadline rescheduling, and timezone schedule. E2E test reminder state through a
fake clock and test mail transport.

- [ ] **Step 10: Verify and commit**

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:e2e -- tests/e2e/reminders.spec.ts
git add app/lib/queue app/lib/time app/modules/calendar app/modules/reminders app/modules/outbox app/modules/activities app/routes/calendar.tsx app/routes/settings.reminders.tsx worker tests docker-compose.yml .env.example
git commit -m "feat: add BullMQ reminders and calendar"
```

## Task 11: Implement Privacy Settings, Export, and Account Deletion

**Files:**
- Create: `app/modules/privacy/privacy.service.ts`, `app/modules/privacy/privacy.schema.ts`
- Create: `app/modules/exports/export.service.ts`, `app/modules/exports/export.schema.ts`
- Create: `app/routes/settings.privacy.tsx`, `app/routes/settings.profile.tsx`
- Create: `app/components/privacy/DeleteAccountDialog.tsx`, `app/components/privacy/ExportDataButton.tsx`
- Create: `worker/tasks/create-export.ts`, `worker/tasks/delete-user-files.ts`
- Create: `tests/integration/privacy.integration.test.ts`, `tests/e2e/privacy.spec.ts`
- Modify: `worker/index.ts`, `app/routes.ts`

**Interfaces:**
- `requestDataExport(userId): Promise<DataExport>`.
- `getExportDownload(userId, exportId): Promise<Response>`.
- `requestAccountDeletion(userId, reauth): Promise<void>`.
- `deleteUserDomainData(userId): Promise<void>`.
- `revokeAllSessionsAndDeleteAuthUser(userId): Promise<void>`.

- [ ] **Step 1: Build privacy settings**

Display consent document versions, analytics consent toggle, reminder
preferences, export control, and destructive delete action. Require visible
confirmation and fresh session for account deletion.

- [ ] **Step 2: Implement export request and worker**

Create an export row and outbox event transactionally. Worker writes JSON for
profile, consents, terms, courses, activities, notes, links, reminders, and
calendar events, then includes private attachment files in a ZIP. Exclude
auth secrets, sessions, passwords, and internal audit logs. Store export object
privately with expiry.

- [ ] **Step 3: Implement deletion workflow**

Require Better Auth fresh-session/re-authentication. Block new writes, delete
domain rows according to foreign-key policy, enqueue private object deletion,
revoke sessions, and delete the Better Auth user. Make retries safe when a
domain row or object is already absent.

- [ ] **Step 4: Test privacy boundaries**

Test export ownership, export content exclusions, short expiry, delete
reauthentication, domain cascade, file cleanup retry, session revocation, and
no private data in audit logs. E2E test export download and account deletion.

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck
npm run lint
npm run test:integration
npm run test:e2e -- tests/e2e/privacy.spec.ts
git add app/modules/privacy app/modules/exports app/routes/settings.* app/components/privacy worker/tasks/create-export.ts worker/tasks/delete-user-files.ts tests app/routes.ts
git commit -m "feat: add privacy export and account deletion"
```

## Task 12: Add CI, Docker, Backup, and Repository Documentation

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `docker/migrate.sh`, `docker/healthcheck.sh`
- Create: `.github/workflows/ci.yml`
- Create: `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `LICENSE`
- Create: `docs/operations/backup-restore.md`, `docs/operations/smtp.md`, `docs/operations/storage.md`, `docs/legal/privacy.md`, `docs/legal/terms.md`
- Modify: `.env.example`, `package.json`
- Test: CI workflow and clean checkout smoke run

**Interfaces:**
- `docker compose up --build` starts web, worker, PostgreSQL, and Redis.
- `docker compose --profile migrate run --rm migrate` applies migrations.
- `npm run ci` runs local equivalents of all required CI checks.

- [ ] **Step 1: Add environment contract**

Document and validate:

```text
NODE_ENV
DATABASE_URL
REDIS_URL
BETTER_AUTH_SECRET
BETTER_AUTH_URL
BETTER_AUTH_TRUSTED_ORIGINS
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
SMTP_FROM
STORAGE_DRIVER
STORAGE_LOCAL_ROOT
S3_ENDPOINT
S3_REGION
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
MAX_UPLOAD_BYTES
MAX_STORAGE_BYTES
```

Fail startup when required database/auth settings are missing. Keep SMTP and
S3 optional only when their corresponding features are disabled.

- [ ] **Step 2: Build production images and Compose services**

Use a multi-stage Node image. Run the generated React Router server in `web`
and `worker/index.ts` in `worker`. Persist PostgreSQL and Redis volumes. Keep
MinIO behind an optional Compose profile. Run migrations through a one-shot
profile before web/worker startup.

- [ ] **Step 3: Add health and readiness checks**

Health checks verify HTTP, PostgreSQL connection, Redis connection, and worker
heartbeat. A worker that cannot connect to Redis must report not ready but must
not delete pending PostgreSQL outbox rows.

- [ ] **Step 4: Add backup and restore documentation**

Document PostgreSQL logical backup, private storage volume/object backup, Redis
recovery behavior, restore order, environment secrets, and a fresh-environment
restore drill. PostgreSQL and private storage are authoritative; Redis jobs are
reconciled from PostgreSQL after restore.

- [ ] **Step 5: Add CI workflow**

CI must run Node setup, dependency install from lockfile, PostgreSQL and Redis
services, migration/seed, typecheck, lint, Vitest unit/integration tests,
production build, Playwright Chromium/mobile smoke tests, dependency audit,
secret scan, and Docker build. Playwright uses two retries only on CI and saves
trace on first retry.

- [ ] **Step 6: Add open-source and legal docs**

Use an MIT license unless the project owner changes it before release. Document
contribution flow, code of conduct, private security reporting, UT affiliation
disclaimer, no-scraping policy, data retention, export/delete behavior, SMTP,
storage privacy, and backup operations.

- [ ] **Step 7: Run clean-checkout verification and commit**

Create a disposable clone outside the active checkout, then run the clean
checkout verification from that clone:

```bash
git clone . ../sakustudi-clean-checkout
```

In `../sakustudi-clean-checkout`, run:

```bash
npm ci
npx playwright install chromium
docker compose up -d postgres redis
docker compose --profile migrate run --rm migrate
npm run db:seed
npm run ci
docker compose down
```

Commit documentation and infrastructure separately from application feature
commits:

```bash
git add Dockerfile docker-compose.yml docker .github README.md CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md LICENSE docs/operations docs/legal .env.example package.json
git commit -m "chore: add self-hosting and CI documentation"
```

## Task 13: Final Pilot Verification and Release Readiness

**Files:**
- Modify: only files named by a failing gate after root-cause verification; no new feature files
- Test: `tests/e2e/`, integration suite, Docker Compose deployment
- Review: `prd-sakustudi.md`, approved design spec, all implementation commits

**Interfaces:**
- The pilot checklist in the design spec is the release gate.
- No new feature enters this task; only correctness, security, and documentation fixes are allowed.

- [ ] **Step 1: Run all local gates**

```bash
npm run typecheck
npm run lint
npm run test
npm run test:integration
npm run test:coverage
npm run build
npm run test:e2e
```

- [ ] **Step 2: Run security checks**

Verify cross-user resource access, CSRF/origin rejection, secure cookies,
upload restrictions, private file download, signed URL expiry, rich text XSS
payloads, rate limits, account deletion, export exclusions, and secret scan.

- [ ] **Step 3: Run responsive and PWA checks**

Test 400px mobile flow, desktop navigation, keyboard-only navigation, reduced
motion, light/dark themes, installability, service-worker update prompt, and
absence of authenticated data in public caches.

- [ ] **Step 4: Run backup/restore drill**

Restore PostgreSQL and private storage into a fresh Compose environment, run
migrations, reconcile pending BullMQ jobs, and verify login, dashboard, note,
attachment, reminder, export, and deletion behavior.

- [ ] **Step 5: Review the complete change set**

```bash
git status --short --branch
git diff main...HEAD --stat
git log --oneline --decorate -20
gh run list --limit 10
```

Review all implementation commits for secrets, accidental PRD changes,
unprotected routes, missing migrations, and undocumented environment variables.

- [ ] **Step 6: Commit only verified fixes**

```bash
git add -A -- app server worker tests drizzle scripts docker .github docs package.json package-lock.json Dockerfile docker-compose.yml
git commit -m "chore: verify MVP pilot readiness"
```

## Plan Self-Review Checklist

- Spec coverage: Tasks 1-3 cover runtime, migrations, catalog, and seeds.
- Spec coverage: Tasks 4-5 cover Better Auth, consent, sessions, CSRF, errors,
  request IDs, and ownership.
- Spec coverage: Tasks 6-8 cover UT onboarding, academic CRUD, dashboard,
  notes, rich text, search, and useful links.
- Spec coverage: Tasks 9-11 cover private files, calendar, BullMQ reminders,
  outbox, export, deletion, SMTP, and cleanup.
- Spec coverage: Tasks 12-13 cover PWA operations, CI, backups, legal docs,
  security tests, responsive verification, and release readiness.
- Styling coverage: Task 2 covers Tailwind CSS v4 Vite integration, Doze
  `@theme` tokens, class-based dark mode, semantic utilities, and responsive UI.
- No task depends on client-provided ownership identifiers.
- No task requires Supabase, billing, AI, or a separate API service.
- All later interfaces use the same names defined in earlier tasks.
- All test commands are declared in Task 1 before later tasks use them.
- Every implementation task ends with a verification command and commit.
- No verification task uses destructive cleanup against the active checkout.
