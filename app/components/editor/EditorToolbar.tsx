import { useState } from "react";
import type { Editor } from "@tiptap/react";

/**
 * Toolbar for the rich text editor. Every icon button has an accessible
 * label and announces its active state via aria-pressed. Buttons never
 * submit the surrounding form (type="button"); link entry uses a small
 * inline input so the flow works without dialogs.
 */
export function EditorToolbar({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState(false);
  const [linkHref, setLinkHref] = useState("");

  function startLinking() {
    if (editor.isActive("link")) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinking(false);
      return;
    }
    setLinkHref("");
    setLinking(true);
    editor.chain().focus().run();
  }

  function applyLink() {
    const href = linkHref.trim();
    if (!href) return;
    const chain = editor.chain().focus();
    if (editor.isActive("link")) {
      chain.extendMarkRange("link");
    }
    chain.setLink({ href }).run();
    setLinking(false);
  }

  function cancelLinking() {
    setLinking(false);
    editor.chain().focus().run();
  }

  const buttonClass =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-input px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

  return (
    <div
      className="flex flex-wrap items-center gap-1 border-b border-border bg-canvas p-2"
      role="group"
      aria-label="Formatting tools"
    >
      <button
        type="button"
        aria-label="Bold"
        aria-pressed={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`${buttonClass} ${editor.isActive("bold") ? "bg-primary/20 text-ink" : "text-muted hover:text-ink"}`}
      >
        <strong aria-hidden="true">B</strong>
      </button>
      <button
        type="button"
        aria-label="Italic"
        aria-pressed={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`${buttonClass} ${editor.isActive("italic") ? "bg-primary/20 text-ink" : "text-muted hover:text-ink"}`}
      >
        <em aria-hidden="true">I</em>
      </button>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
      {[1, 2, 3].map((level) => (
        <button
          key={level}
          type="button"
          aria-label={`Heading ${level}`}
          aria-pressed={editor.isActive("heading", { level })}
          onClick={() => editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()}
          className={`${buttonClass} ${editor.isActive("heading", { level }) ? "bg-primary/20 text-ink" : "text-muted hover:text-ink"}`}
        >
          <span aria-hidden="true">H{level}</span>
        </button>
      ))}
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
      <button
        type="button"
        aria-label="Bullet list"
        aria-pressed={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`${buttonClass} ${editor.isActive("bulletList") ? "bg-primary/20 text-ink" : "text-muted hover:text-ink"}`}
      >
        <span aria-hidden="true">•≡</span>
      </button>
      <button
        type="button"
        aria-label="Numbered list"
        aria-pressed={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`${buttonClass} ${editor.isActive("orderedList") ? "bg-primary/20 text-ink" : "text-muted hover:text-ink"}`}
      >
        <span aria-hidden="true">1≡</span>
      </button>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
      <button
        type="button"
        aria-label={editor.isActive("link") ? "Remove link" : "Add link"}
        aria-pressed={editor.isActive("link")}
        onClick={startLinking}
        className={`${buttonClass} ${editor.isActive("link") ? "bg-primary/20 text-ink" : "text-muted hover:text-ink"}`}
      >
        <span aria-hidden="true">🔗</span>
      </button>
      {linking && (
        <span className="flex items-center gap-1">
          <input
            type="url"
            value={linkHref}
            onChange={(event) => setLinkHref(event.target.value)}
            aria-label="Link URL"
            placeholder="https://…"
            className="w-48 rounded-input border border-border bg-surface px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
          <button
            type="button"
            onClick={applyLink}
            className="min-h-11 rounded-input bg-primary px-3 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Set
          </button>
          <button
            type="button"
            onClick={cancelLinking}
            className="min-h-11 rounded-input px-2 text-sm text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:text-ink"
          >
            Cancel
          </button>
        </span>
      )}
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
      <button
        type="button"
        aria-label="Undo"
        onClick={() => editor.chain().focus().undo().run()}
        className={`${buttonClass} text-muted hover:text-ink`}
      >
        <span aria-hidden="true">↩</span>
      </button>
      <button
        type="button"
        aria-label="Redo"
        onClick={() => editor.chain().focus().redo().run()}
        className={`${buttonClass} text-muted hover:text-ink`}
      >
        <span aria-hidden="true">↪</span>
      </button>
    </div>
  );
}
