import { z } from "zod";

import { isValidDeadlineInput } from "~/lib/time/deadlines";

export const ACTIVITY_TYPES = [
  "lecture",
  "assignment",
  "quiz",
  "exam",
  "project",
  "practice",
  "other",
] as const;

export const ACTIVITY_STATUSES = [
  "pending",
  "in_progress",
  "completed",
] as const;

export const ACTIVITY_TYPE_LABELS: Record<(typeof ACTIVITY_TYPES)[number], string> = {
  lecture: "Lecture",
  assignment: "Assignment",
  quiz: "Quiz",
  exam: "Exam",
  project: "Project",
  practice: "Practice",
  other: "Other",
};

export const createActivitySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required.")
    .max(200, "Title must be 200 characters or fewer."),
  courseId: z.string().uuid("Select a course."),
  type: z.enum(ACTIVITY_TYPES, { message: "Select a type." }),
  deadline: z
    .string()
    .trim()
    .min(1, "Deadline is required.")
    .refine(isValidDeadlineInput, {
      message: "Deadline must be a date (YYYY-MM-DD) or date and time (YYYY-MM-DDTHH:mm).",
    }),
  details: z
    .string()
    .trim()
    .max(5000, "Details must be 5000 characters or fewer.")
    .optional()
    .transform((value) => (value === undefined || value === "" ? undefined : value))
    .optional(),
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

export const updateActivitySchema = createActivitySchema.partial();

export const setActivityStatusSchema = z.object({
  activityId: z.string().uuid("Activity is not valid."),
  status: z.enum(ACTIVITY_STATUSES, { message: "Status is not valid." }),
});

export type SetActivityStatusInput = z.infer<typeof setActivityStatusSchema>;

/**
 * Permitted status transitions. Forward only (pending -> in_progress ->
 * completed); reopening a completed activity returns it to pending or
 * in_progress. Same-status calls are no-ops and never fail.
 */
export const ACTIVITY_STATUS_TRANSITIONS: Record<
  (typeof ACTIVITY_STATUSES)[number],
  readonly (typeof ACTIVITY_STATUSES)[number][]
> = {
  pending: ["in_progress", "completed"],
  in_progress: ["completed"],
  completed: ["pending", "in_progress"],
};

export function canTransitionStatus(
  current: (typeof ACTIVITY_STATUSES)[number],
  next: (typeof ACTIVITY_STATUSES)[number],
): boolean {
  return current === next || ACTIVITY_STATUS_TRANSITIONS[current].includes(next);
}
