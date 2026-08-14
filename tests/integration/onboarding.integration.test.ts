import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { RouterContextProvider } from "react-router";

import { closeDb, getDb } from "~/lib/db/client";
import { AppError } from "~/lib/errors/AppError";
import { CATALOG_SEED_VERSION, seedCatalog } from "~/lib/db/seed";
import { sessionUserContext } from "~/context";
import {
  createCsrfToken,
  CSRF_COOKIE_NAME,
} from "~/lib/request/security.server";
import { action as createTermAction } from "~/routes/academic-terms._index";
import {
  academicTerms,
  courseCatalog,
  profiles,
  studyPrograms,
  user,
} from "~/lib/db/schema";
import {
  createCourseFromCatalog,
  createCustomCourse,
  listCatalogCourses,
} from "~/modules/catalog/catalog.service";
import {
  listOwnedTermCourses,
  selectCatalogCourses,
} from "~/modules/catalog/catalog.repository";
import { createAcademicTerm, setActiveTerm } from "~/modules/academic-terms/terms.service";
import {
  findActiveTerm,
  findOwnedTerm,
} from "~/modules/academic-terms/terms.repository";
import {
  completeOnboarding,
  getOnboardingStatus,
} from "~/modules/onboarding/onboarding.service";

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
    name: "Onboarding Integration User",
    email: `${id}@onboarding-int.test`,
    emailVerified: true,
  });
}

async function createUserWithActiveTerm(): Promise<{
  userId: string;
  termId: string;
}> {
  const userId = newUserId();
  await createUser(userId);
  const term = await createAcademicTerm(userId, {
    name: "Gasal 2026/2027",
    startDate: new Date("2026-09-01T00:00:00Z"),
    endDate: new Date("2027-02-28T00:00:00Z"),
  });
  return { userId, termId: term.id };
}

function expectAppError(error: unknown, code: string): AppError {
  expect(error).toBeInstanceOf(AppError);
  const appError = error as AppError;
  expect(appError.code).toBe(code);
  return appError;
}

