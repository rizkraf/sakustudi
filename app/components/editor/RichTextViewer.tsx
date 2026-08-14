import { useMemo } from "react";

import { sanitizeNoteHtml } from "~/lib/content/sanitize";

/**
 * Read-only renderer for persisted note HTML. Content is sanitized again on
 * the client as defense in depth: the server sanitizes at write time, this
 * guards the render path even if a row was ever written by another route.
 */
export function RichTextViewer({ html }: { html: string | null }) {
  const safeHtml = useMemo(() => sanitizeNoteHtml(html ?? ""), [html]);
  if (!safeHtml) {
    return (
      <p className="text-sm text-muted" data-testid="empty-note-content">
        This note has no content yet.
      </p>
    );
  }
  return <div className="rich-text" dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}
