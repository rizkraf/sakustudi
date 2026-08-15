# Sakustudi Analytics Event Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catat 10 event produk anonim server-side ke tabel `analytics_events` yang sudah ada, sediakan `npm run analytics:funnel` untuk melaporkan funnel pilot, dan update privacy policy + consent versioning.

**Architecture:** Module baru `app/modules/analytics/` (events constants, repository insert, service `trackEvent` best-effort) dipanggil dari route actions dan domain services setelah mutasi sukses. Insert selalu di luar transaction domain; kegagalan hanya `console.warn`, tidak pernah menggagalkan request. Query funnel (`getFunnelSnapshot`) dipisah ke module agar bisa diuji integration, script CLI hanya memformat output. Konsentasi versi: privacy policy versi baru men-trigger re-consent lewat mekanisme `getMissingConsents` yang diperluas.

**Tech Stack:** TypeScript, Drizzle ORM (`getDb` dari `~/lib/db/client`), PostgreSQL (`analytics_events` sudah ada di migration 0000), `date-fns-tz` (sudah dependency) untuk boundary hari Asia/Jakarta, `tsx` untuk script CLI.

## Global Constraints

- Tidak ada migration baru; tabel `analytics_events` sudah ada (`app/lib/db/schema/app.ts:551`).
- Event tidak boleh mengandung PII: deny list key = `email`, `content`, `title`, `name`, `url`, `path`, `token`, `ip`, `password`.
- Insert analytics selalu di luar transaction domain; `trackEvent` tidak pernah throw ke pemanggil.
- Jalankan perintah dari repository root. Verifikasi: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`.
- Integration test butuh PostgreSQL berjalan (`docker compose -f docker-compose.dev.yml up -d postgres`).
- Tidak ada dependency baru.
- Kode mengikuti gaya repo: JSDoc singkat pada fungsi exported, nama fungsi deskriptif.

---

### Task 1: Module analytics — events, repository, service `trackEvent`

**Files:**
- Create: `app/modules/analytics/analytics.events.ts`
- Create: `app/modules/analytics/analytics.repository.ts`
- Create: `app/modules/analytics/analytics.service.ts`
- Test: `tests/unit/analytics-events.test.ts`

**Interfaces:**
- Produces:
  - `export const ANALYTICS_EVENTS: readonly AnalyticsEventName[]` (10 nama event)
  - `export type AnalyticsEventName`
  - `export const FORBIDDEN_PROPERTY_KEYS: readonly string[]`
  - `export function assertValidEvent(eventName: string, properties: Record<string, unknown>): void` — throw `Error` jika nama tak dikenal atau key property ada di deny list.
  - `export async function insertAnalyticsEvent(userId: string, eventName: string, properties: Record<string, unknown>): Promise<void>` — insert tunggal via `getDb()`.
  - `export async function trackEvent(userId: string, eventName: string, properties?: Record<string, unknown>): Promise<void>` — best-effort: validasi + insert dalam try/catch; gagal → `console.warn`, tidak throw.
- Consumes: `getDb` (`~/lib/db/client`), `analyticsEvents` (`~/lib/db/schema`).

- [ ] **Step 1: Tulis test gagal dulu**

`tests/unit/analytics-events.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { assertValidEvent, FORBIDDEN_PROPERTY_KEYS } from "~/modules/analytics/analytics.events";
import { trackEvent } from "~/modules/analytics/analytics.service";
import { insertAnalyticsEvent } from "~/modules/analytics/analytics.repository";

vi.mock("~/modules/analytics/analytics.repository", () => ({
  insertAnalyticsEvent: vi.fn(),
}));

const mockedInsert = vi.mocked(insertAnalyticsEvent);

afterEach(() => {
  vi.clearAllMocks();
});

describe("assertValidEvent", () => {
  it("accepts a known event name with safe properties", () => {
    expect(() =>
      assertValidEvent("activity_created", { type: "assignment" }),
    ).not.toThrow();
  });

  it("rejects an unknown event name", () => {
    expect(() => assertValidEvent("mystery_event", {})).toThrow(/unknown/i);
  });

  it("rejects a forbidden property key", () => {
    expect(() =>
      assertValidEvent("signup_completed", { email: "a@b.test" }),
    ).toThrow(/forbidden/i);
  });

  it("deny list covers PII keys", () => {
    for (const key of ["email", "content", "title", "name", "url", "path", "token", "ip", "password"]) {
      expect(FORBIDDEN_PROPERTY_KEYS).toContain(key);
    }
  });
});

