# Sakustudi MVP Core Design

Status: Approved for implementation planning
Date: 2026-08-14
Source: `prd-sakustudi.md`

## Summary

Sakustudi MVP Core is a self-hosted, mobile-first academic dashboard for
Universitas Terbuka students. It helps users manage semesters, courses,
activities, notes, private files, calendar events, and deadline reminders.

The application is a TypeScript modular monolith. React Router v7 Framework
Mode serves the web application and SSR through Node.js. PostgreSQL is the
system of record. BullMQ and Redis process reminders and email asynchronously.
The core has no billing, AI, admin dashboard, or direct UT integration.

## Product Goals

- Let a new user register and complete onboarding without support.
- Let users select a UT program and course catalog entries, or add custom
  courses when the catalog is incomplete.
- Make the active semester and upcoming deadlines visible immediately.
- Let users create and update activities, notes, links, calendar events, and
  private attachments.
- Send in-app reminders three days and one day before an activity deadline.
- Send reminder email when SMTP and email reminders are enabled.
- Keep user data private, exportable, and deletable.
- Run the core application through Docker Compose without a hosted platform.

## Non-Goals

- Billing, subscriptions, package limits, and Premium paywalls.
- AI summary, quiz, flashcard, and document question answering.
- Admin dashboard and live catalog management.
- Login with UT credentials or scraping UT systems.
- Native mobile applications.
- Tutor marketplace, collaboration, or social features.
- WhatsApp reminders.

## Product Decisions

| Area | Decision |
| --- | --- |
| Primary audience | UT students only for MVP |
| Course catalog | Versioned UT seed catalog plus user-created custom courses |
| Auth | Better Auth with email/password and database-backed sessions |
| Timezone | `Asia/Jakarta` display timezone; timestamps stored in UTC |
| Deadline without time | `23:59` in `Asia/Jakarta` |
| Reminder schedule | Three days and one day before, at 09:00 local time |
| Reminder email | Optional channel; SMTP required for auth verification and password reset |
| Notes editor | WYSIWYG rich text UI; sanitized HTML plus plain-text search field |
| Queue | BullMQ with Redis; PostgreSQL remains source of truth |
| Deployment | Docker Compose, with web, worker, PostgreSQL, and Redis services |
| API shape | No separate API service; React Router loaders/actions and server handlers |
| PWA | Installable app shell; offline mutations are out of scope |
| UI style | NeedMCP Doze productivity system, adapted for academic workflows |

## Architecture

```text
Browser
  |
  v
React Router v7 Framework Mode / Node.js
  |-- route loaders: authenticated reads
  |-- route actions: validated mutations
  |-- auth handler: Better Auth
  |-- domain services: ownership and business rules
  v
Drizzle ORM / PostgreSQL
  |-- application tables
  |-- Better Auth tables
  |-- outbox events
  |-- reminder records

Outbox publisher / worker
  |
  v
BullMQ / Redis
  |
  v
Reminder and email workers
  |-- PostgreSQL status updates
  |-- in-app reminder creation
  |-- optional SMTP delivery
  |-- storage cleanup
```

The web process never performs long-running email or reminder work. A
database transaction writes the domain change and its outbox event. A worker
publishes the event to BullMQ after commit. This avoids losing a job when a
database transaction succeeds but Redis is temporarily unavailable.

The browser never connects directly to PostgreSQL or Redis. All data access
passes through server-side loaders, actions, or handlers.

## Technology Choices

### Web

- React Router v7 Framework Mode.
- Vite build pipeline.
- TypeScript with strict checking.
- Node.js runtime and custom server deployment.
- Route loaders for reads and route actions for mutations.
- Server middleware for authentication context and request IDs.
- Schema validation at every action boundary.

React Router actions are server-side mutation handlers. Protected route
middleware redirects unauthenticated users before loaders execute. Ownership
checks remain in domain services and are never delegated to the client.

### Database

- PostgreSQL.
- Drizzle ORM and Drizzle Kit.
- Versioned SQL migrations committed to the repository.
- Custom SQL migrations for partial indexes, check constraints, and seed data
  when ORM generation is insufficient.
