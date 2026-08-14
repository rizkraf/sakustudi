const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
  "&apos;": "'",
};

/**
 * Extracts searchable plain text from sanitized note HTML: block elements
 * become newlines, remaining tags are stripped, entities are decoded, and
 * whitespace is collapsed. The result is what gets persisted to
 * `notes.content_text` and searched; raw HTML is never searched.
 */
export function extractPlainText(sanitizedHtml: string): string {
  if (!sanitizedHtml) return "";

  const withBreaks = sanitizedHtml
    .replace(/<(p|h1|h2|h3|li|br)\b[^>]*>/gi, "\n")
    .replace(/<\/?(p|h1|h2|h3|ul|ol|li|br)\b[^>]*>/gi, "");

  const decoded = withBreaks.replace(/&(amp|lt|gt|quot|#39|nbsp|apos);/g, (match) => {
    return ENTITIES[match] ?? match;
  });

  const text = decoded
    .replace(/<[^>]*>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
  return text.replace(/\n{3,}/g, "\n\n");
}
