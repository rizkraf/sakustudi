import { Form, useActionData } from "react-router";
import { useFormStatus } from "react-dom";

import type { FieldErrorResponse } from "~/lib/errors/response";
import { toDeadlineInputValue } from "~/lib/time/deadlines";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
} from "~/modules/activities/activities.schema";
import type { CourseRow } from "~/modules/courses/courses.repository";

export type ActivityFormDefaults = {
  title: string;
  type: (typeof ACTIVITY_TYPES)[number];
  courseId: string | null;
  deadline: Date | null;
  details: string | null;
  link: string | null;
};

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function FieldError({ field, actionData }: { field: string; actionData?: FieldErrorResponse }) {
  const errors = actionData?.fieldErrors[field];
  if (!errors || errors.length === 0) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-danger">
      {errors[0]}
    </p>
  );
}

/**
 * Create/edit form for an activity. Every control has a visible label,
 * 44px+ hit areas, and per-field validation errors. The submit button shows
 * a pending state while the mutation is in flight.
 */
export function ActivityForm({
  courses,
  csrfToken,
  submitLabel,
  pendingLabel = "Saving…",
  intent = "create",
  defaults,
}: {
  courses: CourseRow[];
  csrfToken: string;
  submitLabel: string;
  pendingLabel?: string;
  intent?: "create" | "update";
  defaults?: ActivityFormDefaults;
}) {
  const actionData = useActionData<FieldErrorResponse | undefined>();
  const formError =
    actionData && actionData.formErrors.length > 0
      ? actionData.formErrors[0]
      : undefined;

  const inputClass =
    "mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

  return (
    <Form method="post" className="space-y-4">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="csrfToken" value={csrfToken} />
      {formError && (
        <p
          role="alert"
          className="rounded-input border border-danger/40 bg-danger/10 p-3 text-sm text-ink"
        >
          {formError}
        </p>
      )}

      <label className="block">
        <span className="text-sm font-medium">Title</span>
        <input
          name="title"
          type="text"
          required
          defaultValue={defaults?.title ?? ""}
          className={inputClass}
        />
        <FieldError field="title" actionData={actionData} />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Course</span>
        <select
          name="courseId"
          required
          defaultValue={defaults?.courseId ?? ""}
          className={inputClass}
        >
          <option value="" disabled>
            Select a course
          </option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
              {course.code ? ` (${course.code})` : ""}
            </option>
          ))}
        </select>
        <FieldError field="courseId" actionData={actionData} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Type</span>
          <select
            name="type"
            required
            defaultValue={defaults?.type ?? "assignment"}
            className={inputClass}
          >
            {ACTIVITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {ACTIVITY_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <FieldError field="type" actionData={actionData} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Deadline</span>
          <input
            name="deadline"
            type="date"
            required
            defaultValue={defaults?.deadline ? toDeadlineInputValue(defaults.deadline) : ""}
            className={inputClass}
          />
          <FieldError field="deadline" actionData={actionData} />
          <span className="mt-1 block text-xs text-muted">
            A date-only deadline means 23:59 WIB (Asia/Jakarta).
          </span>
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Details (optional)</span>
        <textarea
          name="details"
          rows={4}
          defaultValue={defaults?.details ?? ""}
          className={inputClass}
        />
        <FieldError field="details" actionData={actionData} />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Link (optional)</span>
        <input
          name="link"
          type="url"
          inputMode="url"
          placeholder="https://…"
          defaultValue={defaults?.link ?? ""}
          className={inputClass}
        />
        <FieldError field="link" actionData={actionData} />
        <span className="mt-1 block text-xs text-muted">
          Reference material for this activity, e.g. a tutorial or upload link.
        </span>
      </label>

      <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
    </Form>
  );
}
