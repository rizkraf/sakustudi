import sanitizeHtml from "sanitize-html";

/**
 * Tags produced by the Tiptap toolbar: paragraphs, headings (1-3), emphasis,
 * strong, unordered/ordered lists with items, links, and line breaks.
 */
const ALLOWED_TAGS = [
  "p",
  "h1",
  "h2",
  "h3",
  "strong",
  "em",
  "b",
  "i",
  "ul",
  "ol",
  "li",
  "a",
  "br",
];

const ALLOWED_SCHEMES = ["http", "https", "mailto"];

/**
 * Sanitizes note HTML before it is persisted. Only the toolbar's tags are
 * allowed; `href` is the only attribute kept, restricted to http/https/mailto
 * schemes (protocol-relative URLs are disabled). Scripts, event handlers,
 * iframes, styles, and every other tag/attribute are stripped.
 */
export function sanitizeNoteHtml(dirtyHtml: string): string {
  return sanitizeHtml(dirtyHtml ?? "", {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href"],
    },
    allowedSchemes: ALLOWED_SCHEMES,
    allowedSchemesByTag: {
      a: ALLOWED_SCHEMES,
    },
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
  });
}
