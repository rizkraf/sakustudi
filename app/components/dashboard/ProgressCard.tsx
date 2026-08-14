import { Link } from "react-router";

import type { CourseRow } from "~/modules/courses/courses.repository";

/**
 * Per-course progress card: name, code, and a percentage bar with a text
 * label (never color alone). The whole card links to the course page.
 */
export function ProgressCard({
  course,
  progress,
}: {
  course: CourseRow;
  progress: number;
}) {
  return (
    <Link
      to={`/courses/${course.id}`}
      className="block rounded-card border border-border bg-surface p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:border-primary/60"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="min-w-0 text-sm font-semibold text-ink">
          <span className="truncate">{course.name}</span>
          {course.code && (
            <span className="ml-2 font-mono text-xs font-normal text-muted">
              {course.code}
            </span>
          )}
        </p>
        <p className="text-xs text-muted">{progress}% complete</p>
      </div>
      <div
        role="progressbar"
        aria-label={`${course.name} progress`}
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-3 h-2 overflow-hidden rounded-full bg-canvas"
      >
        <div
          className="h-full rounded-full bg-success"
          style={{ width: `${progress}%` }}
        />
      </div>
    </Link>
  );
}
