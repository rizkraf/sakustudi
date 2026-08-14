import { Form } from "react-router";

/** Server-shaped attachment row for list rendering (sizes pre-formatted). */
export type AttachmentListItem = {
  id: string;
  filename: string;
  sizeLabel: string;
  mimeType: string | null;
};

/**
 * Attachment list with download and delete actions. Downloads stream through
 * the ownership-checked /files/:attachmentId handler; deletes post intent
 * "delete-attachment" to the current route action.
 */
export function AttachmentList({
  items,
  csrfToken,
  emptyLabel = "No attachments yet.",
}: {
  items: AttachmentListItem[];
  csrfToken: string;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="mt-3 rounded-input border border-dashed border-border bg-canvas px-3 py-4 text-center text-sm text-muted">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="mt-3 divide-y divide-border rounded-input border border-border bg-canvas">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-3 px-3 py-2.5"
        >
          <span className="min-w-0 flex-1">
            <a
              href={`/files/${item.id}`}
              download={item.filename}
              className="block truncate text-sm font-medium text-ink underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:underline"
              title={item.filename}
            >
              {item.filename}
            </a>
            <span className="mt-0.5 block text-xs text-muted">
              {item.sizeLabel}
              {item.mimeType ? ` · ${item.mimeType}` : ""}
            </span>
          </span>
          <Form method="post">
            <input type="hidden" name="intent" value="delete-attachment" />
            <input type="hidden" name="attachmentId" value={item.id} />
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <button
              type="submit"
              aria-label={`Delete ${item.filename}`}
              className="min-h-9 shrink-0 rounded-input border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Delete
            </button>
          </Form>
        </li>
      ))}
    </ul>
  );
}