describe("trackEvent", () => {
  it("inserts a valid event", async () => {
    mockedInsert.mockResolvedValue(undefined);
    await trackEvent("user-1", "note_created", {});
    expect(mockedInsert).toHaveBeenCalledWith("user-1", "note_created", {});
  });

  it("does not throw when the insert fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockedInsert.mockRejectedValue(new Error("db down"));
    await expect(trackEvent("user-1", "note_created")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not insert an invalid event name", async () => {
    await trackEvent("user-1", "bogus");
    expect(mockedInsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run --project unit tests/unit/analytics-events.test.ts`
Expected: FAIL — module `~/modules/analytics/...` tidak ada.

- [ ] **Step 3: Buat `analytics.events.ts`**

```ts
/**
 * Product events recorded anonymously for pilot funnel metrics. Names are
 * validated server-side; never attach PII to properties.
 */
export const ANALYTICS_EVENTS = [
  "signup_completed",
  "onboarding_started",
  "onboarding_completed",
  "course_created",
  "activity_created",
  "activity_completed",
  "note_created",
  "file_uploaded",
  "reminder_created",
  "export_requested",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const FORBIDDEN_PROPERTY_KEYS = [
  "email",
  "content",
  "title",
  "name",
  "url",
  "path",
  "token",
  "ip",
  "password",
] as const;

export function assertValidEvent(
  eventName: string,
  properties: Record<string, unknown>,
): void {
  if (!ANALYTICS_EVENTS.includes(eventName as AnalyticsEventName)) {
    throw new Error(`analytics: unknown event "${eventName}"`);
  }
  for (const key of Object.keys(properties)) {
    if (FORBIDDEN_PROPERTY_KEYS.includes(key as (typeof FORBIDDEN_PROPERTY_KEYS)[number])) {
      throw new Error(`analytics: forbidden property key "${key}"`);
    }
  }
}
```

- [ ] **Step 4: Buat `analytics.repository.ts`**

```ts
import { getDb } from "~/lib/db/client";
import { analyticsEvents } from "~/lib/db/schema";

export async function insertAnalyticsEvent(
  userId: string,
  eventName: string,
  properties: Record<string, unknown>,
): Promise<void> {
  await getDb().insert(analyticsEvents).values({
    userId,
    eventName,
    properties,
  });
}
```

- [ ] **Step 5: Buat `analytics.service.ts`**

```ts
import { assertValidEvent } from "./analytics.events";
import { insertAnalyticsEvent } from "./analytics.repository";

/**
 * Best-effort analytics write: validates the event, inserts the row, and
 * swallows failures with a warning. Analytics must never affect the result
 * of the calling mutation.
 */
export async function trackEvent(
  userId: string,
  eventName: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  try {
    assertValidEvent(eventName, properties);
    await insertAnalyticsEvent(userId, eventName, properties);
  } catch (error) {
    console.warn(`analytics: event "${eventName}" dropped`, error);
  }
}
```

- [ ] **Step 6: Jalankan test, pastikan pass**

Run: `npx vitest run --project unit tests/unit/analytics-events.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add app/modules/analytics tests/unit/analytics-events.test.ts
git commit -m "feat: add analytics event module with best-effort tracking"
```

---

### Task 2: Funnel query module `getFunnelSnapshot` + integration test

**Files:**
- Create: `app/modules/analytics/funnel.ts`
- Test: `tests/integration/analytics.integration.test.ts` (bagian funnel)

**Interfaces:**
- Produces:
  - `export const FUNNEL_TIME_ZONE = "Asia/Jakarta"`
  - `export type FunnelSnapshot = { date: string; signupCompleted: number; onboardingStarted: number; onboardingCompleted: number; courseCreated: number; activityCreated: number; returnedNextDay: number; returnedWithin7d: number }`
  - `export async function getFunnelSnapshot(date: string, timeZone?: string): Promise<FunnelSnapshot>` — `date` format `YYYY-MM-DD` (hari kalender di `timeZone`); hitung boundary UTC via `fromZonedTime` dari `date-fns-tz`.
- Consumes: `insertAnalyticsEvent` (Task 1), `getDb`, `analyticsEvents`, `countDistinct`/`gte`/`lt`/`eq` dari drizzle-orm.

- [ ] **Step 1: Tulis test gagal dulu**

`tests/integration/analytics.integration.test.ts` (buat file baru; `createdUserIds` + `createUser` ikuti pola `tests/integration/notes.integration.test.ts:30-46`):

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { closeDb, getDb } from "~/lib/db/client";
import { analyticsEvents, user } from "~/lib/db/schema";
import { insertAnalyticsEvent } from "~/modules/analytics/analytics.repository";
import { getFunnelSnapshot } from "~/modules/analytics/funnel";

const db = getDb();
const createdUserIds: string[] = [];

function newUserId(): string {
  const id = crypto.randomUUID();
  createdUserIds.push(id);
  return id;
}

async function createUser(id: string): Promise<void> {
  await db.insert(user).values({
    id,
    name: "Analytics Integration User",
    email: `${id}@analytics-int.test`,
    emailVerified: true,
  });
}

async function event(userId: string, name: string, at: Date): Promise<void> {
  await insertAnalyticsEvent(userId, name, {});
  await db
    .update(analyticsEvents)
    .set({ occurredAt: at })
    .where(eq(analyticsEvents.userId, userId));
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(user).where(eq(user.id, id)).catch(() => undefined);
  }
  await closeDb();
});

describe("getFunnelSnapshot", () => {
  it("counts same-day events and cohort returns for the given date", async () => {
    const a = newUserId();
    const b = newUserId();
    const c = newUserId();
    await createUser(a);
    await createUser(b);
    await createUser(c);

    const day = new Date("2026-08-01T00:00:00Z");
    await event(a, "signup_completed", day);
    await event(a, "onboarding_started", day);
    await event(a, "onboarding_completed", day);
    await event(a, "course_created", day);
    await event(a, "activity_created", day);
    await event(b, "signup_completed", day);
    await event(c, "signup_completed", day);

    // a kembali besoknya; c kembali di hari ke-3 (masuk 7 hari); b tidak pernah.
    await event(a, "activity_completed", new Date("2026-08-02T02:00:00Z"));
    await event(c, "note_created", new Date("2026-08-04T02:00:00Z"));

    const snapshot = await getFunnelSnapshot("2026-08-01");
    expect(snapshot.signupCompleted).toBe(3);
    expect(snapshot.onboardingStarted).toBe(1);
    expect(snapshot.onboardingCompleted).toBe(1);
    expect(snapshot.courseCreated).toBe(1);
    expect(snapshot.activityCreated).toBe(1);
    expect(snapshot.returnedNextDay).toBe(1);
    expect(snapshot.returnedWithin7d).toBe(2);
  });

  it("returns zeros for a date without events", async () => {
    const snapshot = await getFunnelSnapshot("2020-01-01");
    expect(snapshot).toEqual({
      date: "2020-01-01",
      signupCompleted: 0,
      onboardingStarted: 0,
      onboardingCompleted: 0,
      courseCreated: 0,
      activityCreated: 0,
      returnedNextDay: 0,
      returnedWithin7d: 0,
    });
  });
});
```

Catatan: `occurred_at` boundary test memakai UTC langsung (Asia/Jakarta = UTC+7, jadi `2026-08-02T02:00:00Z` = `2026-08-02 09:00 WIB` — masih hari berikutnya di Jakarta, aman untuk test ini). Hari `2026-08-01T00:00:00Z` = `2026-08-01 07:00 WIB`.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run --project integration tests/integration/analytics.integration.test.ts`
Expected: FAIL — `funnel.ts` belum ada.

- [ ] **Step 3: Buat `app/modules/analytics/funnel.ts`**

```ts
import { and, countDistinct, eq, gte, lt } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";

import { getDb } from "~/lib/db/client";
import { analyticsEvents } from "~/lib/db/schema";

export const FUNNEL_TIME_ZONE = "Asia/Jakarta";

export type FunnelSnapshot = {
  date: string;
  signupCompleted: number;
  onboardingStarted: number;
  onboardingCompleted: number;
  courseCreated: number;
  activityCreated: number;
  returnedNextDay: number;
  returnedWithin7d: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayBounds(date: string, timeZone: string): { start: Date; end: Date } {
  const start = fromZonedTime(`${date}T00:00:00`, timeZone);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

async function countUsersWithEvent(
  eventName: string,
  start: Date,
  end: Date,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: countDistinct(analyticsEvents.userId) })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.eventName, eventName),
        gte(analyticsEvents.occurredAt, start),
        lt(analyticsEvents.occurredAt, end),
      ),
    );
  return Number(row?.value ?? 0);
}

async function signupCohort(start: Date, end: Date): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ userId: analyticsEvents.userId })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.eventName, "signup_completed"),
        gte(analyticsEvents.occurredAt, start),
        lt(analyticsEvents.occurredAt, end),
      ),
    );
  return new Set(rows.map((row) => row.userId).filter((id): id is string => id !== null));
}

