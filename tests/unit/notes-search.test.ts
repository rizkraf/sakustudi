import { describe, expect, it } from "vitest";

import { escapeLikePattern } from "~/modules/notes/notes.repository";
import {
  createNoteSchema,
  noteSearchSchema,
  updateNoteSchema,
} from "~/modules/notes/notes.schema";

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("escapeLikePattern", () => {
  it("leaves ordinary text untouched", () => {
    expect(escapeLikePattern("struktur data")).toBe("struktur data");
  });

  it("escapes LIKE wildcards so queries match literally", () => {
    expect(escapeLikePattern("100% done")).toBe("100\\% done");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("back\\slash")).toBe("back\\\\slash");
  });
});

describe("note schema", () => {
  const valid = { title: "UAS summary", contentHtml: "<p>content</p>", tags: "uas, summary" };

  it("accepts a complete create input and normalizes tags", () => {
    const parsed = createNoteSchema.parse(valid);
    expect(parsed).toMatchObject({
      title: "UAS summary",
      contentHtml: "<p>content</p>",
      courseId: null,
    });
    expect(parsed.tags).toEqual(["uas", "summary"]);
  });

  it("dedupes, trims, and caps tags at 10", () => {
    const parsed = createNoteSchema.parse({
      ...valid,
      tags: "a, b, a, c ,b,1,2,3,4,5,6,7,8,9",
    });
    expect(parsed.tags).toEqual(["a", "b", "c", "1", "2", "3", "4", "5", "6", "7"]);
  });

  it("accepts repeated tags form fields", () => {
    const parsed = createNoteSchema.parse({ ...valid, tags: ["uas", "final"] });
    expect(parsed.tags).toEqual(["uas", "final"]);
  });

  it("defaults to no course, empty content, and no tags", () => {
    const parsed = createNoteSchema.parse({ title: "T" });
    expect(parsed).toMatchObject({ courseId: null, contentHtml: "", tags: [] });
  });

  it("requires a title and validates course and content length", () => {
    expect(createNoteSchema.safeParse({ title: "   " }).success).toBe(false);
    expect(createNoteSchema.safeParse({ title: "T", courseId: "nope" }).success).toBe(false);
    expect(
      createNoteSchema.safeParse({ title: "T", contentHtml: "x".repeat(200_001) }).success,
    ).toBe(false);
  });

  it("clears the course with an empty value and omits it when absent", () => {
    expect(createNoteSchema.parse({ title: "T", courseId: "" }).courseId).toBeNull();
    expect(updateNoteSchema.parse({ title: "T" }).courseId).toBeUndefined();
  });

  it("allows partial updates and keeps absent fields undefined", () => {
    const parsed = updateNoteSchema.parse({ title: "Renamed" });
    expect(parsed).toEqual({ title: "Renamed" });
    expect(updateNoteSchema.parse({ courseId: "" }).courseId).toBeNull();
    expect(updateNoteSchema.parse({ courseId: UUID }).courseId).toBe(UUID);
  });

  it("validates search input", () => {
    expect(noteSearchSchema.parse({ query: "  sql  " }).query).toBe("sql");
    expect(noteSearchSchema.parse({ query: "", courseId: null }).courseId).toBeNull();
    expect(
      noteSearchSchema.safeParse({ courseId: "not-a-uuid" }).success,
    ).toBe(false);
    expect(noteSearchSchema.safeParse({ query: "x".repeat(201) }).success).toBe(false);
  });
});