describe("UT catalog, terms, and onboarding integration", () => {
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

  it("lists only active seed catalog courses, filtered by program and search", async () => {
    const userId = newUserId();
    await createUser(userId);

    const all = await listCatalogCourses(userId, {});
    expect(all.length).toBeGreaterThan(0);

    const programs = await db.select().from(studyPrograms);
    const siProgram = programs.find((p) => p.code === "SI");
    const tiProgram = programs.find((p) => p.code === "TI");
    expect(siProgram).toBeDefined();
    expect(tiProgram).toBeDefined();

    const siCourses = await listCatalogCourses(userId, {
      programId: siProgram!.id,
    });
    expect(siCourses.length).toBeGreaterThan(0);
    for (const course of siCourses) {
      expect(
        course.studyProgramId === siProgram!.id ||
          course.studyProgramId === null,
      ).toBe(true);
    }

    const tiCourses = await listCatalogCourses(userId, {
      programId: tiProgram!.id,
    });
    const tiCodes = new Set(tiCourses.map((c) => c.code));
    const siExclusive = siCourses.filter((c) => !tiCodes.has(c.code));
    expect(siExclusive.length).toBeGreaterThan(0);

    const searched = await listCatalogCourses(userId, {
      search: "  STRUKTUR   DATA ",
    });
    expect(searched.length).toBeGreaterThan(0);
    expect(searched.every((c) => c.name === "Struktur Data")).toBe(true);
  });

  it("hides inactive catalog rows from queries", async () => {
    const userId = newUserId();
    await createUser(userId);

    const program = (
      await db.select().from(studyPrograms).limit(1)
    )[0];

    const inactiveId = crypto.randomUUID();
    await db.insert(courseCatalog).values({
      id: inactiveId,
      code: `INACTIVE-${inactiveId.slice(0, 8)}`,
      name: "Deactivated Course",
      credits: 3,
      studyProgramId: program.id,
      sourceVersion: String(CATALOG_SEED_VERSION),
      isActive: false,
    });

    const results = await selectCatalogCourses(userId, {});
    expect(results.some((c) => c.id === inactiveId)).toBe(false);
  });

  it("creates one active term and rejects a second with CONFLICT", async () => {
    const userId = newUserId();
    await createUser(userId);

    const first = await createAcademicTerm(userId, {
      name: "Semester 1",
      startDate: new Date("2026-08-01T00:00:00Z"),
      endDate: new Date("2027-01-31T00:00:00Z"),
    });
    expect(first.status).toBe("active");

    let conflict: unknown;
    try {
      await createAcademicTerm(userId, {
        name: "Semester 2",
        startDate: new Date("2027-02-01T00:00:00Z"),
        endDate: new Date("2027-07-31T00:00:00Z"),
      });
    } catch (error) {
      conflict = error;
    }
    expectAppError(conflict, "CONFLICT");

    expect(await findActiveTerm(userId)).toMatchObject({ id: first.id });
  });

  it("rejects invalid term input with VALIDATION_FAILED", async () => {
    const userId = newUserId();
    await createUser(userId);

    let error: unknown;
    try {
      await createAcademicTerm(userId, {
        name: "",
        startDate: new Date("2026-09-01T00:00:00Z"),
        endDate: new Date("2026-08-01T00:00:00Z"),
      });
    } catch (caught) {
      error = caught;
    }
    const appError = expectAppError(error, "VALIDATION_FAILED");
    expect(appError.fieldErrors?.endDate).toBeDefined();
  });

  it("activates an archived term and archives the previous active one", async () => {
    const userId = newUserId();
    await createUser(userId);

    const first = await createAcademicTerm(userId, {
      name: "Term A",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-06-30T00:00:00Z"),
    });
    const secondId = crypto.randomUUID();
    await db.insert(academicTerms).values({
      id: secondId,
      userId,
      name: "Term B",
      startDate: new Date("2026-07-01T00:00:00Z"),
      endDate: new Date("2026-12-31T00:00:00Z"),
      status: "archived",
    });

    const activated = await setActiveTerm(userId, secondId);
    expect(activated.status).toBe("active");

    const after = await findOwnedTerm(userId, first.id);
    expect(after?.status).toBe("archived");
  });

  it("rejects activating another user's term with NOT_FOUND", async () => {
    const owner = await createUserWithActiveTerm();
    const attacker = newUserId();
    await createUser(attacker);

    let error: unknown;
    try {
      await setActiveTerm(attacker, owner.termId);
    } catch (caught) {
      error = caught;
    }
    expectAppError(error, "NOT_FOUND");
    expect(await findOwnedTerm(attacker, owner.termId)).toBeUndefined();
  });

  it("copies catalog identity into a user course", async () => {
    const { userId, termId } = await createUserWithActiveTerm();

    const catalogRows = await db.select().from(courseCatalog);
    const source = catalogRows[0];
    expect(source).toBeDefined();

    const created = await createCourseFromCatalog(userId, termId, source.id);

    expect(created).toMatchObject({
      userId,
      termId,
      catalogId: source.id,
      name: source.name,
      code: source.code,
      credits: source.credits,
      status: "planned",
    });

    const inTerm = await listOwnedTermCourses(userId, termId);
    expect(inTerm.some((c) => c.id === created.id)).toBe(true);
  });

  it("rejects copying from an unknown or inactive catalog course", async () => {
    const { userId, termId } = await createUserWithActiveTerm();

    let unknownError: unknown;
    try {
      await createCourseFromCatalog(userId, termId, crypto.randomUUID());
    } catch (caught) {
      unknownError = caught;
    }
    expectAppError(unknownError, "NOT_FOUND");

    const inactiveId = crypto.randomUUID();
    await db.insert(courseCatalog).values({
      id: inactiveId,
      code: `INACTIVE-${inactiveId.slice(0, 8)}`,
      name: "Deactivated",
      credits: 3,
      isActive: false,
    });
    let inactiveError: unknown;
    try {
      await createCourseFromCatalog(userId, termId, inactiveId);
    } catch (caught) {
      inactiveError = caught;
    }
    expectAppError(inactiveError, "NOT_FOUND");
  });

  it("rejects copying into another user's term with NOT_FOUND", async () => {
    const owner = await createUserWithActiveTerm();
    const attacker = newUserId();
    await createUser(attacker);
    const catalogRows = await db.select().from(courseCatalog);

    let error: unknown;
    try {
      await createCourseFromCatalog(attacker, owner.termId, catalogRows[0].id);
    } catch (caught) {
      error = caught;
    }
    expectAppError(error, "NOT_FOUND");
  });

  it("creates a custom course with a nullable catalog reference", async () => {
    const { userId, termId } = await createUserWithActiveTerm();

    const custom = await createCustomCourse(userId, termId, {
      name: "Skripsi",
      code: "SKR001",
    });
    expect(custom).toMatchObject({
      userId,
      termId,
      catalogId: null,
      name: "Skripsi",
      code: "SKR001",
    });

    let error: unknown;
    try {
      await createCustomCourse(userId, termId, { name: "   " });
    } catch (caught) {
      error = caught;
    }
    expectAppError(error, "VALIDATION_FAILED");
  });

  it("completes onboarding by setting the profile state, idempotently", async () => {
    const userId = newUserId();
    await createUser(userId);

    expect(await getOnboardingStatus(userId)).toEqual({
      completed: false,
      completedAt: null,
    });

    await completeOnboarding(userId);
    const afterFirst = await getOnboardingStatus(userId);
    expect(afterFirst.completed).toBe(true);
    expect(afterFirst.completedAt).toBeInstanceOf(Date);

    await completeOnboarding(userId);
    const afterSecond = await getOnboardingStatus(userId);
    expect(afterSecond.completed).toBe(true);

    const rows = await db
      .select({ completedAt: profiles.onboardingCompletedAt })
      .from(profiles)
      .where(eq(profiles.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("enforces one active term at the database level", async () => {
    const userId = newUserId();
    await createUser(userId);

    await createAcademicTerm(userId, {
      name: "Term One",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-06-30T00:00:00Z"),
    });

    let error: unknown;
    try {
      await db.insert(academicTerms).values({
        userId,
        name: "Term Two",
        startDate: new Date("2026-07-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        status: "active",
      });
    } catch (caught) {
      error = caught;
    }
    const candidate = error as { code?: string; cause?: { code?: string } };
    const code = candidate?.code ?? candidate?.cause?.code;
    expect(code).toBe("23505");
  });

  it("returns a 409 form error when the terms action creates a second active term", async () => {
    const userId = newUserId();
    await createUser(userId);
    await createAcademicTerm(userId, {
      name: "Term One",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-06-30T00:00:00Z"),
    });

    const token = createCsrfToken(userId);
    const formData = new FormData();
    formData.set("intent", "create");
    formData.set("csrfToken", token);
    formData.set("name", "Term Two");
    formData.set("startDate", "2026-07-01");
    formData.set("endDate", "2026-12-31");
    const request = new Request("http://localhost:3000/academic-terms", {
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
      email: `${userId}@onboarding-int.test`,
      name: "Onboarding Integration User",
    });

    const response = (await createTermAction({
      request,
      context,
    } as never)) as Response;
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      ok: false,
      fieldErrors: {},
      formErrors: [
        "You already have an active term. Archive it before creating another.",
      ],
    });

    const terms = await db
      .select()
      .from(academicTerms)
      .where(eq(academicTerms.userId, userId));
    expect(terms).toHaveLength(1);
  });

  it("creates a term through the terms action and redirects on success", async () => {
    const userId = newUserId();
    await createUser(userId);

    const token = createCsrfToken(userId);
    const formData = new FormData();
    formData.set("intent", "create");
    formData.set("csrfToken", token);
    formData.set("name", "Term One");
    formData.set("startDate", "2026-01-01");
    formData.set("endDate", "2026-06-30");
    const request = new Request("http://localhost:3000/academic-terms", {
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
      email: `${userId}@onboarding-int.test`,
      name: "Onboarding Integration User",
    });

    let redirectResponse: Response | undefined;
    try {
      await createTermAction({ request, context } as never);
    } catch (error) {
      if (error instanceof Response) redirectResponse = error;
      else throw error;
    }

    expect(redirectResponse).toBeDefined();
    expect(redirectResponse!.status).toBe(302);
    expect(redirectResponse!.headers.get("location")).toBe("/academic-terms");

    const terms = await db
      .select()
      .from(academicTerms)
      .where(eq(academicTerms.userId, userId));
    expect(terms).toHaveLength(1);
    expect(terms[0]).toMatchObject({ name: "Term One", status: "active" });
  });
});
