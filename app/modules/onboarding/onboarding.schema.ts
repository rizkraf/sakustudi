import { z } from "zod";

import { createTermSchema } from "~/modules/academic-terms/terms.schema";

export const SKIP_PROGRAM_VALUE = "skip";

/** Step 1: choose an active study program, or skip and fill in yourself. */
export const onboardingProgramSchema = z.object({
  programId: z
    .string()
    .trim()
    .min(1, "Choose a study program or skip this step."),
});

/** Step 2: name and date the active academic term. */
export const onboardingTermSchema = createTermSchema;

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function emptyToUndefined(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

/** Step 3: pick catalog courses and optionally type a custom course. */
export const onboardingCoursesSchema = z.object({
  courseIds: z.preprocess(
    toArray,
    z
      .array(z.string().uuid("A selected course is not valid."))
      .max(100, "You can add at most 100 courses per term."),
  ),
  customName: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(100, "Course name must be 100 characters or fewer.")
      .optional(),
  ),
  customCode: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(20, "Course code must be 20 characters or fewer.")
      .optional(),
  ),
});

export type OnboardingProgramInput = z.infer<typeof onboardingProgramSchema>;
export type OnboardingCoursesInput = z.infer<typeof onboardingCoursesSchema>;
