import { Link } from "react-router";

export function EmptyState({
  title,
  message,
  actionHref,
  actionLabel = "Get started",
}: {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-muted"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          className="size-6"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 6 9 7 9-7" />
        </svg>
      </span>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      {actionHref && (
        <Link
          to={actionHref}
          className="mt-2 inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-5 text-sm font-semibold text-ink hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {actionLabel}
        </Link>
      )}
    </section>
  );
}
