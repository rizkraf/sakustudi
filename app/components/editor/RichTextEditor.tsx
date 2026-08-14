import { useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";

import { EditorToolbar } from "./EditorToolbar";

/**
 * Tiptap-based WYSIWYG editor. StarterKit + Link only, mirroring the server
 * sanitizer's allowed tags. `immediatelyRender: false` keeps SSR safe.
 * Content is read with editor.getHTML() on every update and pushed into a
 * hidden input so the surrounding form submits it as `name`.
 */
export function RichTextEditor({
  name,
  label = "Content",
  initialContent = "",
  disabled = false,
}: {
  name: string;
  label?: string;
  initialContent?: string;
  disabled?: boolean;
}) {
  const [html, setHtml] = useState(initialContent);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    content: initialContent,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        isAllowedUri: (url, { defaultValidate }) => {
          if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) {
            return defaultValidate(url);
          }
          return false;
        },
      }),
    ],
    onUpdate: ({ editor: instance }) => {
      setHtml(instance.getHTML());
    },
  });

  return (
    <div className="overflow-hidden rounded-input border border-border bg-canvas focus-within:ring-2 focus-within:ring-focus">
      {editor && <EditorToolbar editor={editor} />}
      <EditorContent
        editor={editor}
        aria-label={label}
        className="rich-text-editor"
      />
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
