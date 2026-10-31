"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, Sparkles, Check, Trash2, Wand2, SquareDashedBottom, Info } from "lucide-react";
import { TEMPLATE_CATEGORIES, toKey, labelOf, type TemplateField } from "@/lib/docTemplates/format";
import { FIELD_TYPES, VOCABULARY, countIn, type FieldType, type Suggestion } from "@/lib/docTemplates/vocabulary";

// Template maker: the firm's own Word document, shown paragraph by paragraph.
// Select text → make it a field ({{client_name}}); select paragraphs → make them
// an optional clause (kept only when the yes/no field is Yes). Suggestions come
// from patterns (dates, amounts, addresses…) and, on request, the AI. Saving
// tags the Word file itself, so the firm's formatting is kept.

export type MakerDraft = {
  draftPath: string;
  paragraphs: string[];
  suggestions: Suggestion[];
  template?: { id: string; name: string; category: string; description: string; fields: TemplateField[]; version: number };
};
type Rep = { find: string; key: string; all: boolean };
type BlockSel = { start: number; end: number; key: string };
type Pop = { x: number; y: number; text: string; para: number; endPara: number };

async function readJson(r: Response) {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error ?? "Something went wrong.");
  return d;
}

// A paragraph split into plain text, text about to become a field, and fields already in it.
function segments(text: string, reps: Rep[]): { t: string; key?: string; kind: "plain" | "rep" | "tag" }[] {
  const out: { t: string; key?: string; kind: "plain" | "rep" | "tag" }[] = [];
  const finds = [...reps].sort((a, b) => b.find.length - a.find.length);
  let i = 0;
  let plain = "";
  while (i < text.length) {
    const tag = /^\{\{\s*([#/]?)([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/.exec(text.slice(i));
    if (tag) {
      if (plain) {
        out.push({ t: plain, kind: "plain" });
        plain = "";
      }
      out.push({ t: tag[0], key: tag[2], kind: "tag" });
      i += tag[0].length;
      continue;
    }
    const r = finds.find((f) => f.find && text.startsWith(f.find, i));
    if (r) {
      if (plain) {
        out.push({ t: plain, kind: "plain" });
        plain = "";
      }
      out.push({ t: r.find, key: r.key, kind: "rep" });
      i += r.find.length;
      continue;
    }
    plain += text[i++];
  }
  if (plain) out.push({ t: plain, kind: "plain" });
  return out;
}

export default function TemplateMaker({ draft, onClose, onSaved }: { draft: MakerDraft; onClose: () => void; onSaved: (id: string) => void }) {
  const t = draft.template;
  const [name, setName] = useState(t?.name ?? "");
  const [category, setCategory] = useState(t?.category ?? "");
  const [description, setDescription] = useState(t?.description ?? "");
  const [reps, setReps] = useState<Rep[]>([]);
  const [blocks, setBlocks] = useState<BlockSel[]>([]);
  const [fields, setFields] = useState<TemplateField[]>(t?.fields ?? []);
  const [suggestions, setSuggestions] = useState<(Suggestion & { state?: "skipped" | "added" })[]>(draft.suggestions);
  const [tab, setTab] = useState<"suggestions" | "fields">(draft.suggestions.length ? "suggestions" : "fields");
  const [pop, setPop] = useState<Pop | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const docRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && (pop ? setPop(null) : !saving && onClose());
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [pop, saving, onClose]);

  const keys = new Set(fields.map((f) => f.key));
  const uniqueKey = (k: string) => {
    const key = toKey(k);
    if (!keys.has(key)) return key;
    let n = 2;
    while (keys.has(`${key}_${n}`)) n++;
    return `${key}_${n}`;
  };
  const vocab = (k: string) => VOCABULARY.find((v) => v.key === k);

  // Add a field for some text (or reuse the field if the key already exists).
  function addField(find: string, key: string, opts: Partial<TemplateField> = {}, all = true) {
    const k = toKey(key);
    if (!find.trim() || !k) return;
    setReps((list) => [...list.filter((r) => r.find !== find), { find, key: k, all }]);
    setFields((list) =>
      list.some((f) => f.key === k)
        ? list
        : [...list, { key: k, label: opts.label || vocab(k)?.label || labelOf(k), ...(opts.type && opts.type !== "text" ? { type: opts.type } : vocab(k) && vocab(k)!.type !== "text" ? { type: vocab(k)!.type } : {}), ...(opts.required ? { required: true } : {}), ...(opts.default ? { default: opts.default } : {}), example: find.slice(0, 160) }]
    );
  }
  function addBlock(start: number, end: number, label: string) {
    const key = uniqueKey(`include_${label.split(/\s+/).slice(0, 4).join("_")}`);
    setBlocks((b) => [...b, { start: Math.min(start, end), end: Math.max(start, end), key }]);
    setFields((list) => [...list, { key, label: `Include: ${label.slice(0, 60)}`, type: "yes_no" }]);
  }
  function removeField(key: string) {
    setFields((list) => list.filter((f) => f.key !== key));
    setReps((list) => list.filter((r) => r.key !== key));
    setBlocks((list) => list.filter((b) => b.key !== key));
  }

  // Text selected in the document → the "make a field" box.
  function onMouseUp() {
    const sel = window.getSelection();
    const text = sel?.toString() ?? "";
    if (!sel || !text.trim() || !docRef.current) return;
    const range = sel.getRangeAt(0);
    const paraOf = (n: Node | null) => Number((n instanceof Element ? n : n?.parentElement)?.closest("[data-para]")?.getAttribute("data-para") ?? -1);
    const a = paraOf(range.startContainer);
    const b = paraOf(range.endContainer);
    if (a < 0 || b < 0) return;
    const rect = range.getBoundingClientRect();
    setPop({ x: Math.min(rect.left, window.innerWidth - 380), y: rect.bottom + 8, text: a === b ? text.trim() : text, para: Math.min(a, b), endPara: Math.max(a, b) });
  }

  async function findWithAi() {
    setAiBusy(true);
    setError(null);
    try {
      const d = await fetch("/api/doc-templates/maker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "suggest", draftPath: draft.draftPath }) }).then(readJson);
      const seen = new Set(suggestions.map((s) => s.text));
      setSuggestions((list) => [...list, ...(d.suggestions as Suggestion[]).filter((s) => !seen.has(s.text))]);
      setTab("suggestions");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const d = await fetch("/api/doc-templates/maker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", draftPath: draft.draftPath, templateId: t?.id ?? null, name, category, description, replacements: reps, blocks, fields, note }),
      }).then(readJson);
      onSaved(d.id);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const blockOf = (i: number) => blocks.find((b) => i >= b.start && i <= b.end);
  const openSugg = suggestions.filter((s) => !s.state);
  const input = "w-full bg-white border border-line rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:border-btn-ring";
  const pending = useMemo(() => reps.length + blocks.length, [reps, blocks]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/25 px-4 py-6" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div role="dialog" aria-label="Template maker" className="bg-cream rounded-3xl w-full max-w-[1280px] h-full max-h-[94vh] flex flex-col overflow-hidden shadow-[0_30px_80px_-20px_rgba(18,17,16,0.35)]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-3.5 border-b border-line">
          <Wand2 size={18} className="text-muted" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name, e.g. Bargain and Sale Deed" aria-label="Template name" className="flex-1 min-w-0 bg-transparent text-[17px] font-semibold outline-none placeholder:text-muted" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="bg-white border border-line rounded-full px-3 py-1.5 text-[13px]">
            <option value="">Category</option>
            {TEMPLATE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {t && <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed? (optional)" aria-label="Version note" className="bg-white border border-line rounded-full px-3 py-1.5 text-[13px] w-[200px]" />}
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-chip">
            Cancel
          </button>
          <button onClick={() => void save()} disabled={saving || !name.trim() || !fields.length} title={!fields.length ? "Mark at least one field first" : undefined} className="px-5 py-2 rounded-full text-[13.5px] font-semibold bg-btn hover:bg-btn-hover disabled:opacity-50 flex items-center gap-1.5">
            {saving && <Loader2 size={14} className="animate-spin" />} {t ? `Save as version ${t.version + 1}` : "Save template"}
          </button>
        </div>
        {error && <div className="px-6 py-2 bg-[#FDECEC] text-[#9F1D1D] text-[13px]">{error}</div>}

        <div className="flex-1 flex min-h-0">
          {/* The document */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="flex items-center gap-2 text-[12.5px] text-muted mb-3">
              <Info size={13} /> Select words to make them a field. Select across paragraphs to make an optional clause. Your Word formatting is kept.
            </div>
            <div ref={docRef} onMouseUp={onMouseUp} className="bg-white border border-line rounded-2xl px-10 py-8 text-[14px] leading-relaxed font-[Georgia,'Times_New_Roman',serif] select-text">
              {draft.paragraphs.map((p, i) => {
                const b = blockOf(i);
                return (
                  <div key={i} data-para={i} className={`group relative min-h-[1.4em] py-0.5 ${b ? "border-l-[3px] border-[#7C5CD6] pl-3 -ml-[15px] bg-[#F6F3FD]" : ""}`}>
                    {b && b.start === i && <div className="text-[11px] font-sans font-semibold text-[#5B3FB8] mb-0.5">Optional · {fields.find((f) => f.key === b.key)?.label ?? b.key}</div>}
                    {p.trim() ? (
                      segments(p, reps).map((s, j) =>
                        s.kind === "plain" ? (
                          <span key={j}>{s.t}</span>
                        ) : s.kind === "rep" ? (
                          <mark key={j} title={`Becomes {{${s.key}}}`} className="bg-[#FFF1B8] rounded px-0.5">
                            {s.t}
                          </mark>
                        ) : (
                          <span key={j} className="font-sans text-[12px] bg-[#E1E7F5] text-ink rounded px-1 py-0.5 mx-0.5">
                            {s.t}
                          </span>
                        )
                      )
                    ) : (
                      <span>&nbsp;</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Suggestions and fields */}
          <aside className="w-[380px] flex-shrink-0 border-l border-line flex flex-col min-h-0">
            <div className="flex gap-1 px-4 pt-4">
              {(
                [
                  ["suggestions", `Suggestions${openSugg.length ? ` (${openSugg.length})` : ""}`],
                  ["fields", `Fields (${fields.length})`],
                ] as const
              ).map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-full text-[13px] font-medium ${tab === k ? "bg-btn-hover" : "hover:bg-chip text-muted"}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {tab === "suggestions" ? (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <button onClick={() => void findWithAi()} disabled={aiBusy} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3 py-1.5 rounded-full text-[12.5px] font-medium disabled:opacity-50" title="Names, parties, the court, property… (uses AI credits)">
                      {aiBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {aiBusy ? "Reading the document…" : "Find fields with AI"}
                    </button>
                    {openSugg.length > 1 && (
                      <button
                        onClick={() => {
                          for (const s of openSugg) addField(s.text, keys.has(s.key) ? uniqueKey(s.key) : s.key, { label: s.label, type: s.type });
                          setSuggestions((list) => list.map((s) => (s.state ? s : { ...s, state: "added" })));
                        }}
                        className="text-[12.5px] underline underline-offset-2 text-muted hover:text-ink"
                      >
                        Accept all
                      </button>
                    )}
                  </div>
                  {!openSugg.length && <div className="text-[13px] text-muted">No suggestions left. Select text in the document to mark more fields{suggestions.some((s) => s.source === "ai") ? "" : ", or try Find fields with AI"}.</div>}
                  <div className="flex flex-col gap-2">
                    {openSugg.map((s) => (
                      <div key={s.text} className="bg-white border border-line rounded-xl p-3">
                        <div className="text-[13px]">
                          Replace <b>&ldquo;{s.text.length > 70 ? `${s.text.slice(0, 70)}…` : s.text}&rdquo;</b> <span className="text-muted">({s.count}×)</span> with
                        </div>
                        <input
                          value={s.key}
                          onChange={(e) => setSuggestions((list) => list.map((x) => (x.text === s.text ? { ...x, key: e.target.value } : x)))}
                          list="lp-vocab"
                          aria-label="Field name"
                          className={`${input} mt-1.5 font-mono`}
                        />
                        {s.why && <div className="text-[11.5px] text-muted mt-1">{s.why}</div>}
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => {
                              addField(s.text, s.key, { label: s.label, type: s.type });
                              setSuggestions((list) => list.map((x) => (x.text === s.text ? { ...x, state: "added" } : x)));
                            }}
                            className="flex items-center gap-1 bg-btn hover:bg-btn-hover px-3 py-1 rounded-full text-[12.5px] font-medium"
                          >
                            <Check size={12} /> Accept
                          </button>
                          <button onClick={() => setSuggestions((list) => list.map((x) => (x.text === s.text ? { ...x, state: "skipped" } : x)))} className="px-3 py-1 rounded-full text-[12.5px] font-medium hover:bg-chip text-muted">
                            Skip
                          </button>
                          <span className="ml-auto text-[11px] text-muted self-center">{s.source === "ai" ? "AI" : "pattern"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  {!fields.length && <div className="text-[13px] text-muted">No fields yet. Select text in the document, or accept suggestions.</div>}
                  {fields.map((f) => (
                    <div key={f.key} className="bg-white border border-line rounded-xl p-3">
                      <div className="flex items-center gap-2">
                        <code className="text-[12px] bg-[#E1E7F5] rounded px-1.5 py-0.5 truncate">{f.type === "yes_no" ? `{{#${f.key}}}` : `{{${f.key}}}`}</code>
                        <span className="text-[11.5px] text-muted">{f.type === "yes_no" ? "optional clause" : `${countIn(draft.paragraphs, `{{${f.key}}}`) + reps.filter((r) => r.key === f.key).reduce((n, r) => n + (r.all ? countIn(draft.paragraphs, r.find) : 1), 0)}×`}</span>
                        <button onClick={() => removeField(f.key)} aria-label={`Remove ${f.label}`} title="Remove (the text goes back to how it was)" className="ml-auto text-muted hover:text-[#B42318]">
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <input value={f.label} onChange={(e) => setFields((l) => l.map((x) => (x.key === f.key ? { ...x, label: e.target.value } : x)))} aria-label="Label" placeholder="Label" className={`${input} col-span-2`} />
                        <select value={f.type ?? "text"} disabled={f.type === "yes_no" && blocks.some((b) => b.key === f.key)} onChange={(e) => setFields((l) => l.map((x) => (x.key === f.key ? { ...x, type: e.target.value as FieldType } : x)))} aria-label="Type" className={input}>
                          {FIELD_TYPES.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1.5 text-[12.5px]">
                          <input type="checkbox" checked={!!f.required} onChange={(e) => setFields((l) => l.map((x) => (x.key === f.key ? { ...x, required: e.target.checked } : x)))} className="w-3.5 h-3.5 accent-[#5E6E8C]" /> Required
                        </label>
                        {f.type !== "yes_no" && (
                          <input value={f.default ?? ""} onChange={(e) => setFields((l) => l.map((x) => (x.key === f.key ? { ...x, default: e.target.value } : x)))} placeholder="Default (optional)" aria-label="Default" className={`${input} col-span-2`} />
                        )}
                        {f.type === "select" && (
                          <input
                            value={(f.options ?? []).join(", ")}
                            onChange={(e) => setFields((l) => l.map((x) => (x.key === f.key ? { ...x, options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) } : x)))}
                            placeholder="Choices, separated by commas"
                            aria-label="Choices"
                            className={`${input} col-span-2`}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-line">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description (optional): when to use this template" aria-label="Description" className={`${input} resize-none`} />
              {pending > 0 && <div className="text-[11.5px] text-muted mt-1.5">{pending} change{pending > 1 ? "s" : ""} will be written into the Word file when you save.</div>}
            </div>
          </aside>
        </div>
      </div>

      <datalist id="lp-vocab">
        {[...new Set([...fields.map((f) => f.key), ...VOCABULARY.map((v) => v.key)])].map((k) => (
          <option key={k} value={k}>
            {vocab(k)?.label ?? fields.find((f) => f.key === k)?.label ?? ""}
          </option>
        ))}
      </datalist>

      {pop && <FieldPopover pop={pop} keys={keys} paragraphs={draft.paragraphs} onClose={() => setPop(null)} onField={(find, key, opts, all) => (addField(find, key, opts, all), setPop(null), setTab("fields"))} onBlock={(s, e, label) => (addBlock(s, e, label), setPop(null), setTab("fields"))} />}
    </div>
  );
}

function FieldPopover({
  pop,
  keys,
  paragraphs,
  onClose,
  onField,
  onBlock,
}: {
  pop: Pop;
  keys: Set<string>;
  paragraphs: string[];
  onClose: () => void;
  onField: (find: string, key: string, opts: Partial<TemplateField>, all: boolean) => void;
  onBlock: (start: number, end: number, label: string) => void;
}) {
  const multi = pop.endPara > pop.para || pop.text.includes("\n");
  const count = multi ? 0 : countIn(paragraphs, pop.text);
  const guess = VOCABULARY.find((v) => /^\$/.test(pop.text) ? v.type === "currency" : false)?.key ?? toKey(pop.text.split(/\s+/).slice(0, 3).join("_"));
  const [key, setKey] = useState(guess);
  const [type, setType] = useState<FieldType>(/^\$/.test(pop.text) ? "currency" : /\b\d{4}\b/.test(pop.text) && /[A-Za-z]{3,}\s+\d{1,2},/.test(pop.text) ? "date" : "text");
  const [required, setRequired] = useState(false);
  const [all, setAll] = useState(true);
  const label = paragraphs[pop.para]?.trim().slice(0, 50) || "this clause";
  return (
    <>
      <div className="fixed inset-0 z-[70]" onMouseDown={onClose} />
      <div className="fixed z-[71] w-[360px] bg-white border border-line rounded-2xl shadow-xl p-4" style={{ left: Math.max(12, pop.x), top: Math.min(pop.y, window.innerHeight - 330) }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[13.5px] font-semibold">{multi ? "Optional clause" : "Make a field"}</div>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X size={14} />
          </button>
        </div>
        {!multi && (
          <>
            <div className="text-[12.5px] text-muted mb-2 line-clamp-2">&ldquo;{pop.text}&rdquo;</div>
            <label className="block text-[12px] text-muted mb-0.5">Field name</label>
            <input autoFocus value={key} onChange={(e) => setKey(e.target.value)} list="lp-vocab" className="w-full bg-white border border-line rounded-lg px-2.5 py-1.5 text-[13px] font-mono outline-none focus:border-btn-ring mb-2" />
            {keys.has(toKey(key)) && <div className="text-[11.5px] text-muted -mt-1.5 mb-2">Uses the existing field {`{{${toKey(key)}}}`}.</div>}
            <div className="flex gap-2 mb-2">
              <select value={type} onChange={(e) => setType(e.target.value as FieldType)} className="flex-1 bg-white border border-line rounded-lg px-2 py-1.5 text-[13px]">
                {FIELD_TYPES.filter((t) => t.value !== "yes_no").map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-[12.5px]">
                <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="w-3.5 h-3.5 accent-[#5E6E8C]" /> Required
              </label>
            </div>
            {count > 1 && (
              <label className="flex items-center gap-1.5 text-[12.5px] mb-3">
                <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="w-3.5 h-3.5 accent-[#5E6E8C]" /> Every place it appears ({count}×)
              </label>
            )}
            <div className="flex gap-2">
              <button onClick={() => onField(pop.text, key, { type, required }, all)} disabled={!toKey(key)} className="flex items-center gap-1 bg-btn hover:bg-btn-hover px-3 py-1.5 rounded-full text-[12.5px] font-medium">
                <Check size={12} /> Make it a field
              </button>
              <button onClick={() => onBlock(pop.para, pop.endPara, label)} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-medium hover:bg-chip text-muted" title="Keep this paragraph only when a yes/no field is Yes">
                <SquareDashedBottom size={12} /> Optional paragraph
              </button>
            </div>
          </>
        )}
        {multi && (
          <>
            <p className="text-[12.5px] text-muted mb-3">
              Paragraphs {pop.para + 1}–{pop.endPara + 1} will be included only when a yes/no field is set to Yes (for example, a clause that applies only to some matters).
            </p>
            <button onClick={() => onBlock(pop.para, pop.endPara, label)} className="flex items-center gap-1 bg-btn hover:bg-btn-hover px-3 py-1.5 rounded-full text-[12.5px] font-medium">
              <SquareDashedBottom size={12} /> Make these paragraphs optional
            </button>
          </>
        )}
      </div>
    </>
  );
}