- Connection pools for web and worker processes with explicit pool budgets.

Production deployments apply committed migrations. They do not use an
unreviewed schema push command.

### Authentication

Better Auth uses its PostgreSQL Drizzle adapter. Its generated tables are
managed through Drizzle migrations:

- `user`
- `session`
- `account`
- `verification`

Required configuration and flows:

- Email/password sign-up and sign-in.
- Email verification.
- Password reset through SMTP.
- Session revocation.
- Fresh-session or re-authentication requirement for account deletion.
- Explicit `trustedOrigins`.
- Secure, HttpOnly, SameSite cookies in production.

Better Auth deletion removes auth records, sessions, and linked accounts. The
application must separately cascade user-owned domain rows and delete private
storage objects.

### Background Jobs

BullMQ is the queue implementation because it has a broad Node.js ecosystem,
delayed jobs, retries, exponential backoff, concurrency, deduplication,
stalled-job recovery, and production shutdown guidance.

Queue rules:

- Redis is persistent and mounted to a Docker volume.
- Queue payloads contain IDs and small metadata, never note contents or file
  contents.
- Job IDs are deterministic for reminder deduplication.
- Email tasks use three attempts with exponential backoff.
- Permanent errors are not retried.
- Workers close gracefully on SIGTERM and SIGINT.
- A reconciliation task re-enqueues pending outbox and reminder records after
  Redis or worker recovery.
- Bull Board may be enabled on a private, authenticated operations route.

### Storage

- Default: private local volume outside the public web root.
- Optional: S3-compatible object storage, including MinIO for local hosting.
- Object keys are generated IDs, not user-provided filenames.
- Downloads use an authorized server handler or short-lived signed URL.
- The database stores object key, original filename, size, MIME hint, checksum,
  owner, and parent relation.

### PWA

`vite-plugin-pwa` provides manifest and service-worker generation.

- Manifest includes app name, short name, description, theme color, and 192px
  and 512px icons.
- Static app shell assets are precached.
- Authenticated data responses are not placed in a public cache.
- No offline mutation or background sync is promised in MVP.
- Updates use a prompt flow so an active form is not unexpectedly reloaded.
- PWA installation and update behavior are tested in a production-like build.

### Testing

- Vitest for domain, service, loader, action, and integration tests.
- Playwright for browser workflows and responsive smoke tests.
- PostgreSQL and Redis containers are used for integration and end-to-end
  environments; SQLite is not used as a substitute.
- CI enables strict typecheck, lint, tests, coverage report, and production
  build.
- Playwright CI uses isolated tests, retries on CI, and trace capture on first
  retry.

## Domain Model

### Auth and Profile

`profiles` has a one-to-one relationship with Better Auth `user` and stores:

- display name;
- program study reference;
- timezone, defaulting to `Asia/Jakarta`;
- onboarding completion state;
- analytics consent state and timestamp;
- created and updated timestamps.

`legal_consents` records the document type, document version, accepted time,
and user reference for Terms of Service and Privacy Policy consent. Account
creation rejects missing consent, and authenticated access is blocked until
required consent records exist.

### UT Catalog

`study_programs` and `course_catalog` are global, versioned, read-only seed
data for users. Catalog rows include source version and active state. Updating
the seed does not mutate user-owned course records.

### Academic Data

- `academic_terms` belongs to a user and has name, start date, end date, and
  lifecycle state.
- At most one term per user can be active. Enforce this with a partial unique
  index.
- `courses` belongs to a user and term. `catalog_course_id` is nullable so a
  user can create a custom course.
- `activities` belongs to a user and course. It stores type, title, deadline,
  status, note text, link, and completion timestamp.
- Activity status values are `not_started`, `in_progress`, and `completed`.
- `overdue` is derived when the deadline is past and status is not completed.
- Course progress is completed activities divided by total activities. A
  course without activities has zero percent progress.

### Notes and Files

