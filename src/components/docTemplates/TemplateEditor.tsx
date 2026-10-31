"use client";

import { useMemo, useRef, useState } from "react";
import { Sparkles, Loader2, Save, Trash2, Copy, FileText, Undo2, Plus, ChevronDown, Download, ArrowLeft, X } from "lucide-react";
import ClickAway from "@/components/ClickAway";
import type { Matter } from "@/components/NewMatterModal";
import { TEMPLATE_CATEGORIES, COMMON_FIELDS, syncFields, toKey, labelOf, type TemplateField, type DocTemplate } from "@/lib/docTemplates/format";
import { readJson, input, btn, chip, downloadBase64 } from "@/components/docTemplates/shared";
import UseForMatterModal from "@/components/docTemplates/UseForMatterModal";

export type EditorValue = { id?: string; name: string; category: string; description: string; body: string; fields: TemplateField[]; source: DocTemplate["source"]; sample?: boolean; notes?: string };

const AI_IDEAS = ["Add a notary acknowledgment block", "Add a signature block for two grantors", "Make the tone more formal", "Add a paragraph about costs and disbursements", "Spell out the consideration in words and figures", "Shorten it by a third"];

// The template itself: name, body with {{fields}}, the fields, Edit with AI, Save, Use for a matter.
export default function TemplateEditor({
  value,
  matters,
  onSaved,
  onDeleted,
  onCopy,
  onClose,
}: {
  value: EditorValue;
  matters: Matter[];
  onSaved: (t: DocTemplate) => void;
  onDeleted: () => void;
  onCopy: () => void;
  onClose?: () => void; // back to all templates
}) {
  const [name, setName] = useState(value.name);
  const [category, setCategory] = useState(value.category);
  const [description, setDescription] = useState(value.description);
  const [body, setBody] = useState(value.body);
  const [fields, setFields] = useState<TemplateField[]>(() => syncFields(value.body, value.fields));
  const [history, setHistory] = useState<{ body: string; fields: TemplateField[] }[]>([]);
  const [instruction, setInstruction] = useState("");
  const [aiNote, setAiNote] = useState<string | null>(value.notes ?? null);
  const [busy, setBusy] = useState<"ai" | "save" | "blank" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [insertOpen, setInsertOpen] = useState(false);
  const [using, setUsing] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const live = useMemo(() => syncFields(body, fields), [body, fields]);
  const readOnly = !!value.sample;
  const dirty = !readOnly && (name !== value.name || category !== value.category || description !== value.description || body !== value.body || JSON.stringify(live) !== JSON.stringify(syncFields(value.body, value.fields)));

  function insertField(key: string) {
    const k = toKey(key);
    const el = area.current;
    const token = `{{${k}}}`;
    if (!el) return setBody((b) => b + token);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? start;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    if (!live.some((f) => f.key === k)) setFields((fs) => [...fs, COMMON_FIELDS.find((c) => c.key === k) ?? { key: k, label: labelOf(k) }]);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  }

  async function editWithAi() {
    setBusy("ai");
    setError(null);
    try {
      const d = await fetch("/api/doc-templates/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "edit", body, fields: live, instruction, name }) }).then(readJson);
      setHistory((h) => [...h.slice(-9), { body, fields: live }]);
      setBody(d.body);
      setFields(syncFields(d.body, d.fields ?? []));
      setAiNote(d.notes || null);
      setInstruction("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setBody(last.body);
    setFields(last.fields);
    setHistory((h) => h.slice(0, -1));
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const payload = { name, category, description, body, fields: live, source: value.source === "sample" ? "blank" : value.source };
      const d = await fetch(value.id ? `/api/doc-templates/${value.id}` : "/api/doc-templates", { method: value.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(readJson);
      setSaved(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
      onSaved(d.template);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!value.id || !confirm(`Delete “${name}”? Documents already created from it are not affected.`)) return;
    try {
      await fetch(`/api/doc-templates/${value.id}`, { method: "DELETE" }).then(readJson);
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function blankWord() {
    setBusy("blank");
    try {
      const d = await fetch("/api/doc-templates/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, values: {}, title: `${name} (blank)`, templateName: name }) }).then(readJson);
      downloadBase64(d.base64, d.fileName);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {onClose && (
        <div className="flex items-center justify-between -mb-1">
          <button
            onClick={() => (!dirty || confirm("Leave without saving? Your changes to this template will be lost.")) && onClose()}
            className="flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
          >
            <ArrowLeft size={14} /> All templates
          </button>
          <button
            onClick={() => (!dirty || confirm("Leave without saving? Your changes to this template will be lost.")) && onClose()}
            aria-label="Close"
            title="Close"
            className="w-8 h-8 rounded-full hover:bg-white flex items-center justify-center text-muted hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {readOnly && (
        <div className="rounded-xl bg-[#FFF8EE] border border-[#F6D4A6] px-4 py-3 text-[13px] flex items-center gap-3">
          <span>This is a built-in sample. Copy it to your templates to change it, or use it as it is.</span>
          <button onClick={onCopy} className={`${chip} ml-auto`}>
            <Copy size={13} /> Copy to my templates
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-3 items-start">
        <input value={name} onChange={(e) => setName(e.target.value)} readOnly={readOnly} placeholder="Template name" aria-label="Template name" className="flex-1 min-w-[260px] text-[20px] font-semibold bg-transparent outline-none border-b border-transparent focus:border-line py-1" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={readOnly} aria-label="Practice area" className={input}>
          <option value="">Practice area…</option>
          {TEMPLATE_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <input value={description} onChange={(e) => setDescription(e.target.value)} readOnly={readOnly} placeholder="One-line description (what this is for)" aria-label="Description" className={`${input} w-full`} />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="relative">
              <button onClick={() => setInsertOpen((o) => !o)} disabled={readOnly} className={chip}>
                <Plus size={13} /> Insert field <ChevronDown size={12} />
              </button>
              {insertOpen && (
                <>
                  <ClickAway onClose={() => setInsertOpen(false)} />
                  <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[280px] bg-white border border-line rounded-2xl shadow-[0_12px_32px_rgba(27,25,26,0.12)] p-1.5 max-h-[360px] overflow-y-auto">
                    <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Filled from the matter</div>
                    {COMMON_FIELDS.map((f) => (
                      <button key={f.key} onClick={() => (insertField(f.key), setInsertOpen(false))} className="w-full text-left px-3 py-1.5 rounded-xl text-[13px] hover:bg-chip">
                        {f.label} <span className="text-muted">{`{{${f.key}}}`}</span>
                      </button>
                    ))}
                    <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Your own</div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const el = (e.currentTarget.elements.namedItem("k") as HTMLInputElement) ?? null;
                        if (el?.value.trim()) {
                          insertField(el.value);
                          setInsertOpen(false);
                        }
                      }}
                      className="px-2 pb-2 flex gap-1.5"
                    >
                      <input name="k" placeholder="e.g. Buyer's attorney" className={`${input} flex-1 min-w-0 py-1`} />
                      <button type="submit" className="px-3 rounded-full bg-chip hover:bg-btn text-[12.5px] font-medium">
                        Insert
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
            <span className="text-[12px] text-muted">Fields look like {"{{client_name}}"}. Formatting: # title, ## heading, **bold**, ::centered, {">>"}right, --- page break.</span>
          </div>
          <textarea
            ref={area}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            readOnly={readOnly}
            spellCheck
            aria-label="Template text"
            className="w-full min-h-[520px] bg-white border border-line rounded-xl px-5 py-4 text-[13.5px] leading-relaxed font-serif outline-none focus:border-btn-ring resize-y"
          />
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-card-alt rounded-2xl p-4">
            <div className="font-semibold text-[13.5px] flex items-center gap-2 mb-2">
              <Sparkles size={14} /> Edit with AI
            </div>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
              disabled={readOnly}
              placeholder={readOnly ? "Copy this sample to your templates first." : "Tell the AI what to change, e.g. “add a notary acknowledgment”"}
              className={`${input} w-full resize-y`}
            />
            {!readOnly && (
              <div className="flex flex-wrap gap-1 mt-2">
                {AI_IDEAS.map((i) => (
                  <button key={i} onClick={() => setInstruction(i)} className="text-[11.5px] bg-white hover:bg-btn rounded-full px-2 py-0.5">
                    {i}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 mt-3">
              <button onClick={() => void editWithAi()} disabled={readOnly || !!busy || instruction.trim().length < 3} className={btn}>
                {busy === "ai" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {busy === "ai" ? "Rewriting…" : "Apply"}
              </button>
              {history.length > 0 && (
                <button onClick={undo} disabled={!!busy} className={chip} title="Put back the version before the last AI change">
                  <Undo2 size={13} /> Undo
                </button>
              )}
            </div>
            {aiNote && <div className="mt-3 text-[12.5px] text-muted bg-white rounded-xl px-3 py-2">{aiNote}</div>}
          </div>

          <div className="bg-card-alt rounded-2xl p-4">
            <div className="font-semibold text-[13.5px] mb-2">Fields ({live.length})</div>
            {live.length === 0 ? (
              <p className="text-[12.5px] text-muted">No fields yet. Use Insert field, or type {"{{like_this}}"} in the text.</p>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-[360px] overflow-y-auto pr-1">
                {live.map((f) => (
                  <div key={f.key} className="bg-white rounded-xl px-3 py-2">
                    <div className="text-[11.5px] text-muted font-mono">{`{{${f.key}}}`}</div>
                    <input
                      value={f.label}
                      readOnly={readOnly}
                      onChange={(e) => setFields((fs) => (fs.some((x) => x.key === f.key) ? fs.map((x) => (x.key === f.key ? { ...x, label: e.target.value } : x)) : [...fs, { ...f, label: e.target.value }]))}
                      aria-label={`Label for ${f.key}`}
                      className="w-full bg-transparent outline-none text-[13px] font-medium"
                    />
                    <input
                      value={f.hint ?? ""}
                      readOnly={readOnly}
                      onChange={(e) => setFields((fs) => (fs.some((x) => x.key === f.key) ? fs.map((x) => (x.key === f.key ? { ...x, hint: e.target.value } : x)) : [...fs, { ...f, hint: e.target.value }]))}
                      placeholder="Hint (what goes here)"
                      aria-label={`Hint for ${f.key}`}
                      className="w-full bg-transparent outline-none text-[12px] text-muted"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3 text-[13.5px]">{error}</div>}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line">
        <button onClick={() => setUsing(true)} disabled={!!busy || !body.trim()} className={btn}>
          <FileText size={14} /> Use for a matter
        </button>
        <button onClick={() => void blankWord()} disabled={!!busy || !body.trim()} className={chip} title="A Word file with the fields left blank">
          {busy === "blank" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Blank Word file
        </button>
        <span className="ml-auto text-[12.5px] text-muted">{saved ? `Saved ${saved}` : dirty ? "Unsaved changes" : ""}</span>
        {value.id && !readOnly && (
          <button onClick={() => void remove()} disabled={!!busy} className="text-[13px] text-muted hover:text-[#B42318] flex items-center gap-1 px-3 py-2">
            <Trash2 size={13} /> Delete
          </button>
        )}
        {!readOnly && (
          <button onClick={() => void save()} disabled={!!busy || !name.trim() || !body.trim()} className={btn}>
            {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {value.id ? "Save" : "Save template"}
          </button>
        )}
      </div>

      {using && <UseForMatterModal template={{ name, body, fields: live }} matters={matters} onClose={() => setUsing(false)} />}
    </div>
  );
}