async function activeUsersBetween(start: Date, end: Date): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ userId: analyticsEvents.userId })
    .from(analyticsEvents)
    .where(
      and(
        gte(analyticsEvents.occurredAt, start),
        lt(analyticsEvents.occurredAt, end),
      ),
    );
  return new Set(rows.map((row) => row.userId).filter((id): id is string => id !== null));
}

export async function getFunnelSnapshot(
  date: string,
  timeZone: string = FUNNEL_TIME_ZONE,
): Promise<FunnelSnapshot> {
  const { start, end } = dayBounds(date, timeZone);
  const nextStart = new Date(end.getTime());
  const nextEnd = new Date(nextStart.getTime() + DAY_MS);
  const sevenDayEnd = new Date(start.getTime() + 8 * DAY_MS);

  const cohort = await signupCohort(start, end);
  const nextDayUsers = await activeUsersBetween(nextStart, nextEnd);
  const weekUsers = await activeUsersBetween(end, sevenDayEnd);

  return {
    date,
    signupCompleted: await countUsersWithEvent("signup_completed", start, end),
    onboardingStarted: await countUsersWithEvent("onboarding_started", start, end),
    onboardingCompleted: await countUsersWithEvent("onboarding_completed", start, end),
    courseCreated: await countUsersWithEvent("course_created", start, end),
    activityCreated: await countUsersWithEvent("activity_created", start, end),
    returnedNextDay: [...cohort].filter((id) => nextDayUsers.has(id)).length,
    returnedWithin7d: [...cohort].filter((id) => weekUsers.has(id)).length,
  };
}
```

- [ ] **Step 4: Jalankan test, pastikan pass**

Run: `npx vitest run --project integration tests/integration/analytics.integration.test.ts`
Expected: PASS (2 tests). Jika fixture `returnedWithin7d` salah, cek math: `weekUsers` window `[end, start+8d)` mencakup D+1..D+7 di Jakarta; `2026-08-04T02:00:00Z` = D+3 WIB → termasuk.

- [ ] **Step 5: Commit**

```bash
git add app/modules/analytics/funnel.ts tests/integration/analytics.integration.test.ts
git commit -m "feat: add funnel snapshot query for pilot analytics"
```

---

### Task 3: Wire 10 event ke route actions dan domain services

**Files:**
- Modify: `app/routes/register.tsx:54`
- Modify: `app/routes/onboarding.tsx:170-191`
- Modify: `app/modules/onboarding/onboarding.service.ts:34-49`
- Modify: `app/modules/catalog/catalog.service.ts:75,110`
- Modify: `app/modules/activities/activities.service.ts:87-116,238-292`
- Modify: `app/modules/notes/notes.service.ts:56-63`
- Modify: `app/modules/files/files.service.ts:71-84`
- Modify: `app/modules/exports/export.service.ts:79-87`

**Interfaces:**
- Consumes: `trackEvent` dari `~/modules/analytics/analytics.service`.
- Produces: 10 event dengan properties: `course_created` `{ source: "catalog" | "custom" }`; `activity_created`/`activity_completed` `{ type }`; `file_uploaded` `{ mimeType }`; `reminder_created` `{ channels: string[] }`; `export_requested` `{ exportType: "all" }`; sisanya `{}`.

- [ ] **Step 1: `signup_completed` — `app/routes/register.tsx`**

Setelah `await recordRequiredConsents(result.user.id, consent.data);` (baris 54), tambahkan:

```ts
    await trackEvent(result.user.id, "signup_completed");
