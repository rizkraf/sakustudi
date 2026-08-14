import { z } from "zod";

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 50;
const MAX_CONTENT_LENGTH = 200_000;

/**
 * Tags arrive from the form as a comma-separated string (or repeated fields).
 * Normalizes: trim, collapse inner whitespace, dedupe, cap at 10 tags of
 * 50 characters each.
 */
function normalizeTags(value: string | string[]): string[] {
  const parts = Array.isArray(value) ? value : [value];
  const tags: string[] = [];
  for (const part of parts) {
    for (const raw of part.split(",")) {
      const tag = raw.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
      if (tag && !tags.includes(tag)) {
        tags.push(tag);
      }
    }
  }
  return tags.slice(0, MAX_TAGS);
}

const tagsInput = z
  .union([z.string(), z.array(z.string())])
  .transform(normalizeTags);

/**
 * Course selector for creates: absent or empty input means "no course";
 * anything else must be a valid uuid. Transforms to `string | null`.
 */
const createCourseId = z
  .union([z.literal(""), z.string().uuid("Course is not valid.")])
  .nullable()
  .optional()
  .transform((value) => (value === "" ? null : (value ?? null)));

/**
 * Course selector for updates: absent input keeps the existing course
 * (undefined), empty input clears it (null), a uuid moves the note.
 */
const updateCourseId = z
  .union([z.literal(""), z.string().uuid("Course is not valid.")])
  .nullable()
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    return value === "" ? null : value;
  })
  .optional();

export const createNoteSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required.")
    .max(200, "Title must be 200 characters or fewer."),
  courseId: createCourseId,
  contentHtml: z
    .string()
    .max(MAX_CONTENT_LENGTH, `Content must be ${MAX_CONTENT_LENGTH} characters or fewer.`)
    .optional()
    .transform((value) => value ?? ""),
  tags: tagsInput.optional().transform((value) => value ?? []),
});

export const updateNoteSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required.")
    .max(200, "Title must be 200 characters or fewer.")
    .optional(),
  courseId: updateCourseId,
  contentHtml: z
    .string()
    .max(MAX_CONTENT_LENGTH, `Content must be ${MAX_CONTENT_LENGTH} characters or fewer.`)
    .optional(),
  tags: tagsInput.optional(),
});

export type CreateNoteInput = z.input<typeof createNoteSchema>;
export type UpdateNoteInput = z.input<typeof updateNoteSchema>;

/**
 * Search input for the notes index: a free-text query plus optional course
 * and single-tag filters.
 */
export const noteSearchSchema = z.object({
  query: z.string().trim().max(200, "Search query must be 200 characters or fewer."),
  courseId: z.string().uuid("Course is not valid.").nullable().optional(),
  tag: z.string().trim().max(50, "Tag must be 50 characters or fewer.").optional(),
});

export type NoteSearchInput = z.infer<typeof noteSearchSchema>;

export const usefulLinkSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required.")
    .max(200, "Title must be 200 characters or fewer."),
  url: z
    .string()
    .trim()
    .max(2048, "URL must be 2048 characters or fewer.")
    .refine((value) => /^https?:\/\//i.test(value), {
      message: "URL must start with http:// or https://.",
    }),
  description: z
    .union([
      z.string().trim().max(500, "Description must be 500 characters or fewer."),
      z.null(),
    ])
    .optional()
    .transform((value) => (value === "" || value === null ? null : value)),
  category: z
    .union([
      z.string().trim().max(100, "Category must be 100 characters or fewer."),
      z.null(),
    ])
    .optional()
    .transform((value) => (value === "" || value === null ? null : value)),
  courseId: createCourseId,
});

export type CreateUsefulLinkInput = z.infer<typeof usefulLinkSchema>;
