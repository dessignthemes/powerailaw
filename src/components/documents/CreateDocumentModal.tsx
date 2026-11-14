"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, LayoutTemplate, FilePlus2, Sparkles, Search, ArrowLeft, CheckCircle2 } from "lucide-react";
import type { Matter } from "@/components/NewMatterModal";
import type { DocTemplate } from "@/lib/docTemplates/format";
import { readJson, input, btn, chip } from "@/components/docTemplates/shared";
import UseForMatterModal from "@/components/docTemplates/UseForMatterModal";
import PreviewText from "@/components/docTemplates/PreviewText";

// "Create document" on a matter's Documents tab, linked to AI Templates:
//  • From a template: pick one of the firm's templates (or a sample); the AI can
//    fill it from the matter, then it's saved as a Word document on the matter.
//  • Blank: write it here; saved as a Word document.
//  • Write it with AI: say what you need; the AI drafts it from the matter's
//    facts (uses AI credits, only when you click Write draft). You check and edit it.
type Mode = "choose" | "template" | "blank" | "ai";

export default function CreateDocumentModal({ matter, matters, onClose, onCreated }: { matter: Matter; matters: Matter[]; onClose: () => void; onCreated: () => void }) {
  const [mode, setMode] = useState<Mode>("choose");
  const [templates, setTemplates] = useState<DocTemplate[] | null>(null);
  const [q, setQ] = useState("");
  const [using, setUsing] = useState<DocTemplate | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [instruction, setInstruction] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<"draft" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && !using && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, using, onClose]);

  useEffect(() => {
    if (mode !== "template" || templates) return;
    let live = true;
    fetch("/api/doc-templates")
      .then(readJson)
      .then((d) => live && setTemplates([...((d.templates ?? []) as DocTemplate[]), ...((d.samples ?? []) as DocTemplate[])]))
      .catch((e: Error) => live && (setError(e.message), setTemplates([])));
    return () => {
      live = false;
    };
  }, [mode, templates]);

  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (templates ?? []).filter((t) => words.every((w) => `${t.name} ${t.category} ${t.description}`.toLowerCase().includes(w)));
  }, [templates, q]);

  async function draft() {
    setBusy("draft");
    setError(null);
    try {
      const d = await fetch("/api/doc-templates/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draft", instruction, matterId: matter.id }) }).then(readJson);
      setTitle(d.title ?? "Draft");
      setBody(d.body ?? "");
      setNotes(d.notes ?? "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function save() {
    setBusy("save");
    setError(null);
    try {
      const d = await fetch("/api/doc-templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, values: {}, title: title.trim() || "Untitled", matterId: matter.id, templateName: mode === "ai" ? "Written with AI" : "Blank document" }),
      }).then(readJson);
      setSaved(d.fileName ?? title);
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (using) {
    return (
      <UseForMatterModal
        template={{ id: using.id, name: using.name, body: using.body, fields: using.fields, format: using.format }}
        matters={matters}
        initialMatterId={matter.id}
        onCreated={onCreated}
        onClose={() => setUsing(null)}
      />
    );
  }

  const option = (m: Mode, icon: React.ReactNode, label: string, sub: string) => (
    <button onClick={() => setMode(m)} className="w-full flex items-start gap-3 text-left rounded-2xl border border-[#E8E6E2] bg-[#FCFCFC] hover:bg-[#F3F2F0] px-4 py-3.5 transition-colors">
      <span className="w-9 h-9 rounded-xl bg-[#F3F2F0] flex items-center justify-center flex-shrink-0">{icon}</span>
      <span>
        <span className="block text-[14.5px] font-semibold">{label}</span>
        <span className="block text-[12.5px] text-muted">{sub}</span>
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="w-full max-w-[720px] max-h-[90vh] overflow-y-auto bg-white rounded-3xl p-6">
        <div className="flex items-start gap-3 mb-4">
          {mode !== "choose" && !saved && (
            <button onClick={() => (setMode("choose"), setError(null))} aria-label="Back" className="w-8 h-8 rounded-full hover:bg-[#F3F2F0] flex items-center justify-center text-muted mt-0.5">
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-[20px] font-semibold">
              {mode === "choose" ? "Create document" : mode === "template" ? "From a template" : mode === "blank" ? "Blank document" : "Write it with AI"}
            </h2>
            <p className="text-[13px] text-muted truncate">
              For {matter.matterNumber ? `${matter.matterNumber} · ` : ""}
              {matter.title}. Saved as a Word document in this matter&apos;s Documents.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" disabled={!!busy}>
            <X size={16} />
          </button>
        </div>

        {saved ? (
          <div className="flex flex-col items-center text-center py-8 gap-3">
            <CheckCircle2 size={28} className="text-[#2F9E5A]" />
            <div className="text-[15px] font-semibold">{saved} was added to this matter&apos;s Documents.</div>
            <button onClick={onClose} className={btn}>
              Done
            </button>
          </div>
        ) : mode === "choose" ? (
          <div className="flex flex-col gap-2.5">
            {option("template", <LayoutTemplate size={17} />, "From a template", "Pick a template from AI Templates. The AI can fill it in from this matter, then you check it.")}
            {option("blank", <FilePlus2 size={17} />, "Blank document", "Start with an empty page and write it yourself.")}
            {option("ai", <Sparkles size={17} />, "Write it with AI", "Say what you need; the AI drafts it from this matter's details, dates and parties.")}
          </div>
        ) : mode === "template" ? (
          <div>
            <div className="flex items-center gap-2 bg-[#F3F2F0] rounded-full px-3.5 py-2 mb-3">
              <Search size={14} className="text-muted" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates" aria-label="Search templates" className="flex-1 bg-transparent outline-none text-[13.5px]" />
            </div>
            {!templates ? (
              <div className="py-10 text-center text-[13.5px] text-muted flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Loading templates…
              </div>
            ) : list.length === 0 ? (
              <div className="py-10 text-center text-[13.5px] text-muted">No templates match. Add templates in AI Templates.</div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
                {list.map((t) => (
                  <button key={t.id} onClick={() => setUsing(t)} className="text-left rounded-xl border border-[#EBEAE7] bg-[#FCFCFC] hover:bg-[#F1F0EE] px-4 py-2.5">
                    <span className="block text-[14px] font-medium">{t.name}</span>
                    <span className="block text-[12px] text-muted truncate">{[t.category, t.description].filter(Boolean).join(" · ")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {mode === "ai" && (
              <div>
                <label className="text-[12.5px] text-muted">What should it be?</label>
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={3}
                  placeholder="e.g. A letter to the seller's attorney asking for the survey and the certificate of occupancy by Friday"
                  className={`${input} w-full mt-1 resize-y`}
                />
                <button onClick={() => void draft()} disabled={!instruction.trim() || !!busy} className={`${chip} mt-2`}>
                  {busy === "draft" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {busy === "draft" ? "Writing…" : body ? "Write again" : "Write draft"}
                </button>
              </div>
            )}
            {(mode === "blank" || body) && (
              <>
                <div>
                  <label className="text-[12.5px] text-muted">File name</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Letter to seller's attorney" className={`${input} w-full mt-1`} />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[12.5px] text-muted">Text</label>
                    {body && (
                      <button onClick={() => setShowPreview((v) => !v)} className="text-[12.5px] text-muted underline underline-offset-2">
                        {showPreview ? "Edit text" : "Preview"}
                      </button>
                    )}
                  </div>
                  {showPreview ? (
                    <div className="mt-1 border border-line rounded-lg p-4 max-h-[45vh] overflow-y-auto">
                      <PreviewText text={body} />
                    </div>
                  ) : (
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={14}
                      placeholder={"Write the document here.\n\nTips: a line starting with \"# \" is a centered title, \"## \" a heading, **bold** for bold, a blank line between paragraphs."}
                      className={`${input} w-full mt-1 resize-y font-[inherit] leading-relaxed`}
                    />
                  )}
                </div>
                {notes && <div className="rounded-xl bg-[#FFF4E5] text-[#8A4B14] px-3 py-2 text-[12.5px]">To check: {notes}</div>}
                <div className="flex justify-end gap-2">
                  <button onClick={() => void save()} disabled={!body.trim() || !!busy} className={btn}>
                    {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : null}
                    {busy === "save" ? "Saving…" : "Save to Documents"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {error && <div className="mt-3 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-3 py-2 text-[13px]">{error}</div>}
      </div>
    </div>
  );
}