```

Tambah import: `import { trackEvent } from "~/modules/analytics/analytics.service";`

- [ ] **Step 2: `onboarding_started` — `app/routes/onboarding.tsx`**

Di branch `if (intent === "program")` (setelah validasi program valid, sebelum `throw redirect(...)` di baris 188), tambahkan:

```ts
      await trackEvent(user.id, "onboarding_started");
```

Tambah import: `import { trackEvent } from "~/modules/analytics/analytics.service";`

- [ ] **Step 3: `onboarding_completed` — `app/modules/onboarding/onboarding.service.ts`**

Di akhir `completeOnboarding` (setelah `onConflictDoUpdate`), tambahkan:

```ts
  await trackEvent(userId, "onboarding_completed");
```

Tambah import: `import { trackEvent } from "~/modules/analytics/analytics.service";`

- [ ] **Step 4: `course_created` — `app/modules/catalog/catalog.service.ts`**

Di `createCourseFromCatalog`, ganti `return row;` (baris 75) menjadi:

```ts
  await trackEvent(userId, "course_created", { source: "catalog" });
  return row;
```

Di `createCustomCourse`, ganti `return row;` (baris 110) menjadi:

```ts
  await trackEvent(userId, "course_created", { source: "custom" });
  return row;
```

Tambah import: `import { trackEvent } from "~/modules/analytics/analytics.service";`

- [ ] **Step 5: `activity_created` + `reminder_created` — `app/modules/activities/activities.service.ts`**

Di `createActivity`, ubah pemanggilan schedule untuk menangkap hasil, lalu emit setelah transaction selesai. Ganti block transaction (baris 87-115):

```ts
  const db = getDb();
  let activity: Activity;
  let reminderChannels: string[] = [];
  await db.transaction(async (tx) => {
    activity = await insertActivity(
      userId,
      {
        courseId: course.id,
        termId: course.termId,
        title: parsed.data.title,
        type: parsed.data.type,
        dueDate: parseDeadlineInput(parsed.data.deadline),
        details: parsed.data.details ?? null,
        link: parsed.data.link ?? null,
      },
      tx,
    );
    const emailEnabled = await getReminderEmailEnabled(tx, userId);
    const reminders = await createReminderScheduleInTx(
      tx,
      userId,
      toScheduleActivity(activity),
      emailEnabled,
    );
    reminderChannels = [...new Set(reminders.map((r) => r.channel))];
    await insertOutboxEvent(tx, {
      userId,
      eventType: "activity.created",
      eventKey: `activity.created:${activity.id}:${crypto.randomUUID()}`,
      payload: { activityId: activity.id },
    });
  });

  await trackEvent(userId, "activity_created", { type: activity!.type });
  if (reminderChannels.length > 0) {
    await trackEvent(userId, "reminder_created", { channels: reminderChannels });
  }
  return activity!;
