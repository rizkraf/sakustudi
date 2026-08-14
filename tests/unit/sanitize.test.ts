import { describe, expect, it } from "vitest";

import { extractPlainText } from "~/lib/content/plain-text";
import { sanitizeNoteHtml } from "~/lib/content/sanitize";

describe("sanitizeNoteHtml", () => {
  it("keeps toolbar tags and their text", () => {
    const html = "<p>Hello <strong>bold</strong> and <em>italic</em></p>";
    expect(sanitizeNoteHtml(html)).toBe(
      "<p>Hello <strong>bold</strong> and <em>italic</em></p>",
    );
  });

  it("keeps headings, lists, and line breaks", () => {
    const html =
      "<h2>Title</h2><ul><li>One</li></ul><ol><li>Two</li></ol><p>Line<br/>break</p>";
    expect(sanitizeNoteHtml(html)).toBe(
      "<h2>Title</h2><ul><li>One</li></ul><ol><li>Two</li></ol><p>Line<br />break</p>",
    );
  });

  it("removes script tags and their contents", () => {
    const html = "<p>safe</p><script>alert('xss')</script>";
    expect(sanitizeNoteHtml(html)).toBe("<p>safe</p>");
  });

  it("removes event handler attributes", () => {
    const html = '<p onclick="alert(1)" onmouseover="steal()">safe</p>';
    expect(sanitizeNoteHtml(html)).toBe("<p>safe</p>");
  });

  it("removes javascript: URLs from links", () => {
    const html = '<a href="javascript:alert(1)">click</a>';
    expect(sanitizeNoteHtml(html)).toBe("<a>click</a>");
  });

  it("removes iframes", () => {
    const html = '<iframe src="https://evil.example"></iframe><p>safe</p>';
    expect(sanitizeNoteHtml(html)).toBe("<p>safe</p>");
  });

  it("removes style tags, style attributes, and other unsafe tags", () => {
    const html =
      '<style>body{display:none}</style><p style="color:red">safe</p><img src="x" onerror="alert(1)">';
    expect(sanitizeNoteHtml(html)).toBe("<p>safe</p>");
  });

  it("keeps only the href attribute on links", () => {
    const html = '<a href="https://ut.ac.id" target="_blank" title="t">UT</a>';
    expect(sanitizeNoteHtml(html)).toBe('<a href="https://ut.ac.id">UT</a>');
  });

  it("allows http, https, and mailto schemes", () => {
    expect(sanitizeNoteHtml('<a href="http://a.example">a</a>')).toBe(
      '<a href="http://a.example">a</a>',
    );
    expect(sanitizeNoteHtml('<a href="https://a.example">a</a>')).toBe(
      '<a href="https://a.example">a</a>',
    );
    expect(sanitizeNoteHtml('<a href="mailto:help@ut.ac.id">mail</a>')).toBe(
      '<a href="mailto:help@ut.ac.id">mail</a>',
    );
  });

  it("disables protocol-relative URLs", () => {
    expect(sanitizeNoteHtml('<a href="//evil.example">a</a>')).toBe("<a>a</a>");
  });

  it("removes scripts embedded via encodings or other tags", () => {
    const html = '<a href="jav&#x61;script:alert(1)">a</a>';
    expect(sanitizeNoteHtml(html)).toBe("<a>a</a>");
  });

  it("handles nullish and empty input", () => {
    expect(sanitizeNoteHtml("")).toBe("");
    expect(sanitizeNoteHtml(undefined as unknown as string)).toBe("");
  });
});

describe("extractPlainText", () => {
  it("strips tags and keeps readable text", () => {
    expect(extractPlainText("<p>Hello <strong>world</strong></p>")).toBe(
      "Hello world",
    );
  });

  it("turns block boundaries into line breaks", () => {
    expect(extractPlainText("<h2>Title</h2><p>Body</p>")).toBe("Title\nBody");
  });

  it("decodes entities", () => {
    expect(extractPlainText("<p>Tom &amp; Jerry &lt;3</p>")).toBe("Tom & Jerry <3");
  });

  it("collapses whitespace", () => {
    expect(extractPlainText("<p>a   b</p><p>  c  </p>")).toBe("a b\nc");
  });

  it("returns empty for empty input", () => {
    expect(extractPlainText("")).toBe("");
  });
});
