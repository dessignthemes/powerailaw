"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Sparkles, ClipboardPaste, FileUp } from "lucide-react";
import { TEMPLATE_CATEGORIES, type TemplateField } from "@/lib/docTemplates/format";
import { readJson, input, btn } from "@/components/docTemplates/shared";

export type Draft = { name: string; category: string; description: string; body: string; fields: TemplateField[]; source: "ai" | "paste" | "upload" | "blank"; notes?: string };

const EXAMPLES = [
  "NJ attorney review letter for a buyer, disapproving the contract and proposing three changes",
  "Bargain and sale deed with covenant as to grantor's acts, New Jersey, husband and wife grantors",
  "Engagement letter for a flat-fee residential purchase, including what is not included",
  "Letter to the seller's attorney requesting repairs after the home inspection",
  "Affidavit of title for a seller in a NJ residential closing",
  "Demand letter for return of a security deposit under NJ law",
];

function Frame({ title, icon, onClose, busy, children }: { title: string; icon: React.ReactNode; onClose: () => void; busy: boolean; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  return (
    <div className="fixed inset-0 z-[60] bg-black/20 flex items-center justify-center px-4 py-8" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-[720px] max-h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-[17px] font-semibold flex items-center gap-2">
            {icon} {title}
          </h2>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 pb-6 text-[13.5px]">{children}</div>
      </div>
    </div>
  );
}

// "Create with AI": describe the document; the AI drafts a template with fields.
export function CreateWithAiModal({ onClose, onDraft }: { onClose: () => void; onDraft: (d: Draft) => void }) {
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      const d = await fetch("/api/doc-templates/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", prompt, category, state: "New Jersey" }) }).then(readJson);
      onDraft({ ...d, source: "ai" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Frame title="Create a template with AI" icon={<Sparkles size={17} />} onClose={onClose} busy={busy}>
      <p className="text-muted mb-3">Describe the document you need. The AI writes a complete draft with fill-in fields for names, addresses, dates and amounts. You review and change it before saving.</p>
      <textarea
        autoFocus
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
        placeholder="e.g. NJ attorney review letter for a buyer, disapproving the contract and proposing three changes"
        className={`${input} w-full resize-y`}
      />
      <div className="flex flex-wrap gap-1.5 mt-2">
        {EXAMPLES.map((ex) => (
          <button key={ex} onClick={() => setPrompt(ex)} className="text-[12px] bg-chip hover:bg-btn rounded-full px-2.5 py-1 text-left">
            {ex}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 mt-4">
        <span className="text-muted">Practice area</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
          <option value="">Let the AI decide</option>
          {TEMPLATE_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      {error && <div className="mt-3 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3">{error}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-full hover:bg-chip font-medium">
          Cancel
        </button>
        <button onClick={() => void go()} disabled={busy || prompt.trim().length < 8} className={btn}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {busy ? "Writing the draft… (20–60 s)" : "Create draft"}
        </button>
      </div>
    </Frame>
  );
}

// Paste text (or the text read from an uploaded Word/PDF): the AI turns the
// changeable parts into fields; or keep the text as-is and add fields by hand.
export function FromTextModal({ initialText = "", initialName = "", source, onClose, onDraft }: { initialText?: string; initialName?: string; source: "paste" | "upload"; onClose: () => void; onDraft: (d: Draft) => void }) {
  const [text, setText] = useState(initialText);
  const [name, setName] = useState(initialName);
  const [useAi, setUseAi] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      if (useAi) {
        const d = await fetch("/api/doc-templates/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "from_text", text, name }) }).then(readJson);
        onDraft({ ...d, source });
      } else {
        onDraft({ name: name.trim() || "New template", category: "", description: "", body: text.replace(/\r\n?/g, "\n"), fields: [], source });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Frame title={source === "upload" ? "Template from the uploaded file" : "Template from pasted text"} icon={source === "upload" ? <FileUp size={17} /> : <ClipboardPaste size={17} />} onClose={onClose} busy={busy}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name (optional)" className={`${input} w-full mb-2`} />
      <textarea
        autoFocus={!initialText}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        placeholder="Paste the text of a document or email here…"
        className={`${input} w-full resize-y font-mono text-[12.5px]`}
      />
      <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
        <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#5E6E8C]" />
        <span>
          <span className="font-medium">Let the AI find the fill-in parts</span>
          <span className="block text-muted text-[12.5px]">Names, addresses, dates, amounts and file numbers become fields like {"{{grantor_names}}"}; the wording stays as it is.</span>
        </span>
      </label>
      {error && <div className="mt-3 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3">{error}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-full hover:bg-chip font-medium">
          Cancel
        </button>
        <button onClick={() => void go()} disabled={busy || text.trim().length < 40} className={btn}>
          {busy && <Loader2 size={14} className="animate-spin" />} {busy ? "Working… (20–60 s)" : useAi ? "Make template with AI" : "Make template"}
        </button>
      </div>
    </Frame>
  );
}

// Upload a Word or PDF: reads its text, then the same as pasting.
export function UploadButton({ onText, className }: { onText: (text: string, name: string) => void; className: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const d = await fetch("/api/doc-templates/extract", { method: "POST", body: form }).then(readJson);
      onText(d.text, d.name);
    } catch (e) {
      setError((e as Error).message);
      alert((e as Error).message);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }
  return (
    <>
      <button onClick={() => ref.current?.click()} disabled={busy} className={className} title={error ?? "Read a Word or PDF file and turn it into a template"}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} {busy ? "Reading the file…" : "Upload Word or PDF"}
      </button>
      <input ref={ref} type="file" accept=".docx,.pdf,.txt" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
    </>
  );
}