```

Tambah import: `import { trackEvent } from "~/modules/analytics/analytics.service";`

- [ ] **Step 6: `activity_completed` — `app/modules/activities/activities.service.ts`**

Di `setActivityStatus`, refactor agar emit terjadi setelah transaction selesai, bukan di dalamnya. Struktur akhir function:

```ts
  let completedNow = false;
  let completedType: string | null = null;
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    // ... lock, transition check, save (kode yang sudah ada, tidak diubah) ...
    if (status === "completed") {
      completedNow = true;
      completedType = saved.type;
      await cancelReminderScheduleInTx(tx, activityId);
      await insertOutboxEvent(tx, {
        userId,
        eventType: "activity.completed",
        eventKey: `activity.completed:${activityId}:${crypto.randomUUID()}`,
        payload: { activityId },
      });
    } else if (row.status === "completed") {
      // ... path reopen yang sudah ada ...
    }
    return saved;
  });
  if (completedNow) {
    await trackEvent(userId, "activity_completed", { type: completedType ?? "other" });
  }
  return result;
```

Perubahan spesifik: (1) tambah `let completedNow = false;` dan `let completedType: string | null = null;` sebelum `const db = getDb();`; (2) di dalam branch `if (status === "completed")`, set kedua flag tersebut; (3) `return db.transaction(...)` diubah menjadi `const result = await db.transaction(...)`; (4) emit `trackEvent` setelah transaction, lalu `return result;`.

- [ ] **Step 7: `note_created` — `app/modules/notes/notes.service.ts`**

Ganti akhir `createNote` (baris 56-63) menjadi:

```ts
  const content = sanitizeNoteHtml(parsed.data.contentHtml ?? "");
  const note = await insertNote(userId, {
    courseId,
    termId,
    title: parsed.data.title,
    content,
    contentText: extractPlainText(content),
    tags: parsed.data.tags ?? [],
  });
  await trackEvent(userId, "note_created");
  return note;
```

Tambah import: `import { trackEvent } from "~/modules/analytics/analytics.service";`

- [ ] **Step 8: `file_uploaded` — `app/modules/files/files.service.ts`**

Ganti block try/catch di `createAttachment` (baris 71-84) menjadi:

```ts
  try {
    const row = await insertAttachment(userId, parent, {
      filename: validated.filename,
      storageKey: stored.key,
      mimeType: validated.mimeType,
      sizeBytes: stored.size,
      checksum: stored.checksum,
    });
    await trackEvent(userId, "file_uploaded", { mimeType: validated.mimeType });
    return row;
  } catch (error) {
    // The object landed but the metadata write failed: remove the object so
    // nothing is left without a row (best effort; delete is idempotent).
    await storage.delete(stored.key).catch(() => undefined);
    throw error;
  }
```

Tambah import: `import { trackEvent } from "~/modules/analytics/analytics.service";`

- [ ] **Step 9: `export_requested` — `app/modules/exports/export.service.ts`**

Setelah block `enqueueOutboxEvent(...).catch(...)` (setelah baris 86), sebelum `return created;`, tambahkan:

```ts
  await trackEvent(userId, "export_requested", { exportType: "all" });
```

Tambah import: `import { trackEvent } from "~/modules/analytics/analytics.service";`

- [ ] **Step 10: Verifikasi**

Run: `npm run typecheck && npm run lint`
Expected: PASS tanpa error.

Run: `npm test`
Expected: PASS (unit suite; integration service test lama tetap hijau).

Run: `npm run test:integration`
Expected: PASS — khususnya `activities.integration.test.ts`, `notes.integration.test.ts`, `files.integration.test.ts`, `queue.integration.test.ts` (insert analytics tidak boleh mengganggu asersi outbox/reminder yang ada).

- [ ] **Step 11: Commit**

```bash
git add app/routes/register.tsx app/routes/onboarding.tsx app/modules/onboarding/onboarding.service.ts app/modules/catalog/catalog.service.ts app/modules/activities/activities.service.ts app/modules/notes/notes.service.ts app/modules/files/files.service.ts app/modules/exports/export.service.ts
git commit -m "feat: emit analytics events from domain mutations"
```

---

### Task 4: Consent version awareness + update privacy policy

**Files:**
- Modify: `app/modules/auth/consent.schema.ts`
- Modify: `app/modules/auth/consent.server.ts`
- Modify: `app/routes/legal.privacy.tsx`
- Modify: `docs/legal/privacy.md`
- Test: `tests/integration/consent.integration.test.ts` (file baru)

**Interfaces:**
- Produces:
  - `LEGAL_DOCUMENT_VERSIONS.privacy_policy` menjadi `"2026-08-15"`.
  - `getMissingConsents` mengembalikan type yang (a) tidak ada row-nya, atau (b) row dengan version != versi saat ini.
  - `recordRequiredConsents` mengganti row lama yang version-nya basi dengan row baru (delete + insert), selain insert type yang belum ada.
- Consumes: `legalConsents`, `LEGAL_CONSENT_TYPES`, `LEGAL_DOCUMENT_VERSIONS`, `getDb`.

- [ ] **Step 1: Tulis test gagal dulu**

`tests/integration/consent.integration.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { closeDb, getDb } from "~/lib/db/client";
import { legalConsents, user } from "~/lib/db/schema";
import {
  getMissingConsents,
  recordRequiredConsents,
} from "~/modules/auth/consent.server";
import { LEGAL_DOCUMENT_VERSIONS } from "~/modules/auth/consent.schema";

