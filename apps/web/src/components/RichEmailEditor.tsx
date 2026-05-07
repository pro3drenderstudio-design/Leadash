"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { useEffect, useRef, useState } from "react";

const VARIABLES = [
  { label: "First name",  token: "{{first_name}}" },
  { label: "Last name",   token: "{{last_name}}" },
  { label: "Company",     token: "{{company}}" },
  { label: "Title",       token: "{{title}}" },
  { label: "Email",       token: "{{email}}" },
  { label: "Website",     token: "{{website}}" },
  { label: "Full name",   token: "{{full_name}}" },
];

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minRows?: number;
}

function ToolbarButton({ active, disabled, onClick, title, children }: {
  active?: boolean; disabled?: boolean; onClick: () => void; title?: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded text-xs transition-colors
        ${active ? "bg-white/20 text-white" : "text-white/50 hover:text-white hover:bg-white/10"}
        ${disabled ? "opacity-30 cursor-not-allowed" : ""}
      `}
    >
      {children}
    </button>
  );
}

export default function RichEmailEditor({ value, onChange, placeholder = "Email body…", minRows = 6 }: Props) {
  const [showVars, setShowVars]       = useState(false);
  const [showLink, setShowLink]       = useState(false);
  const [linkUrl, setLinkUrl]         = useState("");
  const varsRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-blue-400 underline" } }),
    ],
    content: value,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-invert prose-sm max-w-none focus:outline-none min-h-[120px] text-white/90 text-sm leading-relaxed",
      },
    },
  });

  // Sync external value changes (e.g. template load, spintax rewrite)
  const lastExternal = useRef(value);
  useEffect(() => {
    if (!editor || value === lastExternal.current) return;
    lastExternal.current = value;
    const cur = editor.getHTML();
    if (cur !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (varsRef.current && !varsRef.current.contains(e.target as Node)) setShowVars(false);
      if (linkRef.current && !linkRef.current.contains(e.target as Node)) setShowLink(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function insertVariable(token: string) {
    editor?.commands.insertContent(token);
    setShowVars(false);
  }

  function applyLink() {
    if (!linkUrl.trim()) { editor?.chain().focus().extendMarkRange("link").unsetLink().run(); }
    else { editor?.chain().focus().extendMarkRange("link").setLink({ href: linkUrl.trim() }).run(); }
    setLinkUrl("");
    setShowLink(false);
  }

  const minHeight = `${Math.max(minRows, 4) * 1.6}rem`;

  return (
    <div className="bg-white/6 border border-white/10 rounded-lg focus-within:border-orange-500/40 transition-colors">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/8 flex-wrap">
        {/* Text formatting */}
        <ToolbarButton active={editor?.isActive("bold")}      onClick={() => editor?.chain().focus().toggleBold().run()}      title="Bold (Ctrl+B)"><strong>B</strong></ToolbarButton>
        <ToolbarButton active={editor?.isActive("italic")}    onClick={() => editor?.chain().focus().toggleItalic().run()}    title="Italic (Ctrl+I)"><em>I</em></ToolbarButton>
        <ToolbarButton active={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)"><span className="underline">U</span></ToolbarButton>
        <ToolbarButton active={editor?.isActive("strike")}    onClick={() => editor?.chain().focus().toggleStrike().run()}    title="Strikethrough"><span className="line-through">S</span></ToolbarButton>

        <div className="w-px h-4 bg-white/10 mx-1" />

        {/* Lists */}
        <ToolbarButton active={editor?.isActive("bulletList")}  onClick={() => editor?.chain().focus().toggleBulletList().run()}  title="Bullet list">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><circle cx="2" cy="4" r="1.2"/><rect x="5" y="3.3" width="9" height="1.4" rx="0.7"/><circle cx="2" cy="8" r="1.2"/><rect x="5" y="7.3" width="9" height="1.4" rx="0.7"/><circle cx="2" cy="12" r="1.2"/><rect x="5" y="11.3" width="9" height="1.4" rx="0.7"/></svg>
        </ToolbarButton>
        <ToolbarButton active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered list">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><text x="0.5" y="5.5" fontSize="5" fontFamily="monospace">1.</text><rect x="5" y="3.3" width="9" height="1.4" rx="0.7"/><text x="0.5" y="9.5" fontSize="5" fontFamily="monospace">2.</text><rect x="5" y="7.3" width="9" height="1.4" rx="0.7"/><text x="0.5" y="13.5" fontSize="5" fontFamily="monospace">3.</text><rect x="5" y="11.3" width="9" height="1.4" rx="0.7"/></svg>
        </ToolbarButton>

        <div className="w-px h-4 bg-white/10 mx-1" />

        {/* Link */}
        <div className="relative" ref={linkRef}>
          <ToolbarButton active={editor?.isActive("link")} onClick={() => { setLinkUrl(editor?.getAttributes("link").href ?? ""); setShowLink(s => !s); setShowVars(false); }} title="Insert link">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6.5 9.5a3.536 3.536 0 005 0l2-2a3.536 3.536 0 00-5-5l-1 1"/><path d="M9.5 6.5a3.536 3.536 0 00-5 0l-2 2a3.536 3.536 0 005 5l1-1"/></svg>
          </ToolbarButton>
          {showLink && (
            <div className="absolute left-0 top-8 z-50 bg-[#1e1e1e] border border-white/15 rounded-xl shadow-xl p-3 w-64">
              <input
                autoFocus
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } if (e.key === "Escape") setShowLink(false); }}
                placeholder="https://example.com"
                className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500/40 mb-2"
              />
              <div className="flex gap-2">
                <button type="button" onMouseDown={e => { e.preventDefault(); applyLink(); }} className="flex-1 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-medium rounded-lg transition-colors">Apply</button>
                {editor?.isActive("link") && (
                  <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetLink().run(); setShowLink(false); }} className="px-3 py-1.5 bg-white/6 hover:bg-white/10 text-white/60 text-xs rounded-lg transition-colors">Remove</button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-white/10 mx-1" />

        {/* Variables */}
        <div className="relative" ref={varsRef}>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); setShowVars(s => !s); setShowLink(false); }}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-violet-400/80 hover:text-violet-300 hover:bg-white/6 rounded transition-colors"
            title="Insert variable"
          >
            <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor"><path d="M4 2C2.9 2 2 2.9 2 4v8c0 1.1.9 2 2 2h1V12H4V4h1V2H4zm8 0h-1v2h1v8h-1v2h1c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
            Variables
          </button>
          {showVars && (
            <div className="absolute left-0 top-8 z-50 bg-[#1e1e1e] border border-white/15 rounded-xl shadow-xl py-1 min-w-44">
              {VARIABLES.map(v => (
                <button
                  key={v.token}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); insertVariable(v.token); }}
                  className="w-full text-left px-4 py-2 text-xs text-white/70 hover:text-white hover:bg-white/6 transition-colors flex justify-between items-center gap-3"
                >
                  <span>{v.label}</span>
                  <span className="text-white/30 font-mono text-[10px]">{v.token}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-white/10 mx-1" />

        {/* Clear formatting */}
        <ToolbarButton onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear formatting">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3l10 10M6 3h7M5.5 7.5H10M3 13h5"/></svg>
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <div className="px-3 py-2.5" style={{ minHeight }}>
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <p className="text-white/25 text-sm">{placeholder}</p>
        )}
      </div>

      <style>{`
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: rgba(255,255,255,0.25);
          pointer-events: none;
          height: 0;
        }
        .ProseMirror ul { list-style-type: disc; padding-left: 1.25rem; }
        .ProseMirror ol { list-style-type: decimal; padding-left: 1.25rem; }
        .ProseMirror li { margin-bottom: 0.125rem; }
        .ProseMirror p { margin: 0 0 0.5rem 0; }
        .ProseMirror p:last-child { margin-bottom: 0; }
      `}</style>
    </div>
  );
}
