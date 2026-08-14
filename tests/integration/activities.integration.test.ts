import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { RouterContextProvider } from "react-router";

import { closeDb, getDb } from "~/lib/db/client";
import { seedCatalog } from "~/lib/db/seed";
import { sessionUserContext } from "~/context";
import {
  createCsrfToken,
  CSRF_COOKIE_NAME,
} from "~/lib/request/security.server";
import { action as createActivityAction } from "~/routes/activities.new";
import { user } from "~/lib/db/schema";
import { createAcademicTerm } from "~/modules/academic-terms/terms.service";
import { findActiveTerm } from "~/modules/academic-terms/terms.repository";
import { createCustomCourse } from "~/modules/catalog/catalog.service";
import {
  createActivity,
  getActivity,
  listActivityPage,
  listUpcomingActivities,
  setActivityStatus,
  updateActivity,
} from "~/modules/activities/activities.service";
import { getCourseDetail } from "~/modules/courses/courses.service";
import { getDashboardData } from "~/modules/dashboard/dashboard.service";

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
    name: "Activities Integration User",
    email: `${id}@activities-int.test`,
    emailVerified: true,
  });
}

async function createUserWithTermAndCourse(): Promise<{
  userId: string;
  termId: string;
  courseId: string;
}> {
  const userId = newUserId();
  await createUser(userId);
  const term = await createAcademicTerm(userId, {
    name: "Gasal 2026/2027",
    startDate: new Date("2026-09-01T00:00:00Z"),
    endDate: new Date("2027-02-28T00:00:00Z"),
  });
  const course = await createCustomCourse(userId, term.id, {
    name: "Struktur Data",
    code: "KDST4101",
  });
  return { userId, termId: term.id, courseId: course.id };
}

function expectAppError(error: unknown, code: string): { message?: string } {
  expect(error).toBeInstanceOf(Error);
  const candidate = error as { code?: string; message?: string };
  expect(candidate.code).toBe(code);
  return candidate;
}

