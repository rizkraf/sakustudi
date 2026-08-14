import { Link } from "react-router";

/**
 * Dashboard header summary: active term, course count, and the quick
 * action for creating an activity. Every value stays behind a visible
 * text label so status is never communicated by color or layout alone.
 */
export function DashboardSummary({
  activeTermName,
  courseCount,
  overdueCount,
  upcomingCount,
}: {
  activeTermName: string | null;
  courseCount: number;
  overdueCount: number;
  upcomingCount: number;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Active term
          </p>
          <p className="mt-1 text-lg font-semibold text-ink">
            {activeTermName ?? "No active term"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {courseCount} {courseCount === 1 ? "course" : "courses"} ·{" "}
            {upcomingCount} upcoming · {overdueCount} overdue
          </p>
        </div>
        <Link
          to="/activities/new"
          className="inline-flex min-h-11 items-center justify-center rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:bg-primary/90"
        >
          New activity
        </Link>
      </div>
      {!activeTermName && (
        <p className="mt-4 rounded-input border border-border bg-canvas px-3 py-4 text-sm text-muted">
          Create an academic term to start adding courses and activities.{" "}
          <Link
            to="/academic-terms"
            className="font-medium text-ink underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Set up your term
          </Link>
        </p>
      )}
    </section>
  );
}
