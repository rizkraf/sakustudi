import { Link } from "react-router";

import { ActivityCard } from "~/components/activities/ActivityCard";
import type { ActivityWithCourse } from "~/modules/activities/activities.repository";

/**
 * Upcoming deadlines list for the dashboard: nearest non-completed
 * activities first, with a per-item quick action and an empty state that
 * points at the create flow.
 */
export function UpcomingDeadlines({
  activities,
  now,
  csrfToken,
}: {
  activities: ActivityWithCourse[];
  now: Date;
  csrfToken: string;
}) {
  if (activities.length === 0) {
    return (
      <section className="rounded-card border border-dashed border-border bg-surface px-6 py-8 text-center">
        <p className="text-sm text-muted">No upcoming deadlines in the next 7 days.</p>
        <Link
          to="/activities/new"
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:bg-primary/90"
        >
          Add an activity
        </Link>
      </section>
    );
  }

  return (
    <ul className="space-y-2">
      {activities.map((activity) => (
        <li key={activity.id}>
          <ActivityCard
            activity={activity}
            now={now}
            csrfToken={csrfToken}
            to={`/activities/${activity.id}`}
          />
        </li>
      ))}
    </ul>
  );
}
