"use client";

import { useEffect, useRef } from "react";
import { useEditor, useEditorState, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { Bold, Italic, Strikethrough, Heading1, Heading2, Heading3, List, ListOrdered, ListChecks, Quote, Code, SquareCode, Link2, ImageIcon, Undo2, Redo2 } from "lucide-react";

// Rich text for task descriptions: bold, italic, headings, lists, checklists,
// quotes, code, links and images. Stored as HTML; older plain-text descriptions
// are shown as paragraphs (with their links clickable) and saved as HTML once edited.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
export const looksLikeHtml = (s: string) => /<(p|h[1-6]|ul|ol|li|blockquote|pre|strong|em|s|code|a|br|div|img)\b[^>]*>/i.test(s);

export function toEditorHtml(text: string) {
  if (!text) return "";
  if (looksLikeHtml(text)) return text;
  return text
    .split(/\r?\n/)
    .map((line) => `<p>${esc(line).replace(/(https?:\/\/[^\s<>()]+)/g, (u) => `<a href="${u}">${u}</a>`)}</p>`)
    .join("");
}

// Plain text of a description (for previews, AI, email).
export function descriptionText(s: string) {
  if (!looksLikeHtml(s)) return s;
  return s
    .replace(/<\/(p|h[1-6]|li|blockquote|pre|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function Btn({ on, label, onClick, children, disabled }: { on?: boolean; label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      // Keep the text selection while clicking the toolbar.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-35 ${on ? "bg-btn text-ink" : "text-muted hover:bg-chip hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      code: e.isActive("code"),
      codeBlock: e.isActive("codeBlock"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();
  const link = () => {
    const prev = (editor.getAttributes("link").href as string | undefined) ?? "";
    const url = window.prompt("Link address (leave empty to remove the link)", prev || "https://");
    if (url === null) return;
    const clean = url.trim();
    if (!clean || clean === "https://") return void c().extendMarkRange("link").unsetLink().run();
    const href = /^(https?:|mailto:|tel:)/i.test(clean) ? clean : `https://${clean}`;
    if (editor.state.selection.empty && !editor.isActive("link")) {
      c().insertContent(`<a href="${esc(href)}">${esc(clean)}</a> `).run();
    } else c().extendMarkRange("link").setLink({ href }).run();
  };
  const image = () => {
    const url = window.prompt("Image web address (https://…)", "https://");
    if (!url || !/^https:\/\/\S+$/i.test(url.trim())) return;
    c().setImage({ src: url.trim() }).run();
  };
  return (
    <div className="flex items-center gap-1 flex-wrap mb-3 border-b border-line pb-3">
      <Btn label="Bold (Ctrl/⌘ B)" on={st.bold} onClick={() => c().toggleBold().run()}>
        <Bold size={14} strokeWidth={1.75} />
      </Btn>
      <Btn label="Italic (Ctrl/⌘ I)" on={st.italic} onClick={() => c().toggleItalic().run()}>
        <Italic size={14} strokeWidth={1.75} />
      </Btn>
      <Btn label="Strikethrough" on={st.strike} onClick={() => c().toggleStrike().run()}>
        <Strikethrough size={14} strokeWidth={1.75} />
      </Btn>
      <span className="w-px h-4 bg-line mx-1" />
      <Btn label="Heading 1" on={st.h1} onClick={() => c().toggleHeading({ level: 1 }).run()}>
        <Heading1 size={14} strokeWidth={1.75} />
      </Btn>
      <Btn label="Heading 2" on={st.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}>
        <Heading2 size={14} strokeWidth={1.75} />
      </Btn>
      <Btn label="Heading 3" on={st.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}>
        <Heading3 size={14} strokeWidth={1.75} />
      </Btn>
      <span className="w-px h-4 bg-line mx-1" />
      <Btn label="Bulleted list" on={st.bullet} onClick={() => c().toggleBulletList().run()}>
        <List size={14} strokeWidth={1.75} />
      </Btn>
      <Btn label="Numbered list" on={st.ordered} onClick={() => c().toggleOrderedList().run()}>
        <ListOrdered size={14} strokeWidth={1.75} />
      </Btn>
      <Btn label="Checklist" on={st.task} onClick={() => c().toggleTaskList().run()}>
        <ListChecks size={14} strokeWidth={1.75} />
      </Btn>
      <Btn label="Quote" on={st.quote} onClick={() => c().toggleBlockquote().run()}>
        <Quote size={14} strokeWidth={1.75} />
      </Btn>
      <span className="w-px h-4 bg-line mx-1" />
      <Btn label="Code" on={st.code} onClick={() => c().toggleCode().run()}>
        <Code size={14} strokeWidth={1.75} />
      </Btn>
      <Btn label="Code block" on={st.codeBlock} onClick={() => c().toggleCodeBlock().run()}>
        <SquareCode size={14} strokeWidth={1.75} />
      </Btn>
      <Btn label="Link" on={st.link} onClick={link}>
        <Link2 size={14} strokeWidth={1.75} />
      </Btn>
      <Btn label="Image (by web address)" onClick={image}>
        <ImageIcon size={14} strokeWidth={1.75} />
      </Btn>
      <span className="w-px h-4 bg-line mx-1" />
      <Btn label="Undo (Ctrl/⌘ Z)" disabled={!st.canUndo} onClick={() => c().undo().run()}>
        <Undo2 size={14} strokeWidth={1.75} />
      </Btn>
      <Btn label="Redo" disabled={!st.canRedo} onClick={() => c().redo().run()}>
        <Redo2 size={14} strokeWidth={1.75} />
      </Btn>
    </div>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder = "Add more detail...",
  className = "",
}: {
  value: string;
  onChange: (html: string) => void;
  onBlur?: (html: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const last = useRef(value);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      Placeholder.configure({ placeholder }),
    ],
    content: toEditorHtml(value),
    editorProps: { attributes: { class: "lp-editor outline-none", "aria-label": "Task description" } },
    onUpdate: ({ editor: e }) => {
      const html = e.isEmpty ? "" : e.getHTML();
      last.current = html;
      onChange(html);
    },
    onBlur: ({ editor: e }) => onBlur?.(e.isEmpty ? "" : e.getHTML()),
  });

  // A different task / value from outside: show it.
  useEffect(() => {
    if (!editor || value === last.current) return;
    last.current = value;
    editor.commands.setContent(toEditorHtml(value), { emitUpdate: false });
  }, [value, editor]);

  return (
    <div>
      {editor && <Toolbar editor={editor} />}
      <div
        className={`overflow-y-auto cursor-text ${className}`}
        onClick={(e) => {
          // Clicking a link opens it (Ctrl/⌘-click not needed); elsewhere just focus.
          const a = (e.target as HTMLElement).closest("a");
          if (a?.getAttribute("href") && (e.metaKey || e.ctrlKey || !editor?.isFocused)) window.open(a.getAttribute("href")!, "_blank", "noopener");
          else if (!(e.target as HTMLElement).closest(".lp-editor")) editor?.chain().focus("end").run();
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