- `notes` belongs to a user and may reference a course.
- `notes.content_html` stores sanitized rich text.
- `notes.content_text` stores normalized text for search.
- `notes.tags` stores normalized user tags.
- `attachments` belongs to a user and references either one note or one
  activity. A database check constraint prevents an attachment with zero or
  multiple parents.

### Calendar and Links

- `calendar_events` stores user-created events.
- Activity deadlines are projected into the calendar and are not duplicated as
  mutable calendar rows.
- `useful_links` stores global UT defaults and user-owned links.

### Reminders and Reliability

- `reminders` stores user, activity, channel, scheduled time, status, read time,
  job ID, idempotency key, attempts, and delivery timestamps.
- `outbox_events` stores domain events awaiting BullMQ publication.
- `data_exports` stores export status, job ID, generated object key, and expiry.
- `audit_logs` stores security and lifecycle events without private content.
- `analytics_events` stores consent-aware product events without note, file, or
  password data.

Future-only tables such as `subscriptions`, `transactions`, `invoices`, and
`ai_usage` are not part of the MVP migration set.

## Database Rules

- Every user-owned table has a `user_id` foreign key and an index on it.
- Every foreign key used in joins or cascades has an index.
- Reminder lookup uses a composite index ordered by status and scheduled time.
- Reminder idempotency keys are unique.
- Outbox event keys are unique where publication must be deduplicated.
- Foreign keys use deliberate `ON DELETE` behavior.
- Check constraints protect enum-like status values and attachment ownership.
- Transactions remain short and never hold database locks across SMTP, Redis,
  or storage network calls.
- All user-scoped queries receive the authenticated user ID from server context.
- The browser has no direct database access, so ownership enforcement lives in
  the server repository/domain layer. Direct database access would require a
  separate RLS design before being enabled.

## User Flows

### Registration

1. User opens landing page.
2. User submits email, password, and mandatory ToS/Privacy consent.
3. Better Auth creates account and sends verification email.
4. Verified user enters onboarding.

### Onboarding

1. Select UT study program.
2. Select or create active semester.
3. Select courses from the seeded catalog.
4. Add custom courses when needed.
5. Complete checklist and create first value through the first activity.
6. Redirect to dashboard.

### Activity

1. Choose task or discussion.
2. Choose course.
3. Enter title and deadline.
4. Optionally add link, note, or attachment.
5. Submit through a route action.
6. Write activity, reminders, and outbox event in one transaction.
7. Revalidate dashboard and calendar loaders.

### Notes and Attachments

1. Open notes from a course or notes list.
2. Edit rich text through a familiar toolbar.
3. Server sanitizes HTML and creates searchable plain text.
4. Upload validates ownership, size, extension, MIME hint, and file signature.
5. File metadata is stored only after the private object is accepted.

For MVP, uploads stream through an authorized server handler. Direct browser
uploads using presigned PUT URLs remain a later optimization.

### Account Deletion

1. User opens privacy settings.
2. App requires a fresh session or re-authentication.
3. App marks deletion workflow and blocks new writes.
4. Domain rows are deleted with controlled cascades.
5. Private objects are deleted by the worker with retry.
6. Better Auth deletes auth user, sessions, and linked accounts.
7. Only a non-personal audit event remains.

### Data Export

1. User requests an export from privacy settings.
2. The action creates a `data_exports` row and outbox event.
3. BullMQ worker generates a ZIP containing user-owned JSON data and private
   attachments.
4. The result is stored privately with a short expiry and exposed through an
   authorized download.
5. The export excludes passwords, sessions, auth tokens, and internal security
   logs.

## Route Scope

### Public Routes

- `/`
- `/register`
- `/login`
- `/forgot-password`
- `/reset-password/:token`
- `/legal/privacy`
- `/legal/terms`

### Authenticated Routes

- `/onboarding`
- `/dashboard`
- `/academic-terms`
- `/academic-terms/:termId`
- `/courses/:courseId`
- `/activities`
- `/activities/new`
- `/activities/:activityId`
- `/activities/:activityId/edit`
- `/calendar`
- `/notes`
- `/notes/new`
- `/notes/:noteId`
- `/settings/profile`
- `/settings/reminders`
- `/settings/privacy`