/** Date-only input value N days from the test run's clock, UTC-based. */
function daysFromNow(days: number): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("courses, activities, progress, and dashboard integration", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seedCatalog(db);
  }, 60_000);

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.delete(user).where(inArray(user.id, createdUserIds));
    }
    await closeDb();
  });

  it("creates an activity with a deadline converted to 23:59 WIB UTC", async () => {
    const { userId, courseId } = await createUserWithTermAndCourse();

    const activity = await createActivity(userId, {
      title: "Tugas 1",
      courseId,
      type: "assignment",
      deadline: "2026-10-01",
      details: "Kerjakan soal 1-5",
    });

    expect(activity).toMatchObject({
      userId,
      courseId,
      title: "Tugas 1",
      type: "assignment",
      status: "pending",
      completedAt: null,
      details: "Kerjakan soal 1-5",
    });
    expect(activity.dueDate?.toISOString()).toBe("2026-10-01T16:59:59.000Z");
  });

  it("rejects creating an activity in another user's course", async () => {
    const owner = await createUserWithTermAndCourse();
    const attacker = newUserId();
    await createUser(attacker);

    const error = expectAppError(
      await createActivity(attacker, {
        title: "Sneaky",
        courseId: owner.courseId,
        type: "other",
        deadline: "2026-10-01",
      }).catch((caught) => caught),
      "NOT_FOUND",
    );
    expect(error.message).toBe("Course not found.");
  });

  it("follows the status chain and sets completion timestamps only for completed", async () => {
    const { userId, courseId } = await createUserWithTermAndCourse();
    const activity = await createActivity(userId, {
      title: "Progress check",
      courseId,
      type: "quiz",
      deadline: "2026-10-01",
    });

    const inProgress = await setActivityStatus(userId, activity.id, "in_progress");
    expect(inProgress.status).toBe("in_progress");
    expect(inProgress.completedAt).toBeNull();

    const completed = await setActivityStatus(userId, activity.id, "completed");
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBeInstanceOf(Date);

    const reopened = await setActivityStatus(userId, activity.id, "pending");
    expect(reopened.status).toBe("pending");
    expect(reopened.completedAt).toBeNull();
  });

  it("rejects backwards transitions without a reopen", async () => {
    const { userId, courseId } = await createUserWithTermAndCourse();
    const activity = await createActivity(userId, {
      title: "Locked",
      courseId,
      type: "assignment",
      deadline: "2026-10-01",
    });
    await setActivityStatus(userId, activity.id, "in_progress");

    const error = expectAppError(
      await setActivityStatus(userId, activity.id, "pending").catch(
        (caught) => caught,
      ),
      "VALIDATION_FAILED",
    );
    expect(error.message).toMatch(/Cannot change/);
    expect((await getActivity(userId, activity.id)).status).toBe("in_progress");
  });

  it("hides other users' activities from every command", async () => {
    const owner = await createUserWithTermAndCourse();
    const activity = await createActivity(owner.userId, {
      title: "Mine",
      courseId: owner.courseId,
      type: "assignment",
      deadline: "2026-10-01",
    });
    const attacker = newUserId();
    await createUser(attacker);

    expectAppError(
      await getActivity(attacker, activity.id).catch((caught) => caught),
      "NOT_FOUND",
    );
    expectAppError(
      await updateActivity(attacker, activity.id, { title: "Hijacked" }).catch(
        (caught) => caught,
      ),
      "NOT_FOUND",
    );
    expectAppError(
      await setActivityStatus(attacker, activity.id, "completed").catch(
        (caught) => caught,
      ),
      "NOT_FOUND",
    );
    expect((await getActivity(owner.userId, activity.id)).title).toBe("Mine");
  });

  it("serializes concurrent status updates without lost or conflicting writes", async () => {
    const { userId, courseId } = await createUserWithTermAndCourse();
    const activity = await createActivity(userId, {
      title: "Race",
      courseId,
      type: "assignment",
      deadline: "2026-10-01",
    });

    const [a, b] = await Promise.all([
      setActivityStatus(userId, activity.id, "completed"),
      setActivityStatus(userId, activity.id, "completed"),
    ]);
    expect(a.status).toBe("completed");
    expect(b.status).toBe("completed");
    expect(a.completedAt).toBeInstanceOf(Date);
    expect(b.completedAt).toBeInstanceOf(Date);

    const [c, d] = await Promise.all([
      setActivityStatus(userId, activity.id, "completed").catch((error) => error),
      setActivityStatus(userId, activity.id, "in_progress").catch((error) => error),
    ]);
    for (const result of [c, d]) {
      expect(result).not.toBeInstanceOf(Error);
    }
    const final = await getActivity(userId, activity.id);
    expect(["completed", "in_progress"]).toContain(final.status);
    if (final.status === "completed") {
      expect(final.completedAt).toBeInstanceOf(Date);
    } else {
      expect(final.completedAt).toBeNull();
    }
  });

  it("updates editable fields and moves the activity to the new course's term", async () => {
    const { userId, termId, courseId } = await createUserWithTermAndCourse();
    const secondCourse = await createCustomCourse(userId, termId, {
      name: "Basis Data",
    });
    const activity = await createActivity(userId, {
      title: "Old title",
      courseId,
      type: "assignment",
      deadline: "2026-10-01",
    });

    const updated = await updateActivity(userId, activity.id, {
      title: "New title",
      deadline: "2026-11-05",
      details: "Updated notes",
      courseId: secondCourse.id,
    });

    expect(updated.title).toBe("New title");
    expect(updated.courseId).toBe(secondCourse.id);
    expect(updated.termId).toBe(termId);
    expect(updated.dueDate?.toISOString()).toBe("2026-11-05T16:59:59.000Z");
    expect(updated.status).toBe("pending");
  });

  it("lists upcoming activities inside a range and excludes completed", async () => {
    const { userId, courseId } = await createUserWithTermAndCourse();
    const term = (await findActiveTerm(userId))!;
    const completed = await createActivity(userId, {
      title: "Done",
      courseId,
      type: "quiz",
      deadline: "2026-09-10",
    });
    await setActivityStatus(userId, completed.id, "completed");
    await createActivity(userId, {
      title: "Upcoming",
      courseId,
      type: "exam",
      deadline: "2026-09-10",
    });

    const upcoming = await listUpcomingActivities(userId, term.id, {
      from: new Date("2026-09-01T00:00:00Z"),
      to: new Date("2026-09-30T00:00:00Z"),
    });

    expect(upcoming.map((a) => a.title)).toEqual(["Upcoming"]);
    expect(upcoming[0].courseName).toBe("Struktur Data");
    expect(upcoming[0].courseCode).toBe("KDST4101");

    const outOfRange = await listUpcomingActivities(userId, term.id, {
      from: new Date("2026-10-01T00:00:00Z"),
      to: new Date("2026-10-31T00:00:00Z"),
    });
    expect(outOfRange).toHaveLength(0);
  });

  it("paginates the term activity list", async () => {
    const { userId, courseId } = await createUserWithTermAndCourse();
    const term = (await findActiveTerm(userId))!;
    for (let index = 0; index < 12; index += 1) {
      await createActivity(userId, {
        title: `Activity ${index + 1}`,
        courseId,
        type: "assignment",
        deadline: "2026-10-01",
      });
    }

    const first = await listActivityPage(userId, term.id, 1, 10);
    expect(first.total).toBe(12);
    expect(first.items).toHaveLength(10);
    expect(first.pageCount).toBe(2);

    const second = await listActivityPage(userId, term.id, 2, 10);
    expect(second.items).toHaveLength(2);

    const overPage = await listActivityPage(userId, term.id, 99, 10);
    expect(overPage.items).toHaveLength(0);
    expect(overPage.page).toBe(99);
  });

  it("reports course progress as completed over total, 0% when empty", async () => {
    const { userId, courseId } = await createUserWithTermAndCourse();

    const empty = await getCourseDetail(userId, courseId);
    expect(empty.progress).toBe(0);
    expect(empty.totalCount).toBe(0);

    const a = await createActivity(userId, {
      title: "A",
      courseId,
      type: "assignment",
      deadline: "2026-10-01",
    });
    const b = await createActivity(userId, {
      title: "B",
      courseId,
      type: "quiz",
      deadline: "2026-10-02",
    });
    await createActivity(userId, {
      title: "C",
      courseId,
      type: "exam",
      deadline: "2026-10-03",
    });
    await setActivityStatus(userId, a.id, "completed");
    await setActivityStatus(userId, b.id, "completed");

    const detail = await getCourseDetail(userId, courseId);
    expect(detail.progress).toBe(67);
    expect(detail.completedCount).toBe(2);
    expect(detail.totalCount).toBe(3);
    expect(detail.activities.map((activity) => activity.title)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("rejects reading another user's course detail", async () => {
    const owner = await createUserWithTermAndCourse();
    const attacker = newUserId();
    await createUser(attacker);

    expectAppError(
      await getCourseDetail(attacker, owner.courseId).catch((caught) => caught),
      "NOT_FOUND",
    );
  });

  it("shapes the dashboard: term, counts, progress, upcoming, overdue", async () => {
    const { userId, courseId } = await createUserWithTermAndCourse();

    const empty = await getDashboardData(userId);
    expect(empty.activeTerm?.name).toBe("Gasal 2026/2027");
    expect(empty.courseCount).toBe(1);
    expect(empty.courses).toHaveLength(1);
    expect(empty.courses[0].progress).toBe(0);
    expect(empty.upcomingActivities).toHaveLength(0);
    expect(empty.overdueActivities).toHaveLength(0);

    const done = await createActivity(userId, {
      title: "Sudah selesai",
      courseId,
      type: "assignment",
      deadline: daysFromNow(30),
    });
    await setActivityStatus(userId, done.id, "completed");
    await createActivity(userId, {
      title: "Mendekat",
      courseId,
      type: "quiz",
      deadline: daysFromNow(2),
    });
    await createActivity(userId, {
      title: "Telat",
      courseId,
      type: "exam",
      deadline: daysFromNow(-30),
    });

    const data = await getDashboardData(userId);
    expect(data.courseCount).toBe(1);
    expect(data.courses[0].progress).toBe(33);
    expect(data.upcomingActivities.map((a) => a.title)).toEqual(["Mendekat"]);
    expect(data.overdueActivities.map((a) => a.title)).toEqual(["Telat"]);
    expect(data.now).toEqual(expect.any(String));
  });

  it("returns an empty dashboard without an active term", async () => {
    const userId = newUserId();
    await createUser(userId);

    const data = await getDashboardData(userId);
    expect(data.activeTerm).toBeNull();
    expect(data.courseCount).toBe(0);
    expect(data.courses).toEqual([]);
    expect(data.upcomingActivities).toEqual([]);
    expect(data.overdueActivities).toEqual([]);
  });

  it("creates an activity through the route action with CSRF protection", async () => {
    const { userId, courseId } = await createUserWithTermAndCourse();

    const token = createCsrfToken(userId);
    const formData = new FormData();
    formData.set("intent", "create");
    formData.set("csrfToken", token);
    formData.set("title", "Via route action");
    formData.set("courseId", courseId);
    formData.set("type", "project");
    formData.set("deadline", "2026-12-01");
    const request = new Request("http://localhost:3000/activities/new", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        Cookie: `${CSRF_COOKIE_NAME}=${token}`,
      },
      body: formData,
    });
    const context = new RouterContextProvider();
    context.set(sessionUserContext, {
      id: userId,
      email: `${userId}@activities-int.test`,
      name: "Activities Integration User",
    });

    let redirectResponse: Response | undefined;
    try {
      await createActivityAction({ request, context } as never);
    } catch (error) {
      if (error instanceof Response) redirectResponse = error;
      else throw error;
    }

    expect(redirectResponse).toBeDefined();
    expect(redirectResponse!.status).toBe(302);
    expect(redirectResponse!.headers.get("location")).toBe("/activities");

    const term = (await findActiveTerm(userId))!;
    const page = await listActivityPage(userId, term.id, 1, 10);
    expect(page.items.some((a) => a.title === "Via route action")).toBe(true);
  });
});
