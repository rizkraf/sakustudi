import { Form } from "react-router";
import { useFormStatus } from "react-dom";

import type { UsefulLinkRow } from "~/modules/links/links.service";

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 rounded-input px-2 py-1 text-xs font-medium text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
    >
      Remove
    </button>
  );
}

function AddLinkButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-3 min-h-11 rounded-input bg-primary px-4 py-2 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Adding…" : label}
    </button>
  );
}

/**
 * A user's useful links for a surface (course detail, or global when no
 * courseId). Every external link opens in a new tab with
 * rel="noreferrer noopener". Includes a small add form; removing a link is a
 * per-row form posting intent=delete-link.
 */
export function UsefulLinks({
  links,
  courseId,
  csrfToken,
  heading = "Useful links",
  emptyText = "No useful links yet. Add the first one below.",
}: {
  links: UsefulLinkRow[];
  courseId: string | null;
  csrfToken: string;
  heading?: string;
  emptyText?: string;
}) {
  return (
    <section aria-labelledby="useful-links-heading" className="mt-8">
      <h2 id="useful-links-heading" className="text-sm font-semibold text-ink">
        {heading}
      </h2>

      {links.length === 0 ? (
        <p className="mt-3 rounded-card border border-dashed border-border bg-surface px-6 py-6 text-sm text-muted">
          {emptyText}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-card border border-border bg-surface">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm font-medium text-ink underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  {link.title}
                </a>
                {link.description && (
                  <p className="mt-0.5 text-sm text-muted">{link.description}</p>
                )}
                {link.category && (
                  <p className="mt-0.5 text-xs text-muted">#{link.category}</p>
                )}
              </div>
              {link.userId && (
                <Form method="post" className="shrink-0">
                  <input type="hidden" name="intent" value="delete-link" />
                  <input type="hidden" name="linkId" value={link.id} />
                  <input type="hidden" name="csrfToken" value={csrfToken} />
                  <DeleteButton />
                </Form>
              )}
            </li>
          ))}
        </ul>
      )}

      <Form method="post" className="mt-4 rounded-card border border-border bg-surface p-4">
        <input type="hidden" name="intent" value="add-link" />
        <input type="hidden" name="csrfToken" value={csrfToken} />
        {courseId && <input type="hidden" name="courseId" value={courseId} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Link title</span>
            <input
              name="title"
              type="text"
              required
              className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">URL</span>
            <input
              name="url"
              type="url"
              required
              placeholder="https://…"
              className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Description (optional)</span>
          <input
            name="description"
            type="text"
            className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
        </label>
        <AddLinkButton label="Add link" />
      </Form>
    </section>
  );
}