const db = getDb();
const createdUserIds: string[] = [];

function newUserId(): string {
  const id = crypto.randomUUID();
  createdUserIds.push(id);
  return id;
}

async function createUser(id: string): Promise<void> {
  await db.insert(user).values({
    id,
    name: "Consent Integration User",
    email: `${id}@consent-int.test`,
    emailVerified: true,
  });
}

async function insertConsent(userId: string, type: string, version: string): Promise<void> {
  await db.insert(legalConsents).values({
    userId,
    consentType: type,
    version,
    acceptedAt: new Date(),
  });
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(user).where(eq(user.id, id)).catch(() => undefined);
  }
  await closeDb();
});

describe("consent version awareness", () => {
  it("treats a stale privacy version as missing", async () => {
    const userId = newUserId();
    await createUser(userId);
    await insertConsent(userId, "terms_of_service", LEGAL_DOCUMENT_VERSIONS.terms_of_service);
    await insertConsent(userId, "privacy_policy", "2020-01-01");

    const missing = await getMissingConsents(userId);
    expect(missing).toEqual(["privacy_policy"]);
  });

  it("recordRequiredConsents replaces a stale version row", async () => {
    const userId = newUserId();
    await createUser(userId);
    await insertConsent(userId, "privacy_policy", "2020-01-01");

    await recordRequiredConsents(userId, {
      acceptTerms: true,
      acceptPrivacy: true,
    });

    const rows = await db
      .select()
      .from(legalConsents)
      .where(eq(legalConsents.userId, userId));
    expect(rows).toHaveLength(2);
    const privacy = rows.find((r) => r.consentType === "privacy_policy");
    expect(privacy?.version).toBe(LEGAL_DOCUMENT_VERSIONS.privacy_policy);
    expect(await getMissingConsents(userId)).toEqual([]);
  });

  it("keeps current-version rows untouched", async () => {
    const userId = newUserId();
    await createUser(userId);
    await insertConsent(userId, "terms_of_service", LEGAL_DOCUMENT_VERSIONS.terms_of_service);
    await insertConsent(userId, "privacy_policy", LEGAL_DOCUMENT_VERSIONS.privacy_policy);

    await recordRequiredConsents(userId, {
      acceptTerms: true,
      acceptPrivacy: true,
    });

    const rows = await db
      .select()
      .from(legalConsents)
      .where(eq(legalConsents.userId, userId));
    expect(rows).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run --project integration tests/integration/consent.integration.test.ts`
Expected: FAIL — `getMissingConsents` tidak membandingkan version.

- [ ] **Step 3: Update `consent.schema.ts`**

```ts
export const LEGAL_DOCUMENT_VERSIONS: Record<LegalConsentType, string> = {
  terms_of_service: "2026-08-01",
  privacy_policy: "2026-08-15",
};
```

- [ ] **Step 4: Update `consent.server.ts`**

`getMissingConsents` — pilih `version` juga dan bandingkan:

```ts
export async function getMissingConsents(userId: string): Promise<LegalConsentType[]> {
  const db = getDb();
  const existing = await db
    .select({ consentType: legalConsents.consentType, version: legalConsents.version })
    .from(legalConsents)
    .where(
      and(
        eq(legalConsents.userId, userId),
        inArray(legalConsents.consentType, LEGAL_CONSENT_TYPES),
      ),
    );

  const currentByType = new Map(
    existing.map((row) => [row.consentType, row.version]),
  );
  return LEGAL_CONSENT_TYPES.filter(
    (type) => currentByType.get(type) !== LEGAL_DOCUMENT_VERSIONS[type],
  );
}
```

`recordRequiredConsents` — hapus row yang version-nya basi sebelum insert:

```ts
export async function recordRequiredConsents(
  userId: string,
  input: SignUpConsentInput,
): Promise<void> {
  signUpConsentInputSchema.parse(input);

  const db = getDb();
  const existing = await db
    .select({ consentType: legalConsents.consentType, version: legalConsents.version })
    .from(legalConsents)
    .where(eq(legalConsents.userId, userId));

  const currentByType = new Map(
    existing.map((row) => [row.consentType, row.version]),
  );
  const staleTypes = LEGAL_CONSENT_TYPES.filter(
    (type) =>
      currentByType.has(type) && currentByType.get(type) !== LEGAL_DOCUMENT_VERSIONS[type],
  );
  if (staleTypes.length > 0) {
    await db
      .delete(legalConsents)
      .where(
        and(
          eq(legalConsents.userId, userId),
          inArray(legalConsents.consentType, staleTypes),
        ),
      );
  }

  const rows = LEGAL_CONSENT_TYPES.filter((type) => !currentByType.has(type)).map(
    (type) => ({
      userId,
      consentType: type,
      version: LEGAL_DOCUMENT_VERSIONS[type],
    }),
  );

  if (rows.length > 0) {
    await db.insert(legalConsents).values(rows);
  }
}
```

- [ ] **Step 5: Jalankan test, pastikan pass**

Run: `npx vitest run --project integration tests/integration/consent.integration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Update privacy policy — `app/routes/legal.privacy.tsx`**

Baca file dulu, lalu:
- Ubah tanggal "Last updated" menjadi `August 15, 2026`.
- Tambahkan bagian baru setelah bagian data yang dikumpulkan (sesuaikan penomoran section yang ada), misalnya:

```tsx
<section>
  <h2 className="font-semibold">X. Anonymous Product Metrics</h2>
  <p>
    We record anonymous product metrics such as account creation, onboarding
    completion, created courses, activities, notes, file uploads, reminders,
    and export requests. These metrics never include your email, note content,
    file names, or private data. Deleting your account anonymizes these
    records by removing your user association.
  </p>
</section>
```

- [ ] **Step 7: Update `docs/legal/privacy.md`**

Tambahkan paragraf yang sama (bahasa yang konsisten dengan dokumen) tentang anonymous product metrics + anonymisasi saat akun dihapus. Update tanggal versi dokumen.

- [ ] **Step 8: Verifikasi + commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

Run: `npx vitest run --project integration tests/integration/auth.integration.test.ts tests/integration/consent.integration.test.ts`
Expected: PASS.

```bash
git add app/modules/auth/consent.schema.ts app/modules/auth/consent.server.ts app/routes/legal.privacy.tsx docs/legal/privacy.md tests/integration/consent.integration.test.ts
git commit -m "feat: version-aware consent and privacy policy analytics disclosure"
```

---

### Task 5: Script CLI `analytics:funnel`

**Files:**
- Create: `scripts/analytics-funnel.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `getFunnelSnapshot`, `FUNNEL_TIME_ZONE` (Task 2), `closeDb` (`~/lib/db/client`).
- Produces: npm script `analytics:funnel`.

- [ ] **Step 1: Buat `scripts/analytics-funnel.ts`**

```ts
import { closeDb } from "../app/lib/db/client";
import {
  FUNNEL_TIME_ZONE,
  getFunnelSnapshot,
} from "../app/modules/analytics/funnel";

function todayInZone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date "${value}". Use YYYY-MM-DD.`);
  }
  return value;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, " ");
}

async function main(): Promise<void> {
  const date = parseDate(process.argv[2] ?? todayInZone(FUNNEL_TIME_ZONE));
  const snapshot = await getFunnelSnapshot(date, FUNNEL_TIME_ZONE);

  const rows: Array<[string, number]> = [
    ["signup_completed", snapshot.signupCompleted],
    ["onboarding_started", snapshot.onboardingStarted],
    ["onboarding_completed", snapshot.onboardingCompleted],
    ["course_created", snapshot.courseCreated],
    ["activity_created", snapshot.activityCreated],
    ["returned_next_day", snapshot.returnedNextDay],
    ["returned_within_7d", snapshot.returnedWithin7d],
  ];

  console.log(`Funnel ${snapshot.date} (${FUNNEL_TIME_ZONE})`);
  for (const [name, value] of rows) {
    if (value > 0) {
      console.log(`${name.padEnd(20)} ${pad(value, 4)}`);
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error("Analytics funnel failed:", error);
    process.exit(1);
  })
  .finally(() => closeDb());
```

- [ ] **Step 2: Tambah npm script — `package.json`**

Di dalam `"scripts"`, setelah `"db:seed"`, tambahkan:

```json
    "analytics:funnel": "tsx scripts/analytics-funnel.ts",
```

- [ ] **Step 3: Verifikasi**

Pastikan Postgres lokal berjalan, lalu:

Run: `npm run analytics:funnel 2026-08-01`
Expected: output tabel funnel (bisa kosong/0 jika belum ada data hari itu; script hanya mencetak baris > 0, dan header `Funnel 2026-08-01 (Asia/Jakarta)` selalu tampil). Proses exit 0.

Run: `npm run analytics:funnel not-a-date`
Expected: error `Invalid date "not-a-date". Use YYYY-MM-DD.`, exit code 1.

- [ ] **Step 4: Commit**

```bash
git add scripts/analytics-funnel.ts package.json
git commit -m "feat: add analytics funnel CLI script"
```

---

### Task 6: Dokumentasi + amend spec

**Files:**
- Create: `docs/operations/analytics.md`
- Modify: `docs/superpowers/specs/2026-08-15-sakustudi-analytics-tracking-design.md` (amend: property `reminder_created` menjadi `channels`)

- [ ] **Step 1: Buat `docs/operations/analytics.md`**

```markdown
# Analytics

Sakustudi mencatat event produk anonim untuk mengukur funnel pilot. Data
disimpan di tabel `analytics_events` (PostgreSQL, source of truth). Tidak ada
tool eksternal dan tidak ada tracking page view.

## Privasi

- Event tidak pernah berisi email, isi catatan, judul, nama, path file,
  token, IP, atau password.
- Tidak ada opt-in: metrik anonim dicatat untuk semua user (lihat Privacy
  Policy).
- Penghapusan akun menghilangkan asosiasi user pada event (FK
  `ON DELETE SET NULL`).
- Export data pengguna tidak menyertakan analytics events.

## Daftar event

| Event | Call site | Properties |
| --- | --- | --- |
| `signup_completed` | `register.tsx` action | — |
| `onboarding_started` | `onboarding.tsx` action (step program) | — |
| `onboarding_completed` | `completeOnboarding` | — |
| `course_created` | `createCourseFromCatalog` / `createCustomCourse` | `source: catalog \| custom` |
| `activity_created` | `createActivity` | `type` |
| `activity_completed` | `setActivityStatus` | `type` |
| `note_created` | `createNote` | — |
| `file_uploaded` | `createAttachment` | `mimeType` |
| `reminder_created` | `createActivity` (saat schedule terbentuk) | `channels: in_app \| email` |
| `export_requested` | `requestDataExport` | `exportType` |

## Funnel CLI

```bash
npm run analytics:funnel            # hari ini (Asia/Jakarta)
npm run analytics:funnel 2026-08-01 # tanggal tertentu
```

Output: jumlah user per event di hari tersebut + `returned_next_day` dan
`returned_within_7d` (user yang signup hari itu lalu aktif kembali dalam
1 hari / 7 hari).

## Query contoh

Breakdown sumber mata kuliah:

```sql
select properties->>'source' as source, count(distinct user_id)
from analytics_events
where event_name = 'course_created'
  and occurred_at >= now() - interval '30 days'
group by 1;
```

Breakdown tipe aktivitas:

```sql
select properties->>'type' as type, count(distinct user_id)
from analytics_events
where event_name = 'activity_created'
  and occurred_at >= now() - interval '30 days'
group by 1;
```

Breakdown channel reminder:

```sql
select jsonb_array_elements_text(properties->'channels') as channel,
       count(distinct user_id)
from analytics_events
where event_name = 'reminder_created'
  and occurred_at >= now() - interval '30 days'
group by 1;
```
```

- [ ] **Step 2: Amend spec — `reminder_created` property**

Di `docs/superpowers/specs/2026-08-15-sakustudi-analytics-tracking-design.md`, ubah baris tabel event:

```
| `reminder_created` | reminders service, setelah jadwal tersimpan | `{ channel: reminderChannel }` |
```

menjadi:

```
| `reminder_created` | `createActivity`, setelah schedule tersimpan | `{ channels: ("in_app" \| "email")[] }` |
```

dan di bagian architecture, baris properties "channel reminder" menjadi
"channels reminder". Sesuaikan juga kalimat di section Events yang menyebut
`channel` tunggal.

- [ ] **Step 3: Verifikasi + commit**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration`
Expected: PASS semua.

Opsional (butuh Redis + worker berhenti): `npm run test:e2e -- tests/e2e/auth.spec.ts`
Expected: PASS — pastikan tidak ada worker stale (lihat AGENTS.md).

```bash
git add docs/operations/analytics.md docs/superpowers/specs/2026-08-15-sakustudi-analytics-tracking-design.md
git commit -m "docs: add analytics operations guide and amend reminder event spec"
```

---

## Self-Review Checklist

- [ ] Spec coverage: semua 10 event PRD §15 (yang relevan) ada di Task 3; funnel (Task 2), CLI (Task 5), privacy policy + consent (Task 4), docs (Task 6). Event `ai_*`, `paywall_*`, `subscription_*` sengaja tidak ada (fitur belum ada, per Non-Goals spec).
- [ ] Tanpa placeholder: setiap task punya kode lengkap.
- [ ] Type consistency: `trackEvent(userId, eventName, properties?)` dipakai konsisten; `getFunnelSnapshot(date, timeZone?)` signature sama di Task 2 dan 5; `LEGAL_DOCUMENT_VERSIONS.privacy_policy` "2026-08-15" konsisten di Task 4.
- [ ] Tidak ada migration baru; tabel `analytics_events` existing dipakai apa adanya.
- [ ] `reminder_created` tidak di-emit dari dalam transaction (`createReminderScheduleInTx`), melainkan dari `createActivity` setelah commit — sesuai constraint.
