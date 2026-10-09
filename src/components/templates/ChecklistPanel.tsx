"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, ListChecks, Plus, Trash2, X } from "lucide-react";
import { useTemplates } from "./useTemplates";
import { applyTemplate, progress, type TaskChecklist } from "@/lib/checklist";

// "Checklist" button for the task's property row: pick a template to add.
export function ChecklistPicker({
  checklist,
  onChange,
}: {
  checklist: TaskChecklist | null;
  onChange: (next: TaskChecklist | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { templates, error } = useTemplates();
  const p = progress(checklist);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 bg-chip hover:bg-btn transition-colors px-3 py-1.5 rounded-full text-[13px] font-medium"
      >
        <ListChecks size={13} strokeWidth={1.75} />
        {p.total ? `Checklist ${p.done}/${p.total}` : "Checklist"}
        <ChevronDown size={12} strokeWidth={1.75} className="text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[280px] bg-white border border-line rounded-2xl shadow-[0_12px_32px_rgba(27,25,26,0.12)] p-1.5">
            <div className="px-3 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Add from template</div>
            {templates === null && <div className="px-3 py-2 text-[13px] text-muted">Loading…</div>}
            {error && <div className="px-3 py-2 text-[12.5px] text-[#8A4B14]">{error}</div>}
            {templates && templates.length === 0 && !error && (
              <div className="px-3 py-2 text-[12.5px] text-muted">
                No templates yet. Create one with the <b>Templates</b> button on the Task Board.
              </div>
            )}
            {(templates ?? []).map((t) => {
              const n = t.sections.reduce((k, s) => k + s.items.length, 0);
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    onChange(applyTemplate(checklist, t));
                    setOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium hover:bg-chip transition-colors text-left"
                >
                  <span className="truncate">{t.name}</span>
                  <span className="text-[12px] text-muted flex-shrink-0">{n} steps</span>
                </button>
              );
            })}
            {checklist && (
              <>
                <div className="my-1 border-t border-line" />
                <button
                  onClick={() => {
                    if (confirm("Remove the whole checklist from this task?")) onChange(null);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] text-muted hover:text-[#B42318] hover:bg-chip transition-colors text-left"
                >
                  <Trash2 size={13} strokeWidth={1.75} /> Remove checklist
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// The task's checklist: sections with steps to tick off.
export default function ChecklistPanel({
  checklist,
  onChange,
}: {
  checklist: TaskChecklist;
  onChange: (next: TaskChecklist | null) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const p = progress(checklist);
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;

  function update(sectionId: string, fn: (items: TaskChecklist["sections"][number]["items"]) => TaskChecklist["sections"][number]["items"]) {
    onChange({ ...checklist, sections: checklist.sections.map((s) => (s.id === sectionId ? { ...s, items: fn(s.items) } : s)) });
  }

  return (
    <div className="mb-6 bg-card-alt rounded-2xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <ListChecks size={15} strokeWidth={1.75} className="text-muted" />
        <div className="text-[14px] font-semibold">Checklist</div>
        {checklist.templates.length > 0 && <div className="text-[12.5px] text-muted truncate">{checklist.templates.join(" + ")}</div>}
        <div className="ml-auto text-[12.5px] text-muted flex-shrink-0">
          <span className="text-ink font-medium">{p.done}</span> of {p.total} done
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-white overflow-hidden mb-4" aria-hidden>
        <div className="h-full rounded-full bg-[#2F9E5A] transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex flex-col gap-2">
        {checklist.sections.map((s) => {
          const done = s.items.filter((i) => i.done).length;
          const isCollapsed = collapsed[s.id] ?? false;
          return (
            <div key={s.id} className="bg-page rounded-xl px-3 py-2.5">
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [s.id]: !isCollapsed }))}
                className="w-full flex items-center gap-2 text-left"
              >
                {isCollapsed ? <ChevronRight size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
                <span className="text-[13.5px] font-semibold flex-1 truncate">{s.title || "Steps"}</span>
                <span className={`text-[12px] flex-shrink-0 ${done === s.items.length && s.items.length ? "text-[#2F9E5A] font-medium" : "text-muted"}`}>
                  {done}/{s.items.length}
                </span>
              </button>
              {!isCollapsed && (
                <div className="mt-1.5 flex flex-col">
                  {s.items.map((i) => (
                    <div key={i.id} className="group flex items-center gap-2.5 py-[5px] pl-5">
                      <button
                        role="checkbox"
                        aria-checked={i.done}
                        aria-label={i.text}
                        onClick={() =>
                          update(s.id, (items) =>
                            items.map((x) => (x.id === i.id ? { ...x, done: !x.done, doneAt: !x.done ? new Date().toISOString() : null } : x))
                          )
                        }
                        className={`w-[17px] h-[17px] rounded-[5px] flex items-center justify-center flex-shrink-0 transition-colors ${
                          i.done ? "bg-[#2F9E5A] text-white" : "bg-white border border-btn-ring hover:border-muted"
                        }`}
                      >
                        {i.done && <Check size={12} strokeWidth={3} />}
                      </button>
                      <span className={`text-[13.5px] flex-1 ${i.done ? "line-through text-muted" : ""}`}>{i.text}</span>
                      {i.done && i.doneAt && (
                        <span className="text-[11.5px] text-muted-light flex-shrink-0">
                          {new Date(i.doneAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      )}
                      <button
                        onClick={() => update(s.id, (items) => items.filter((x) => x.id !== i.id))}
                        aria-label={`Remove ${i.text}`}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-5 h-5 rounded-full text-muted hover:text-ink flex items-center justify-center flex-shrink-0"
                      >
                        <X size={12} strokeWidth={1.75} />
                      </button>
                    </div>
                  ))}
                  {adding === s.id ? (
                    <form
                      className="pl-5 pt-1 flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const t = newText.trim();
                        if (t) update(s.id, (items) => [...items, { id: crypto.randomUUID(), text: t.slice(0, 200), done: false, doneAt: null }]);
                        setNewText("");
                      }}
                    >
                      <input
                        autoFocus
                        value={newText}
                        onChange={(e) => setNewText(e.target.value)}
                        onBlur={() => !newText.trim() && setAdding(null)}
                        onKeyDown={(e) => e.key === "Escape" && setAdding(null)}
                        placeholder="New step, press Enter"
                        maxLength={200}
                        className="flex-1 bg-white rounded-lg px-2.5 py-1.5 text-[13px] outline-none border border-line"
                      />
                    </form>
                  ) : (
                    <button
                      onClick={() => {
                        setAdding(s.id);
                        setNewText("");
                      }}
                      className="ml-5 mt-1 self-start flex items-center gap-1 text-[12.5px] text-muted hover:text-ink"
                    >
                      <Plus size={12} strokeWidth={1.75} /> Add step
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
