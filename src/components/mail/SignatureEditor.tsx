"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, useEditorState, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TextStyle, Color, FontFamily, FontSize, BackgroundColor } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, List, Link2, ImagePlus, Minus, RemoveFormatting, Undo2, Redo2, Loader2, Highlighter, Baseline, Check } from "lucide-react";
import { SIGNATURE_FONT, SIGNATURE_SIZE } from "@/lib/mail/signatureHtml";
import SignaturePreview from "@/components/mail/SignaturePreview";

// Email signature editor (Settings → Mail automation): fonts, sizes, colours,
// links, alignment and pictures (a logo is uploaded and served from lawpower.ai
// so it shows in recipients' mail). "HTML" shows the source for anyone pasting
// a signature made elsewhere; layouts the visual editor can't show (tables)
// are kept as HTML.

// Fonts every mail app has (or falls back from gracefully).
export const SIGNATURE_FONTS: { label: string; value: string }[] = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Calibri", value: "Calibri, Carlito, Arial, sans-serif" },
  { label: "Cambria", value: "Cambria, Georgia, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  { label: "Garamond", value: "Garamond, 'EB Garamond', Georgia, serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Segoe UI", value: "'Segoe UI', Helvetica, Arial, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Verdana, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
];
const SIZES = ["10", "11", "12", "13", "14", "16", "18", "20", "24", "28", "32"];
const COLORS = ["#222222", "#595959", "#8C8C8C", "#1F3A93", "#0563C1", "#2E7D32", "#C62828", "#E65100", "#6A1B9A", "#B8860B"];
const HIGHLIGHTS = ["#FFF59D", "#C8E6C9", "#BBDEFB", "#F8BBD0", "#FFE0B2", "#E0E0E0"];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
// Layout the visual editor would flatten: keep such a signature as HTML.
export const needsHtmlMode = (html: string) => /<(table|td|tr|div|span\s[^>]*display\s*:\s*(inline-)?block)\b/i.test(html);
// Older plain-text signatures: one paragraph per line.
const toHtml = (v: string) => (!v ? "" : /<[a-z][^>]*>/i.test(v) ? v : v.split(/\r?\n/).map((l) => `<p>${esc(l)}</p>`).join(""));
const fontLabel = (v?: string) => (v ? SIGNATURE_FONTS.find((f) => f.value.split(",")[0].replace(/'/g, "").trim().toLowerCase() === v.split(",")[0].replace(/['"]/g, "").trim().toLowerCase())?.value ?? "" : "");

function Btn({ on, label, onClick, children, disabled }: { on?: boolean; label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-35 ${on ? "bg-btn text-ink" : "text-muted hover:bg-chip hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="w-px h-5 bg-line mx-0.5" />;

function Swatches({ label, icon, colors, current, onPick, onClear, clearLabel }: { label: string; icon: React.ReactNode; colors: string[]; current?: string; onPick: (c: string) => void; onClear: () => void; clearLabel: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className={`h-8 px-1.5 rounded-lg flex flex-col items-center justify-center gap-[2px] transition-colors ${open ? "bg-btn text-ink" : "text-muted hover:bg-chip hover:text-ink"}`}
      >
        {icon}
        <span className="block w-4 h-[3px] rounded-full" style={{ background: current || "transparent", boxShadow: current ? undefined : "inset 0 0 0 1px #D1D7E0" }} />
      </button>
      {open && (
        <div className="absolute z-20 left-0 top-9 bg-white border border-line rounded-xl shadow-lg p-2.5 w-[188px]" onMouseDown={(e) => e.preventDefault()}>
          <div className="grid grid-cols-5 gap-1.5">
            {colors.map((c) => (
              <button key={c} type="button" title={c} aria-label={`${label}: ${c}`} onClick={() => (onPick(c), setOpen(false))} className="w-7 h-7 rounded-md flex items-center justify-center border border-black/10" style={{ background: c }}>
                {current?.toLowerCase() === c.toLowerCase() && <Check size={13} className={colors === HIGHLIGHTS ? "text-ink" : "text-white"} />}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-line">
            <label className="flex items-center gap-1.5 text-[12px] text-muted cursor-pointer hover:text-ink">
              <input type="color" value={current && /^#[0-9a-f]{6}$/i.test(current) ? current : "#222222"} onChange={(e) => onPick(e.target.value)} className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer" />
              Other…
            </label>
            <button type="button" onClick={() => (onClear(), setOpen(false))} className="text-[12px] text-muted underline underline-offset-2 hover:text-ink">
              {clearLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Toolbar({ editor, onPicture, uploading }: { editor: Editor; onPicture: () => void; uploading: boolean }) {
  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const ts = e.getAttributes("textStyle") as { fontFamily?: string; fontSize?: string; color?: string; backgroundColor?: string };
      return {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        left: e.isActive({ textAlign: "left" }),
        center: e.isActive({ textAlign: "center" }),
        right: e.isActive({ textAlign: "right" }),
        bullet: e.isActive("bulletList"),
        link: e.isActive("link"),
        font: fontLabel(ts.fontFamily),
        size: ts.fontSize ? String(parseInt(ts.fontSize, 10)) : "",
        color: ts.color ?? "",
        bg: ts.backgroundColor ?? "",
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });
  const c = () => editor.chain().focus();
  const link = () => {
    const prev = (editor.getAttributes("link").href as string | undefined) ?? "";
    const url = window.prompt("Link address — a website, an email (name@firm.com) or a phone number. Leave empty to remove the link.", prev || "https://");
    if (url === null) return;
    const clean = url.trim();
    if (!clean || clean === "https://") return void c().extendMarkRange("link").unsetLink().run();
    const href = /^(https?:|mailto:|tel:)/i.test(clean) ? clean : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? `mailto:${clean}` : /^[+\d][\d\s().-]{6,}$/.test(clean) ? `tel:${clean.replace(/[^\d+]/g, "")}` : `https://${clean}`;
    if (editor.state.selection.empty && !editor.isActive("link")) c().insertContent(`<a href="${esc(href)}">${esc(clean)}</a> `).run();
    else c().extendMarkRange("link").setLink({ href }).run();
  };
  const select = "h-8 bg-white border border-line rounded-lg px-2 text-[13px] outline-none hover:border-btn-ring focus:border-btn-ring";
  return (
    <div className="flex items-center gap-1 flex-wrap px-2.5 py-2 border-b border-line bg-cream rounded-t-xl">
      <select
        aria-label="Font"
        title="Font"
        value={st.font}
        onChange={(e) => (e.target.value ? c().setFontFamily(e.target.value).run() : c().unsetFontFamily().run())}
        className={`${select} w-[136px]`}
      >
        <option value="">Default font</option>
        {SIGNATURE_FONTS.map((f) => (
          <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>
            {f.label}
          </option>
        ))}
      </select>
      <select aria-label="Text size" title="Text size" value={st.size} onChange={(e) => (e.target.value ? c().setFontSize(`${e.target.value}px`).run() : c().unsetFontSize().run())} className={`${select} w-[70px]`}>
        <option value="">Size</option>
        {SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <Sep />
      <Btn label="Bold (Ctrl/⌘ B)" on={st.bold} onClick={() => c().toggleBold().run()}>
        <Bold size={15} strokeWidth={2} />
      </Btn>
      <Btn label="Italic (Ctrl/⌘ I)" on={st.italic} onClick={() => c().toggleItalic().run()}>
        <Italic size={15} strokeWidth={1.75} />
      </Btn>
      <Btn label="Underline (Ctrl/⌘ U)" on={st.underline} onClick={() => c().toggleUnderline().run()}>
        <Underline size={15} strokeWidth={1.75} />
      </Btn>
      <Btn label="Strikethrough" on={st.strike} onClick={() => c().toggleStrike().run()}>
        <Strikethrough size={15} strokeWidth={1.75} />
      </Btn>
      <Swatches label="Text colour" icon={<Baseline size={15} strokeWidth={1.75} />} colors={COLORS} current={st.color} onPick={(v) => c().setColor(v).run()} onClear={() => c().unsetColor().run()} clearLabel="Default" />
      <Swatches label="Highlight" icon={<Highlighter size={15} strokeWidth={1.75} />} colors={HIGHLIGHTS} current={st.bg} onPick={(v) => c().setBackgroundColor(v).run()} onClear={() => c().unsetBackgroundColor().run()} clearLabel="None" />
      <Sep />
      <Btn label="Align left" on={st.left} onClick={() => c().setTextAlign("left").run()}>
        <AlignLeft size={15} strokeWidth={1.75} />
      </Btn>
      <Btn label="Center" on={st.center} onClick={() => c().setTextAlign("center").run()}>
        <AlignCenter size={15} strokeWidth={1.75} />
      </Btn>
      <Btn label="Align right" on={st.right} onClick={() => c().setTextAlign("right").run()}>
        <AlignRight size={15} strokeWidth={1.75} />
      </Btn>
      <Btn label="Bulleted list" on={st.bullet} onClick={() => c().toggleBulletList().run()}>
        <List size={15} strokeWidth={1.75} />
      </Btn>
      <Sep />
      <Btn label="Link (website, email or phone)" on={st.link} onClick={link}>
        <Link2 size={15} strokeWidth={1.75} />
      </Btn>
      <Btn label="Add a picture (logo)" disabled={uploading} onClick={onPicture}>
        {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} strokeWidth={1.75} />}
      </Btn>
      <Btn label="Divider line" onClick={() => c().setHorizontalRule().run()}>
        <Minus size={15} strokeWidth={1.75} />
      </Btn>
      <Btn label="Clear formatting" onClick={() => c().unsetAllMarks().unsetTextAlign().run()}>
        <RemoveFormatting size={15} strokeWidth={1.75} />
      </Btn>
      <Sep />
      <Btn label="Undo (Ctrl/⌘ Z)" disabled={!st.canUndo} onClick={() => c().undo().run()}>
        <Undo2 size={15} strokeWidth={1.75} />
      </Btn>
      <Btn label="Redo" disabled={!st.canRedo} onClick={() => c().redo().run()}>
        <Redo2 size={15} strokeWidth={1.75} />
      </Btn>
    </div>
  );
}

async function uploadPicture(file: File): Promise<{ url: string; width: number | null }> {
  if (!/^image\/(png|jpeg|gif)$/.test(file.type)) throw new Error("Use a PNG, JPG or GIF picture (those show in every mail app).");
  if (file.size > 2 * 1024 * 1024) throw new Error("That picture is over 2 MB. Use a smaller one (a logo is usually under 200 KB).");
  const natural = await new Promise<number | null>((res) => {
    const u = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => (res(img.naturalWidth || null), URL.revokeObjectURL(u));
    img.onerror = () => (res(null), URL.revokeObjectURL(u));
    img.src = u;
  });
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/me/signature/image", { method: "POST", body: fd });
  const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!r.ok || !d.url) throw new Error(d.error ?? "Couldn't upload the picture. Please try again.");
  // Big pictures start at a logo-friendly width; drag a corner to resize.
  return { url: d.url, width: natural ? Math.min(natural, 320) : 240 };
}

// `value` is the starting signature (mount the editor once it has loaded).
export default function SignatureEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const [mode, setMode] = useState<"visual" | "html">(() => (needsHtmlMode(value) ? "html" : "visual"));
  const [source, setSource] = useState(value);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const insertFiles = async (files: File[], at?: number) => {
    const e = editorRef.current;
    if (!e || !files.length) return;
    setUploading(true);
    setNotice(null);
    try {
      for (const f of files) {
        const { url, width } = await uploadPicture(f);
        // Never replace selected text: the picture goes after it.
        const chain = e.chain().focus().setTextSelection(e.state.selection.to);
        (at != null ? chain.insertContentAt(at, { type: "image", attrs: { src: url, width } }) : chain.setImage({ src: url, width: width ?? undefined })).run();
      }
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, code: false, blockquote: false, link: { openOnClick: false, autolink: true, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } } }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      BackgroundColor,
      TextAlign.configure({ types: ["paragraph"] }),
      Image.configure({ inline: true, resize: { enabled: true, directions: ["top-left", "top-right", "bottom-left", "bottom-right"], minWidth: 24, minHeight: 12, alwaysPreserveAspectRatio: true } }),
    ],
    content: needsHtmlMode(value) ? "" : toHtml(value),
    editorProps: {
      attributes: { class: "lp-sig outline-none", "aria-label": "Signature", style: `font-family:${SIGNATURE_FONT};font-size:${SIGNATURE_SIZE}` },
      // Pictures copied from Outlook point to files on that computer, which
      // nobody else can see: leave those out and ask for the picture instead.
      transformPastedHTML: (html) => {
        let dropped = false;
        const out = html.replace(/<img\b[^>]*>/gi, (tag) => {
          const src = /\ssrc\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1] ?? "";
          if (/^https:\/\//i.test(src)) return tag;
          dropped = true;
          return "";
        });
        if (dropped) setNotice("A picture in what you pasted can't be used from there. Add it with the picture button (or paste the picture on its own).");
        return out;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!files.length || event.clipboardData?.getData("text/html")) return false;
        event.preventDefault();
        void insertFiles(files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertFiles(files, pos);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.isEmpty ? "" : e.getHTML());
    },
  });
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const switchTo = (m: "visual" | "html") => {
    if (m === mode || !editor) return;
    if (m === "html") {
      setSource(editor.isEmpty ? "" : editor.getHTML().replace(/<\/(p|ul|ol|li|hr)>/g, "</$1>\n").replace(/<hr>/g, "<hr>\n"));
    } else {
      if (needsHtmlMode(source) && !window.confirm("This signature uses a layout (such as a table) that the visual editor can't show. Switching simplifies it to plain lines. Continue?")) return;
      editor.commands.setContent(toHtml(source), { emitUpdate: true });
    }
    setNotice(null);
    setMode(m);
  };

  const tab = (m: "visual" | "html", label: string) => (
    <button type="button" onClick={() => switchTo(m)} aria-pressed={mode === m} className={`px-3 py-1 rounded-full text-[12.5px] font-medium transition-colors ${mode === m ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
      {label}
    </button>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-[14.5px] font-semibold">Signature</div>
        <div className="flex items-center bg-chip rounded-full p-0.5" role="group" aria-label="Editor view">
          {tab("visual", "Visual")}
          {tab("html", "HTML")}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = Array.from(e.target.files ?? []);
          e.target.value = "";
          void insertFiles(f);
        }}
      />
      {mode === "visual" ? (
        <div className="bg-white border border-line rounded-xl focus-within:border-btn-ring transition-colors">
          {editor && <Toolbar editor={editor} uploading={uploading} onPicture={() => fileRef.current?.click()} />}
          <div className="px-4 py-3.5 min-h-[180px] max-h-[460px] overflow-y-auto cursor-text" onClick={(e) => !(e.target as HTMLElement).closest(".lp-sig") && editor?.chain().focus("end").run()}>
            <EditorContent editor={editor} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <textarea
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              onChange(e.target.value);
            }}
            spellCheck={false}
            rows={10}
            aria-label="Signature HTML"
            placeholder={'<p><b>Your Name</b><br>Title</p>\n<p><img src="https://…/logo.png" width="240"></p>'}
            className="w-full bg-white border border-line rounded-xl px-4 py-3.5 text-[12.5px] leading-relaxed font-mono outline-none resize-y focus:border-btn-ring placeholder:text-muted-light"
          />
          <div>
            <div className="text-[12.5px] font-semibold text-muted mb-1.5">Preview</div>
            <div className="border border-line rounded-xl px-3 py-2.5 bg-white">
              {source.trim() ? <SignaturePreview html={source} /> : <div className="text-[13px] text-muted-light py-2">Nothing yet.</div>}
            </div>
          </div>
        </div>
      )}
      {notice && <div className="mt-2 rounded-xl bg-[#FFF4E5] text-[#8A4B14] px-3.5 py-2 text-[12.5px]">{notice}</div>}
      <p className="text-[12.5px] text-muted mt-2">
        Tip: copy your signature from an email in Outlook and paste it here. Add the logo with the picture button and drag its corner to resize it. Links work in sent emails.
      </p>
    </div>
  );
}
