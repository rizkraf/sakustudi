import { Link } from "react-router";

import type { ActivityWithCourse } from "~/modules/activities/activities.repository";
import { ACTIVITY_TYPE_LABELS } from "~/modules/activities/activities.schema";
import {
  deriveActivityState,
  formatDeadline,
  type ActivityState,
} from "~/lib/time/deadlines";

const STATUS_LABELS: Record<ActivityState, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  overdue: "Overdue",
};

function statusBadgeClass(state: ActivityState): string {
  switch (state) {
    case "completed":
      return "bg-success/20";
    case "overdue":
      return "bg-danger/20";
    case "in_progress":
      return "bg-info/20";
    case "not_started":
      return "bg-canvas";
  }
}

function statusActionFormClass(): string {
  return [
    "min-h-11 rounded-control border border-border bg-surface",
    "px-3 text-xs font-medium text-ink",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
  ].join(" ");
}

/**
 * Activity summary card. The status is always a badge plus a text label,
 * never color alone. Overdue is derived from the deadline at render time
 * (never persisted). The card can carry a quick complete/reopen action.
 */
export function ActivityCard({
  activity,
  now,
  csrfToken,
  to,
}: {
  activity: ActivityWithCourse;
  now: Date;
  csrfToken: string;
  /** Detail route for the title link. */
  to: string;
}) {
  const state = deriveActivityState(activity, now);
  const due = activity.dueDate ? formatDeadline(activity.dueDate) : "No deadline";
  const isCompleted = state === "completed";

  return (
    <article className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={to}
              className="text-sm font-semibold text-ink underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:underline"
            >
              {activity.title}
            </Link>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium text-ink ${statusBadgeClass(state)}`}
            >
              {STATUS_LABELS[state]}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {activity.courseName ?? "No course"}
            {activity.courseCode ? ` · ${activity.courseCode}` : ""}
            {" · "}
            {ACTIVITY_TYPE_LABELS[activity.type]}
            {" · "}
            {state === "overdue" ? (
              <span className="font-medium text-danger">Overdue: {due}</span>
            ) : (
              <>Due {due}</>
            )}
          </p>
        </div>
        {isCompleted ? (
          <form method="post">
            <input type="hidden" name="intent" value="set-status" />
            <input type="hidden" name="activityId" value={activity.id} />
            <input type="hidden" name="status" value="pending" />
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <button type="submit" className={statusActionFormClass()}>
              Reopen
            </button>
          </form>
        ) : (
          <form method="post">
            <input type="hidden" name="intent" value="set-status" />
            <input type="hidden" name="activityId" value={activity.id} />
            <input type="hidden" name="status" value="completed" />
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <button type="submit" className={statusActionFormClass()}>
              Mark complete
            </button>
          </form>
        )}
      </div>
    </article>
  );
}
