import { Link } from "react-router";

export function ErrorState({
  title,
  message,
  retryHref,
}: {
  title: string;
  message: string;
  retryHref?: string;
}) {
  return (
    <section
      role="alert"
      className="flex flex-col items-center gap-3 rounded-card border border-danger/30 bg-danger/10 px-6 py-12 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-danger/15 text-danger"
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
          <path d="M12 3.5 22 20H2Z" />
          <path d="M12 10v4" />
          <path d="M12 17.2v.1" />
        </svg>
      </span>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      {retryHref && (
        <Link
          to={retryHref}
          className="mt-2 inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-surface px-5 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Try again
        </Link>
      )}
    </section>
  );
}
