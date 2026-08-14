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
import { action as createNoteAction } from "~/routes/notes.new";
import { user } from "~/lib/db/schema";
import { createAcademicTerm } from "~/modules/academic-terms/terms.service";
import { createCustomCourse } from "~/modules/catalog/catalog.service";
import {
  createNote,
  deleteNote,
  getNote,
  searchNotes,
  updateNote,
} from "~/modules/notes/notes.service";
import {
  createUsefulLink,
  deleteUsefulLink,
  listUsefulLinks,
} from "~/modules/links/links.service";

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
    name: "Notes Integration User",
    email: `${id}@notes-int.test`,
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

function expectAppError(error: unknown, code: string): {
  message?: string;
  fieldErrors?: Record<string, string[]>;
} {
  expect(error).toBeInstanceOf(Error);
  const candidate = error as {
    code?: string;
    message?: string;
    fieldErrors?: Record<string, string[]>;
  };
  expect(candidate.code).toBe(code);
  return candidate;
}

describe("notes and useful links integration", () => {
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

  it("sanitizes HTML before persisting and indexes plain text for search", async () => {
    const { userId, courseId } = await createUserWithTermAndCourse();

    const note = await createNote(userId, {
      title: "SQL notes",
      courseId,
      contentHtml:
        '<h2>Basics</h2><p>SELECT is used for <strong>querying</strong>.</p><script>alert(1)</script>',
      tags: ["database", "exam"],
    });

    expect(note.content).toBe(
      "<h2>Basics</h2><p>SELECT is used for <strong>querying</strong>.</p>",
    );
    expect(note.contentText).toBe("Basics\nSELECT is used for querying.");
    expect(note.tags).toEqual(["database", "exam"]);
    expect(note.courseId).toBe(courseId);
    expect(note.termId).toBeTruthy();

    const hits = await searchNotes(userId, { query: "querying" });
    expect(hits.map((n) => n.id)).toEqual([note.id]);
    expect(hits[0].courseName).toBe("Struktur Data");

    const noHits = await searchNotes(userId, { query: "alert" });
    expect(noHits).toHaveLength(0);
  });

  it("searches only plain text, not raw HTML", async () => {
    const { userId } = await createUserWithTermAndCourse();
    await createNote(userId, {
      title: "Tags in text",
      contentHtml: "<p>See the <strong>bold</strong> word</p>",
      tags: [],
    });

    expect((await searchNotes(userId, { query: "bold" })).length).toBeGreaterThan(0);
    expect(await searchNotes(userId, { query: "<strong>" })).toHaveLength(0);
    expect(await searchNotes(userId, { query: "<p>" })).toHaveLength(0);
  });

  it("filters by course and tag", async () => {
    const { userId, courseId } = await createUserWithTermAndCourse();
    const inCourse = await createNote(userId, {
      title: "In course",
      contentHtml: "<p>alpha</p>",
      tags: ["uas"],
      courseId,
    });
    await createNote(userId, {
      title: "Global note",
      contentHtml: "<p>alpha</p>",
      tags: ["tugas"],
    });

    const byCourse = await searchNotes(userId, { query: "alpha", courseId });
    expect(byCourse.map((n) => n.id)).toEqual([inCourse.id]);

    const byTag = await searchNotes(userId, { query: "alpha", tag: "uas" });
    expect(byTag.map((n) => n.id)).toEqual([inCourse.id]);

    const byBoth = await searchNotes(userId, {
      query: "alpha",
      courseId,
      tag: "tugas",
    });
    expect(byBoth).toHaveLength(0);
  });

  it("escapes LIKE wildcards so % matches literally", async () => {
    const { userId } = await createUserWithTermAndCourse();
    await createNote(userId, {
      title: "Progress",
      contentHtml: "<p>Score: 100% complete</p>",
      tags: [],
    });

    const hits = await searchNotes(userId, { query: "100%" });
    expect(hits.map((n) => n.title)).toContain("Progress");
  });

  it("updates content, re-sanitizes, and re-indexes search text", async () => {
    const { userId } = await createUserWithTermAndCourse();
    const note = await createNote(userId, {
      title: "Old",
      contentHtml: "<p>obsolete content</p>",
      tags: [],
    });

    const updated = await updateNote(userId, note.id, {
      contentHtml: "<p>fresh <em>content</em></p><iframe src='https://x'></iframe>",
      tags: ["new-tag"],
    });
    expect(updated.content).toBe("<p>fresh <em>content</em></p>");
    expect(updated.contentText).toBe("fresh content");

    expect(await searchNotes(userId, { query: "obsolete" })).toHaveLength(0);
    const hits = await searchNotes(userId, { query: "fresh" });
    expect(hits.map((n) => n.id)).toEqual([note.id]);
    const tagHits = await searchNotes(userId, { query: "fresh", tag: "new-tag" });
    expect(tagHits).toHaveLength(1);
  });

  it("keeps fields untouched when omitted and clears them when empty", async () => {
    const { userId, courseId } = await createUserWithTermAndCourse();
    const note = await createNote(userId, {
      title: "Keep me",
      courseId,
      contentHtml: "<p>original</p>",
      tags: ["keep"],
    });

    const renamed = await updateNote(userId, note.id, { title: "Renamed" });
    expect(renamed.courseId).toBe(courseId);
    expect(renamed.content).toBe("<p>original</p>");
    expect(renamed.tags).toEqual(["keep"]);

    const cleared = await updateNote(userId, note.id, {
      courseId: "",
      contentHtml: "",
      tags: "",
    });
    expect(cleared.courseId).toBeNull();
    expect(cleared.termId).toBeNull();
    expect(cleared.content).toBe("");
    expect(cleared.contentText).toBe("");
    expect(cleared.tags).toEqual([]);
  });

  it("hides other users' notes from every command", async () => {
    const owner = await createUserWithTermAndCourse();
    const note = await createNote(owner.userId, {
      title: "Mine",
      contentHtml: "<p>secret</p>",
      tags: [],
    });
    const attacker = newUserId();
    await createUser(attacker);

    expectAppError(
      await getNote(attacker, note.id).catch((caught) => caught),
      "NOT_FOUND",
    );
    expectAppError(
      await updateNote(attacker, note.id, { title: "Hijacked" }).catch(
        (caught) => caught,
      ),
      "NOT_FOUND",
    );
    expectAppError(
      await deleteNote(attacker, note.id).catch((caught) => caught),
      "NOT_FOUND",
    );
    expect((await getNote(owner.userId, note.id)).title).toBe("Mine");
  });

  it("rejects notes attached to another user's course", async () => {
    const owner = await createUserWithTermAndCourse();
    const attacker = newUserId();
    await createUser(attacker);

    const error = expectAppError(
      await createNote(attacker, {
        title: "Sneaky",
        courseId: owner.courseId,
        contentHtml: "<p>x</p>",
        tags: [],
      }).catch((caught) => caught),
      "NOT_FOUND",
    );
    expect(error.message).toBe("Course not found.");
  });

  it("creates a note through the route action with CSRF protection", async () => {
    const { userId, courseId } = await createUserWithTermAndCourse();

    const token = createCsrfToken(userId);
    const formData = new FormData();
    formData.set("intent", "create");
    formData.set("csrfToken", token);
    formData.set("title", "Via route action");
    formData.set("courseId", courseId);
    formData.set("contentHtml", "<p>route <strong>action</strong></p>");
    formData.set("tags", "integration");
    const request = new Request("http://localhost:3000/notes/new", {
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
      email: `${userId}@notes-int.test`,
      name: "Notes Integration User",
    });

    let redirectResponse: Response | undefined;
    try {
      await createNoteAction({ request, context } as never);
    } catch (error) {
      if (error instanceof Response) redirectResponse = error;
      else throw error;
    }

    expect(redirectResponse).toBeDefined();
    expect(redirectResponse!.status).toBe(302);
    expect(redirectResponse!.headers.get("location")).toMatch(/^\/notes\//);

    const hits = await searchNotes(userId, { query: "route action" });
    expect(hits.map((n) => n.title)).toContain("Via route action");
    expect(hits[0].contentText).toBe("route action");
  });

  it("creates, lists, scopes, and deletes useful links with ownership", async () => {
    const { userId, courseId } = await createUserWithTermAndCourse();

    const globalLink = await createUsefulLink(userId, {
      title: "UT Elearning",
      url: "https://elearning.ut.ac.id/",
      description: "Main portal",
      category: null,
      courseId: null,
    });
    const courseLink = await createUsefulLink(userId, {
      title: "Struktur Data modules",
      url: "https://elearning.ut.ac.id/course/view.php?id=7",
      description: null,
      category: "materials",
      courseId,
    });

    const all = await listUsefulLinks(userId);
    expect(all.map((l) => l.title)).toContain("UT Elearning");
    expect(all.map((l) => l.title)).toContain("Struktur Data modules");

    const scoped = await listUsefulLinks(userId, courseId);
    expect(scoped.map((l) => l.id)).toEqual([courseLink.id]);

    const withoutScope = await listUsefulLinks(userId, null);
    expect(withoutScope.map((l) => l.id)).toEqual(
      expect.arrayContaining([globalLink.id, courseLink.id]),
    );

    await deleteUsefulLink(userId, courseLink.id);
    expect(await listUsefulLinks(userId, courseId)).toHaveLength(0);
  });

  it("rejects other users' useful links and non-http URLs", async () => {
    const owner = await createUserWithTermAndCourse();
    const link = await createUsefulLink(owner.userId, {
      title: "Mine",
      url: "https://example.com",
      description: null,
      category: null,
      courseId: null,
    });
    const attacker = newUserId();
    await createUser(attacker);

    expectAppError(
      await deleteUsefulLink(attacker, link.id).catch((caught) => caught),
      "NOT_FOUND",
    );
    expect((await listUsefulLinks(owner.userId)).map((l) => l.id)).toContain(link.id);

    const error = expectAppError(
      await createUsefulLink(attacker, {
        title: "Sneaky",
        url: "javascript:alert(1)",
        description: null,
        category: null,
        courseId: owner.courseId,
      }).catch((caught) => caught),
      "VALIDATION_FAILED",
    );
    expect(error.fieldErrors?.url?.[0]).toContain("http");
  });
});
