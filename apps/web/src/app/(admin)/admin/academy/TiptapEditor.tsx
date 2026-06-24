"use client";

/**
 * Tiptap-backed rich text editor for academy lesson blocks.
 *
 * Why Tiptap: the rich_text block storage is HTML; Tiptap's editor produces
 * HTML directly via getHTML(). StarterKit covers bold/italic/headings/lists/
 * code/blockquotes. Link extension is added so authors can hyperlink without
 * shipping a separate UI for it.
 *
 * Why not full toolbar: keeping the surface minimal. Authors get the core
 * inline tools and structural nodes; if/when they need more, we extend.
 *
 * Persistence: the parent owns the value. On each editor update we emit the
 * HTML via onChange. The parent decides when to PATCH to the server.
 */

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";

interface Props {
  value:    string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export default function TiptapEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "tiptap-link", target: "_blank", rel: "noreferrer noopener" },
      }),
    ],
    content: value || "",
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "tiptap-prose",
        "data-placeholder": placeholder ?? "",
      },
    },
  });

  // Sync external value changes (e.g. when the parent loads a different block).
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return <div className="text-xs text-gray-500">Loading editor…</div>;

  const btn = (active: boolean) =>
    `px-2 py-1 text-xs rounded ${active ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"}`;

  return (
    <div className="rounded border border-gray-800 bg-gray-950 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-800 bg-gray-900/50 flex-wrap">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}      className={btn(editor.isActive("bold"))}>B</button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}    className={btn(editor.isActive("italic"))}><span style={{ fontStyle: "italic" }}>I</span></button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()}    className={btn(editor.isActive("strike"))}><s>S</s></button>
        <button type="button" onClick={() => editor.chain().focus().toggleCode().run()}      className={btn(editor.isActive("code"))}>{`< >`}</button>
        <span className="w-px h-4 bg-gray-800 mx-1" />
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive("heading", { level: 2 }))}>H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive("heading", { level: 3 }))}>H3</button>
        <span className="w-px h-4 bg-gray-800 mx-1" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}  className={btn(editor.isActive("bulletList"))}>•</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive("orderedList"))}>1.</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}  className={btn(editor.isActive("blockquote"))}>&ldquo;&rdquo;</button>
        <span className="w-px h-4 bg-gray-800 mx-1" />
        <button
          type="button"
          onClick={() => {
            const url = editor.getAttributes("link").href ?? "";
            const next = prompt("Link URL (leave empty to remove)", url);
            if (next === null) return;
            if (next === "") editor.chain().focus().unsetLink().run();
            else editor.chain().focus().extendMarkRange("link").setLink({ href: next }).run();
          }}
          className={btn(editor.isActive("link"))}
        >
          🔗
        </button>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} className="tiptap-shell" />

      <style>{`
        .tiptap-shell .ProseMirror {
          min-height: 110px;
          padding: 10px 12px;
          font-size: 12px;
          line-height: 1.55;
          color: #e5e7eb;
          outline: none;
        }
        .tiptap-shell .ProseMirror:focus { box-shadow: 0 0 0 1px #6366f1 inset; }
        .tiptap-shell .ProseMirror p { margin: 0 0 0.6em; }
        .tiptap-shell .ProseMirror h2 { font-size: 16px; font-weight: 600; margin: 0.8em 0 0.3em; }
        .tiptap-shell .ProseMirror h3 { font-size: 14px; font-weight: 600; margin: 0.8em 0 0.3em; }
        .tiptap-shell .ProseMirror ul, .tiptap-shell .ProseMirror ol { padding-left: 1.2em; margin: 0 0 0.6em; }
        .tiptap-shell .ProseMirror li { margin: 0.1em 0; }
        .tiptap-shell .ProseMirror blockquote { border-left: 2px solid #4b5563; padding-left: 10px; color: #9ca3af; margin: 0 0 0.6em; }
        .tiptap-shell .ProseMirror code { background: #1f2937; padding: 1px 4px; border-radius: 3px; font-size: 11px; }
        .tiptap-shell .ProseMirror .tiptap-link { color: #818cf8; text-decoration: underline; }
        .tiptap-shell .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: #4b5563;
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
