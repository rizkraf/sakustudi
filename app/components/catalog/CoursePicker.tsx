import { useMemo, useState } from "react";

import type { CourseCatalogItem } from "~/modules/catalog/catalog.service";

/**
 * Keyboard-operable catalog course picker. Checkboxes are native form
 * controls named `name`, so the selection is submitted as repeated form
 * values and no controlled state is needed. The search box filters the
 * loaded list client-side.
 */
export function CoursePicker({
  courses,
  name,
  label,
  emptyMessage = "No courses found.",
  searchPlaceholder = "Search by name or code",
}: {
  courses: CourseCatalogItem[];
  name: string;
  label: string;
  emptyMessage?: string;
  searchPlaceholder?: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return courses;
    return courses.filter(
      (course) =>
        course.name.toLowerCase().includes(term) ||
        course.code.toLowerCase().includes(term),
    );
  }, [courses, query]);

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{label}</legend>

      <label className="block">
        <span className="sr-only">{searchPlaceholder}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-input border border-border bg-canvas px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </label>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="rounded-input border border-border bg-canvas px-3 py-4 text-center text-sm text-muted">
            {emptyMessage}
          </p>
        )}
        {filtered.map((course) => (
          <label
            key={course.id}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-input border border-border bg-canvas px-3 py-2 focus-within:ring-2 focus-within:ring-focus"
          >
            <input
              type="checkbox"
              name={name}
              value={course.id}
              className="mt-1 size-4"
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium text-ink">{course.name}</span>
                <span className="font-mono text-xs text-muted">
                  {course.code}
                </span>
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                {course.credits} credits
                {course.studyProgramName
                  ? ` · ${course.studyProgramName} (${course.studyProgramCode})`
                  : ""}
              </span>
              {course.description && (
                <span className="mt-0.5 block text-xs text-muted">
                  {course.description}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
