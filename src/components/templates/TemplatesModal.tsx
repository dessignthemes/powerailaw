"use client";

import { useState } from "react";
import { X, Plus, Trash2, ListChecks, Loader2, ClipboardPaste } from "lucide-react";
import { useTemplates } from "./useTemplates";
import { parseOutline, toOutline, COMMON_ANCHORS, type TemplateSection } from "@/lib/checklist";

type Draft = { id?: string; name: string; sections: TemplateSection[]; example?: boolean };
const uid = () => crypto.randomUUID();
const blank = (): Draft => ({ name: "", sections: [{ id: uid(), title: "", items: [{ id: uid(), text: "" }] }] });

// Create and edit checklist templates (e.g. "Real Estate Purchase").
export default function TemplatesModal({ onClose }: { onClose: () => void }) {
  const { templates, error: loadError, save, remove } = useTemplates();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const itemCount = (d: Draft) => d.sections.reduce((n, s) => n + s.items.filter((i) => i.text.trim()).length, 0);

  function open(d: Draft) {
    setDraft(d);
    setError(null);
    setNotice(null);
    setPasteOpen(false);
  }

  function setSection(id: string, patch: Partial<TemplateSection>) {
    setDraft((d) => d && { ...d, sections: d.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  async function onSave() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await save({ id: draft.example ? undefined : draft.id, name: draft.name.trim(), sections: draft.sections });
      setDraft({ id: saved.id, name: saved.name, sections: saved.sections });
      setNotice(draft.example ? "Saved as your firm’s own copy. The example stays available." : "Template saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!draft?.id || !confirm(`Delete the template “${draft.name}”? Tasks that already use it keep their checklist.`)) return;
    setBusy(true);
    try {
      await remove(draft.id);
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-page rounded-3xl w-full max-w-[1060px] h-[min(760px,92vh)] flex overflow-hidden shadow-[0_20px_60px_rgba(27,25,26,0.18)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Checklist templates"
      >
        <datalist id="lp-anchors">
          {COMMON_ANCHORS.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        {/* Template list */}
        <div className="w-[300px] flex-shrink-0 bg-sidebar border-r border-line flex flex-col">
          <div className="px-5 pt-5 pb-3">
            <div className="text-[15px] font-semibold flex items-center gap-2">
              <ListChecks size={16} strokeWidth={1.75} /> Templates
            </div>
            <div className="text-[12px] text-muted mt-1">Checklists you can add to any task.</div>
          </div>
          <div className="px-3 flex flex-col gap-[2px] overflow-y-auto flex-1">
            {templates === null ? (
              <div className="px-3 py-4 text-[13px] text-muted flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => open({ id: t.id, name: t.name, sections: t.sections, example: t.example })}
                  className={`text-left px-3 py-[7px] rounded-lg text-[13px] font-medium transition-colors ${
                    draft?.id === t.id ? "bg-nav text-ink" : "text-muted hover:bg-nav hover:text-ink"
                  }`}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate" title={t.name}>{t.name}</span>
                    {t.example && <span className="flex-shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-muted bg-white/70 rounded px-1 py-px">Example</span>}
                  </span>
                </button>
              ))
            )}
            {templates && templates.length === 0 && !loadError && (
              <div className="px-3 py-2 text-[12.5px] text-muted">No templates yet.</div>
            )}
          </div>
          <div className="p-3 border-t border-line flex flex-col gap-1.5">
            <button
              onClick={() => open(blank())}
              className="flex items-center justify-center gap-1.5 bg-btn hover:bg-btn-hover px-3 py-2 rounded-full text-[13px] font-medium transition-colors"
            >
              <Plus size={14} strokeWidth={2} /> New template
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <div className="text-[13px] text-muted">{draft ? (draft.example ? "Example template" : draft.id ? "Edit template" : "New template") : "Checklist templates"}</div>
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>

          {loadError && (
            <div className="mx-6 mb-3 rounded-xl bg-[#FDF1E7] text-[#8A4B14] px-4 py-3 text-[13px]">{loadError}</div>
          )}

          {!draft ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-10">
              <ListChecks size={26} strokeWidth={1.5} className="text-muted mb-3" />
              <div className="text-[15px] font-medium">Pick a template or create a new one</div>
              <div className="text-[13px] text-muted mt-1 max-w-[380px]">
                A template is a list of steps grouped in sections. Open any task and choose <b>Checklist</b> to add it, then tick off each step as it’s done.
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-6 pb-4">
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Template name, e.g. Real Estate Purchase"
                  maxLength={80}
                  className="w-full text-[22px] font-semibold bg-transparent outline-none placeholder:text-muted-light mb-3"
                />

                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => {
                      setPasteText(toOutline(draft.sections.filter((s) => s.title || s.items.some((i) => i.text))));
                      setPasteOpen((o) => !o);
                    }}
                    className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors"
                  >
                    <ClipboardPaste size={13} strokeWidth={1.75} /> {pasteOpen ? "Close text view" : "Edit as text / paste a list"}
                  </button>
                  <span className="text-[12px] text-muted">{itemCount(draft)} items</span>
                </div>

                {pasteOpen ? (
                  <div className="mb-4">
                    <div className="text-[12.5px] text-muted mb-2">
                      One section name per line, with its steps underneath starting with <b>*</b> or <b>-</b>. Leave a blank line between sections.
                      To give a step a due date, add the critical date and days after a bar, e.g. <b>* Title Binder Received | Closing date | -14</b>
                    </div>
                    <textarea
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      rows={16}
                      className="w-full border border-line rounded-xl px-3.5 py-3 text-[13px] bg-white outline-none font-mono leading-relaxed"
                    />
                    <button
                      onClick={() => {
                        const parsed = parseOutline(pasteText);
                        if (parsed.length) setDraft({ ...draft, sections: parsed });
                        setPasteOpen(false);
                      }}
                      className="mt-2 bg-btn hover:bg-btn-hover px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors"
                    >
                      Use this list
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {draft.sections.map((s) => (
                      <div key={s.id} className="bg-card-alt rounded-2xl p-3.5">
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            value={s.title}
                            onChange={(e) => setSection(s.id, { title: e.target.value })}
                            placeholder="Section name, e.g. Attorney Review"
                            maxLength={120}
                            className="flex-1 bg-transparent outline-none text-[14px] font-semibold placeholder:text-muted-light placeholder:font-medium"
                          />
                          <button
                            onClick={() => setDraft({ ...draft, sections: draft.sections.filter((x) => x.id !== s.id) })}
                            aria-label="Remove section"
                            title="Remove section"
                            className="w-7 h-7 rounded-full text-muted hover:text-ink hover:bg-chip flex items-center justify-center"
                          >
                            <Trash2 size={13} strokeWidth={1.75} />
                          </button>
                        </div>
                        <div className="flex flex-col gap-1">
                          {s.items.map((i) => (
                            <div key={i.id} className="group flex items-center gap-2">
                              <span className="w-3.5 h-3.5 rounded-[4px] border border-btn-ring flex-shrink-0" aria-hidden />
                              <input
                                value={i.text}
                                onChange={(e) => setSection(s.id, { items: s.items.map((x) => (x.id === i.id ? { ...x, text: e.target.value } : x)) })}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const at = s.items.findIndex((x) => x.id === i.id);
                                    const items = [...s.items];
                                    items.splice(at + 1, 0, { id: uid(), text: "" });
                                    setSection(s.id, { items });
                                    setTimeout(() => (document.activeElement?.closest(".group")?.nextElementSibling?.querySelector("input") as HTMLInputElement | null)?.focus(), 0);
                                  }
                                }}
                                placeholder="Step, e.g. Review Letter Sent Out"
                                maxLength={200}
                                className="flex-1 min-w-0 bg-white/70 focus:bg-white rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                              />
                              <input
                                value={i.anchor ?? ""}
                                onChange={(e) =>
                                  setSection(s.id, {
                                    items: s.items.map((x) => (x.id === i.id ? { ...x, anchor: e.target.value || undefined, days: x.days ?? 0 } : x)),
                                  })
                                }
                                list="lp-anchors"
                                placeholder="Critical date"
                                title="The date this step is counted from, e.g. Closing date (optional)"
                                maxLength={60}
                                className="w-[190px] bg-white/70 focus:bg-white rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
                              />
                              <input
                                type="number"
                                value={i.anchor ? (i.days ?? 0) : ""}
                                disabled={!i.anchor}
                                onChange={(e) => setSection(s.id, { items: s.items.map((x) => (x.id === i.id ? { ...x, days: Number(e.target.value) || 0 } : x)) })}
                                placeholder="Days"
                                title="Days after (+) or before (−) the critical date"
                                className="w-[64px] bg-white/70 focus:bg-white rounded-lg px-2 py-1.5 text-[12.5px] outline-none text-right disabled:opacity-40"
                              />
                              <button
                                onClick={() => setSection(s.id, { items: s.items.filter((x) => x.id !== i.id) })}
                                aria-label="Remove step"
                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 rounded-full text-muted hover:text-ink flex items-center justify-center"
                              >
                                <X size={13} strokeWidth={1.75} />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => setSection(s.id, { items: [...s.items, { id: uid(), text: "" }] })}
                          className="mt-2 ml-1 flex items-center gap-1 text-[12.5px] text-muted hover:text-ink"
                        >
                          <Plus size={13} strokeWidth={1.75} /> Add step
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setDraft({ ...draft, sections: [...draft.sections, { id: uid(), title: "", items: [{ id: uid(), text: "" }] }] })}
                      className="self-start flex items-center gap-1.5 bg-chip hover:bg-btn px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors"
                    >
                      <Plus size={14} strokeWidth={1.75} /> Add section
                    </button>
                  </div>
                )}
              </div>

              <div className="border-t border-line px-6 py-3.5 flex items-center gap-3">
                {draft.example && <span className="text-[12.5px] text-muted">Built-in example. Saving makes your own copy.</span>}
                {draft.id && !draft.example && (
                  <button onClick={onDelete} disabled={busy} className="text-[13px] text-muted hover:text-[#B42318] flex items-center gap-1.5">
                    <Trash2 size={13} strokeWidth={1.75} /> Delete template
                  </button>
                )}
                <div className="flex-1 text-[12.5px] truncate">
                  {error ? <span className="text-[#B42318]">{error}</span> : notice ? <span className="text-muted">{notice}</span> : null}
                </div>
                <button
                  onClick={onSave}
                  disabled={busy || !draft.name.trim() || itemCount(draft) === 0}
                  className="bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {busy && <Loader2 size={13} className="animate-spin" />} {draft.example ? "Save my copy" : "Save template"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
