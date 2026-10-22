"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Loader2, Sparkles, FileText, Download, CheckCircle2 } from "lucide-react";
import type { Matter } from "@/components/NewMatterModal";
import { fillBody, keysInBody, type TemplateField } from "@/lib/docTemplates/format";
import { readJson, input, btn, chip, downloadBase64 } from "@/components/docTemplates/shared";
import PreviewText from "@/components/docTemplates/PreviewText";

// Fill a template for a matter (AI fills what it can from the matter), check
// the values, and create the Word document in the matter's Documents.
export default function UseForMatterModal({
  template,
  matters,
  onClose,
}: {
  template: { name: string; body: string; fields: TemplateField[] };
  matters: Matter[];
  onClose: () => void;
}) {
  const keys = keysInBody(template.body);
  const fields = keys.map((k) => template.fields.find((f) => f.key === k) ?? { key: k, label: k });
  const [matterId, setMatterId] = useState("");
  const [q, setQ] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState(template.name);
  const [busy, setBusy] = useState<"fill" | "make" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ fileName: string; documentId?: string; base64: string } | null>(null);
  const [preview, setPreview] = useState(false);
  const matter = matters.find((m) => m.id === matterId) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function fill() {
    if (!matterId) return;
    setBusy("fill");
    setError(null);
    try {
      const d = await fetch("/api/doc-templates/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fill", body: template.body, fields: template.fields, matterId }) }).then(readJson);
      const v = (d.values ?? {}) as Record<string, string>;
      setValues((cur) => ({ ...cur, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x)) }));
      setAiFilled(new Set(Object.entries(v).filter(([, x]) => x).map(([k]) => k)));
      setNotes(d.notes ?? "");
      if (matter) setTitle(`${template.name} – ${matter.matterNumber ?? matter.title}`.slice(0, 150));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function make(saveToMatter: boolean) {
    setBusy("make");
    setError(null);
    try {
      const d = await fetch("/api/doc-templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: template.body, values, title, matterId: saveToMatter ? matterId : null, templateName: template.name }),
      }).then(readJson);
      setDone(d);
      if (!saveToMatter) downloadBase64(d.base64, d.fileName);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const options = matters.filter((m) => m.status !== "Closed").filter((m) => !q.trim() || `${m.matterNumber ?? ""} ${m.title}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40);
  const missing = fields.filter((f) => !values[f.key]?.trim()).length;

  return (
    <div className="fixed inset-0 z-[60] bg-black/20 flex items-center justify-center px-4 py-6" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-[1000px] max-h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Use template for a matter">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 sticky top-0 bg-white z-10 border-b border-line">
          <h2 className="text-[17px] font-semibold flex items-center gap-2">
            <FileText size={17} /> Use “{template.name}”
          </h2>
          <button onClick={onClose} disabled={!!busy} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 text-[13.5px]">
          {done ? (
            <div>
              <div className="rounded-xl bg-[#E7F6EE] text-[#155C3A] px-4 py-3 flex gap-2 items-start">
                <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
                <span>
                  <b>{done.fileName}</b> is ready.{done.documentId ? ` It's saved in the matter's Documents${matter ? ` (${matter.matterNumber ?? matter.title})` : ""}.` : " It was downloaded to your computer."}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <button onClick={() => downloadBase64(done.base64, done.fileName)} className={chip}>
                  <Download size={13} /> Download the Word file
                </button>
                {done.documentId && matter && (
                  <Link href={`/dashboard/matters/${matter.id}`} className={chip}>
                    Open the matter
                  </Link>
                )}
                <button onClick={onClose} className={`${btn} ml-auto`}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
              <div>
                <div className="font-medium mb-2">1. Which matter?</div>
                {matter ? (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-[#E1E7F4] rounded-md px-2 py-1 font-semibold text-[12.5px]">{matter.matterNumber ?? "Matter"}</span>
                    <span className="truncate text-muted">{matter.title}</span>
                    <button onClick={() => setMatterId("")} className="ml-auto text-[12.5px] underline underline-offset-2 text-muted hover:text-ink flex-shrink-0">
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="mb-3">
                    <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Matter number or name" aria-label="Find a matter" className={`${input} w-full mb-2`} />
                    <div className="border border-line rounded-xl max-h-[200px] overflow-y-auto">
                      {options.map((m) => (
                        <button key={m.id} onClick={() => setMatterId(m.id)} className="w-full text-left flex gap-2 px-3 py-2 hover:bg-chip border-b border-line last:border-0">
                          {m.matterNumber && <span className="font-semibold flex-shrink-0">{m.matterNumber}</span>}
                          <span className="truncate text-muted">{m.title}</span>
                        </button>
                      ))}
                      {!options.length && <div className="px-3 py-3 text-muted">No matching open matters.</div>}
                    </div>
                    <p className="text-[12.5px] text-muted mt-2">No matter? You can still fill the fields by hand below and download the document.</p>
                  </div>
                )}
                {matter && (
                  <button onClick={() => void fill()} disabled={!!busy} className={`${btn} mb-3`}>
                    {busy === "fill" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {busy === "fill" ? "Reading the matter…" : aiFilled.size ? "Fill again from the matter" : "Fill from the matter with AI"}
                  </button>
                )}
                {notes && <div className="rounded-xl bg-card-alt px-3.5 py-2.5 text-[12.5px] text-muted mb-3">{notes}</div>}

                <div className="font-medium mb-2 mt-2">2. Check the fields</div>
                <div className="flex flex-col gap-2 max-h-[46vh] overflow-y-auto pr-1">
                  {fields.map((f) => (
                    <label key={f.key} className="flex flex-col gap-0.5">
                      <span className="text-[12.5px] text-muted flex items-center gap-1.5">
                        {f.label}
                        {aiFilled.has(f.key) && <span className="text-[10.5px] bg-[#E7F6EE] text-[#155C3A] rounded px-1">from matter</span>}
                      </span>
                      {(values[f.key] ?? "").length > 60 ? (
                        <textarea value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} rows={2} placeholder={f.example ?? f.hint ?? ""} className={`${input} resize-y`} />
                      ) : (
                        <input value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} placeholder={f.example ?? f.hint ?? ""} className={input} />
                      )}
                    </label>
                  ))}
                  {!fields.length && <div className="text-muted">This template has no fields.</div>}
                </div>
              </div>

              <div className="flex flex-col">
                <div className="font-medium mb-2 flex items-center">
                  3. Preview
                  <button onClick={() => setPreview((p) => !p)} className="ml-auto text-[12.5px] underline underline-offset-2 text-muted hover:text-ink">
                    {preview ? "Hide" : "Show"}
                  </button>
                </div>
                {preview ? (
                  <div className="bg-white border border-line rounded-xl p-5 max-h-[52vh] overflow-y-auto">
                    <PreviewText text={fillBody(template.body, values)} />
                  </div>
                ) : (
                  <div className="bg-card-alt rounded-xl p-4 text-muted text-[12.5px]">{missing ? `${missing} of ${fields.length} fields still empty; they appear as blanks (__________) in the document.` : "All fields filled."}</div>
                )}
                <label className="flex flex-col gap-1 mt-4">
                  <span className="text-[12.5px] text-muted">Document name</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
                </label>
                {error && <div className="mt-3 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3">{error}</div>}
                <div className="flex flex-wrap justify-end gap-2 mt-5">
                  <button onClick={() => void make(false)} disabled={!!busy} className={chip}>
                    <Download size={13} /> Download only
                  </button>
                  <button onClick={() => void make(true)} disabled={!!busy || !matterId} className={btn} title={matterId ? "" : "Pick a matter to save the document there"}>
                    {busy === "make" ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Create Word document in the matter
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