Billing, AI, admin, and support routes do not exist in the MVP route tree.

## UI and Accessibility Direction

NeedMCP style `Doze` is the visual foundation. It is adapted from a task
management theme to academic workflows rather than copied literally.

### Tokens

- Primary amber: `#ffce54`.
- Success: `#cbe273`.
- Danger: `#ff6b6b`.
- Info: `#60a5fa`.
- Light canvas: `#fafafa` with white cards.
- Dark canvas: `#151515` with `#2a2c2e` cards.
- Body and display type: Geist.
- Code and file metadata: Geist Mono.
- Input radius: 4px.
- Button radius: 8px.
- Card and modal radius: 12px.
- Primary spacing units: 4, 8, 12, 16, 24, and 32px.

### Responsive Layout

- Mobile baseline uses 24px gutters and a fixed bottom navigation bar.
- Mobile navigation has explicit accessible labels for icon-only controls.
- Desktop uses a sidebar or full navigation bar and a centered content column.
- Activity cards use status badges and text labels, never color alone.
- Mobile controls have a minimum 44px interactive hit area, even when the
  visual token is smaller.
- Empty, loading, success, error, and disabled states are designed for each
  primary flow.

### Accessibility

- All form controls have visible labels.
- Keyboard focus uses the Doze focus-ring token.
- All actions work without pointer-only interactions.
- Status uses text, icon, and color together.
- Dialogs trap focus and return focus to their trigger.
- Reduced-motion preference disables nonessential transitions.
- Contrast is checked for both light and dark themes.

## Security and Privacy

### Auth and Request Protection

- Keep Better Auth `trustedOrigins` explicit.
- Do not disable Better Auth origin or CSRF checks in production.
- Use secure, HttpOnly, SameSite cookies.
- Add CSRF or origin protection to application mutations, not only auth
  endpoints.
- Apply rate limits to auth, upload, account deletion, and recovery routes.
- Do not accept a client-provided user ID as an authorization source.

### File Protection

- Allowlist business-required extensions.
- Treat the MIME header as untrusted.
- Validate file signatures when possible.
- Generate storage filenames server-side.
- Enforce per-file and per-user limits.
- Store outside the web root or in a private bucket.
- Generate signed URLs only after an ownership check.
- Keep signed URLs short-lived.
- Never put private file data in logs or queue payloads.

### Rich Text Protection

- Sanitize rich text on the server.
- Allow only required tags and attributes.
- Reject scripts, event handlers, unsafe URL schemes, and arbitrary iframes.
- Render only sanitized HTML.

## Error Handling

Application errors use stable codes:

- `VALIDATION_FAILED`
- `UNAUTHENTICATED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `LIMIT_EXCEEDED`
- `RATE_LIMITED`
- `DEPENDENCY_UNAVAILABLE`

Rules:

- Field validation returns field-level messages.
- Unauthenticated requests redirect to login or return 401 for handlers.
- Ownership failures return a generic 404 or 403 without data leakage.
- Conflicts return a retry or refresh instruction.
- Dependency failures expose a safe message and log the request ID.
- Unexpected errors return a generic message and structured server logs.
- Logs include request ID, route, error code, and duration, never secrets or
  private note/file content.

## Testing Strategy

### Unit Tests

- Activity status transitions.
- Overdue derivation.
- Course progress calculation.
- Reminder schedule in `Asia/Jakarta`.
- Deadline changes and reminder rescheduling.
- Permission and domain error mapping.
- Rich text sanitization policy.

### Integration Tests

- Better Auth database adapter and session behavior.
- User ownership on every domain repository.
- Migration application against PostgreSQL.
- Partial unique active-term constraint.
- Outbox publication and BullMQ job creation.
- Retry and reconciliation behavior.
- Private storage authorization and cleanup.
- Account deletion across database and storage.

### End-to-End Tests

- Registration and verification test path.
- Onboarding with catalog and custom course.
- Activity creation and dashboard revalidation.
- Note editing, search, and attachment upload.
- Mobile dashboard and bottom navigation.
- Reminder status and worker-backed delivery using a test mail transport.
- Delete account workflow.

### CI Gates

- Typecheck.
- Lint.
- Unit and integration tests.
- Coverage report.
- Production build.
- Playwright smoke suite on Chromium and mobile viewport.
- Dependency and secret checks.
- Docker image build.

## Operations and Self-Hosting

Docker Compose services:

- `web`: React Router Node server.
- `worker`: BullMQ worker and outbox reconciliation.
- `postgres`: PostgreSQL data store.
- `redis`: BullMQ queue store with persistent volume.
- `minio`: optional S3-compatible storage profile.
- `migrate`: one-shot migration profile completed before `web` and `worker`.

Deployment rules:

- Use `.env.example` with example values and no secrets.
- Run the one-shot migration command before serving traffic.
- Fail startup when required auth/database secrets are missing.
- Health checks cover web, PostgreSQL, Redis, and worker readiness.
- Redis uses persistence because delayed jobs must survive restart.
- PostgreSQL and private storage have scheduled backups.
- Restore is tested in a separate environment.
- Worker handles SIGTERM and completes or safely releases active jobs.
- Lock package versions in the repository lockfile.

Repository documentation must include:

- README quickstart.
- Docker Compose self-host setup.
- Configuration reference.
- Migration and seed commands.
- SMTP setup.
- Storage setup and private-file warnings.
- Backup and restore procedure.
- LICENSE.
- CONTRIBUTING.
- CODE_OF_CONDUCT.
- SECURITY policy.
- Privacy Policy and Terms of Service pages.
- UT affiliation disclaimer and no-scraping policy.

## Acceptance Criteria

The MVP is ready for a pilot when:

- A new user can complete signup and onboarding without manual database work.
- A user can create an active semester, catalog course, custom course, activity,
  note, event, and private attachment.
- Dashboard and calendar show correct deadlines, status, and progress.
- Reminder schedules are correct for `Asia/Jakarta` and remain idempotent after
  deadline edits or worker restarts.
- SMTP absence does not break in-app reminders; SMTP presence supports auth
  verification, password reset, and optional reminder email.
- Cross-user access tests fail safely.
- Account deletion removes application data and private files.
- Data export produces user-owned JSON and attachment data without auth secrets.
- Docker Compose can start the application from a clean checkout using the
  documented environment file.
- CI passes typecheck, lint, tests, build, security checks, and smoke E2E.
- Backup restore procedure succeeds on a fresh environment.
- Mobile workflow works at 400px-wide viewport without horizontal overflow.

## Documentation Evidence

- React Router Framework Mode, actions, middleware, and testing:
  `https://reactrouter.com/start/modes`
  `https://reactrouter.com/start/framework/actions`
  `https://reactrouter.com/how-to/middleware`
  `https://reactrouter.com/start/framework/testing`
- Drizzle PostgreSQL migrations and transactions:
  `https://orm.drizzle.team/docs/migrations`
  `https://orm.drizzle.team/docs/transactions`
- Better Auth Drizzle adapter, email/password, sessions, and deletion:
  `https://www.better-auth.com/docs/adapters/drizzle`
  `https://www.better-auth.com/docs/authentication/email-password`
  `https://www.better-auth.com/docs/concepts/session-management`
  `https://www.better-auth.com/docs/concepts/users-accounts`
- BullMQ retries, delayed jobs, workers, and production operation:
  `https://docs.bullmq.io`
  `https://docs.bullmq.io/guide/going-to-production`
- Vitest TypeScript and coverage:
  `https://vitest.dev/guide/`
- Playwright isolation, CI retries, traces, and projects:
  `https://playwright.dev/docs/best-practices`
- Vite PWA manifest, service worker, and update flow:
  `https://vite-pwa-org.netlify.app/guide/`
- PostgreSQL queue locking, constraints, indexes, and transactions:
  `https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE`
  `https://www.postgresql.org/docs/current/ddl-constraints.html`
  `https://www.postgresql.org/docs/current/indexes-multicolumn.html`
- S3 presigned URL behavior:
  `https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html`
- OWASP file upload controls:
  `https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html`
