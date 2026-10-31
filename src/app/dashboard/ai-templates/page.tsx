"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles, ClipboardPaste, FileText, Plus, ChevronDown, Loader2, BookOpenText, ListChecks, Wand2 } from "lucide-react";
import TemplatesModal from "@/components/templates/TemplatesModal";
import type { TaskTemplate } from "@/lib/checklist";
import ClickAway from "@/components/ClickAway";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import TemplateEditor, { type EditorValue } from "@/components/docTemplates/TemplateEditor";
import TemplateMaker, { type MakerDraft } from "@/components/docTemplates/TemplateMaker";
import WordTemplateView from "@/components/docTemplates/WordTemplateView";
import { CreateWithAiModal, FromTextModal, UploadButton, type Draft } from "@/components/docTemplates/CreateModals";
import { TEMPLATE_CATEGORIES, type DocTemplate } from "@/lib/docTemplates/format";
import { readJson, chip } from "@/components/docTemplates/shared";

type Modal = { kind: "ai" } | { kind: "text"; source: "paste" | "upload"; text?: string; name?: string } | null;

// AI Templates: document templates (deeds, letters, agreements…) the firm makes
// with AI, from pasted text, from a Word/PDF upload, or by hand; filled for a
// matter they become Word documents in the matter's Documents.
export default function AiTemplatesPage() {
  const { matters } = useWorkspaceData();
  const [mine, setMine] = useState<DocTemplate[] | null>(null);
  const [samples, setSamples] = useState<DocTemplate[]>([]);
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [open, setOpen] = useState<EditorValue | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [reload, setReload] = useState(0);
  // Template maker (the firm's own Word file → a reusable template).
  const [maker, setMaker] = useState<MakerDraft | null>(null);
  const [makerBusy, setMakerBusy] = useState(false);
  const [wordOpen, setWordOpen] = useState<string | null>(null); // id of an open Word template
  async function startMaker(file: File | undefined) {
    if (!file) return;
    setMakerBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      setMaker(await fetch("/api/doc-templates/maker", { method: "POST", body: form }).then(readJson));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMakerBusy(false);
    }
  }
  async function editInMaker(id: string) {
    setMakerBusy(true);
    setError(null);
    try {
      setMaker(await fetch("/api/doc-templates/maker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open", templateId: id }) }).then(readJson));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMakerBusy(false);
    }
  }
  // Workflow checklists (Task Board templates) live here too, with the same filters.
  const [workflows, setWorkflows] = useState<TaskTemplate[] | null>(null);
  const [workflowModal, setWorkflowModal] = useState<{ id: string | null } | null>(null);
  const [wfReload, setWfReload] = useState(0);
  useEffect(() => {
    let live = true;
    fetch("/api/task-templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => live && setWorkflows(d.templates ?? []))
      .catch(() => live && setWorkflows([]));
    return () => {
      live = false;
    };
  }, [wfReload]);
  useEffect(() => {
    // ?workflow=new (from Task Board → Add template) opens a new workflow checklist.
    const t = setTimeout(() => {
      const w = new URLSearchParams(window.location.search).get("workflow");
      if (w) {
        setWorkflowModal({ id: w === "new" ? null : w });
        window.history.replaceState(null, "", window.location.pathname);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/doc-templates")
      .then(readJson)
      .then((d) => {
        if (!live) return;
        setMine(d.templates ?? []);
        setSamples(d.samples ?? []);
        setSetupRequired(!!d.setupRequired);
      })
      .catch((e: Error) => live && (setError(e.message), setMine([])));
    return () => {
      live = false;
    };
  }, [reload]);

  const show = (t: DocTemplate) => {
    setWorkflowModal(null);
    if (t.format === "docx") {
      setOpen(null);
      setWordOpen(t.id);
      return;
    }
    setWordOpen(null);
    setOpen({ id: t.sample ? undefined : t.id, name: t.name, category: t.category, description: t.description, body: t.body, fields: t.fields, source: t.source, sample: t.sample });
    setEditorKey((k) => k + 1);
  };
  const fromDraft = (d: Draft) => {
    setModal(null);
    setWorkflowModal(null);
    setOpen({ ...d });
    setEditorKey((k) => k + 1);
  };
  const filterFn = (t: DocTemplate) => (!cat || t.category === cat) && (!q.trim() || `${t.name} ${t.description}`.toLowerCase().includes(q.trim().toLowerCase()));
  const wfCategory = (t: TaskTemplate) => {
    if (t.category) return t.category;
    const codes = (t.matterCodes ?? []).join(" ");
    const n = `${t.name} ${codes}`.toLowerCase();
    if (/immigra|status|citizen|natural|visa|i-?\d{3}|\bil\b|\bimm\b/.test(n)) return "Immigration";
    if (/real estate|purchase|sale|closing|\brep\b|\bres\b|deed|mortgage/.test(n)) return "Real Estate";
    if (/probate|administration|estate\b|\badm\b|\bpro\b|trust/.test(n)) return "Probate";
    if (/litigation|\blit\b|complaint|discovery/.test(n)) return "Litigation";
    return "Other";
  };
  const wfList = useMemo(
    () => (workflows ?? []).filter((t) => (!cat || wfCategory(t) === cat) && (!q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase()))),
    [workflows, q, cat]  
  );
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const t of [...(mine ?? []), ...samples]) if (t.category) set.add(t.category);
    for (const t of workflows ?? []) set.add(wfCategory(t));
    return TEMPLATE_CATEGORIES.filter((c) => set.has(c)).concat([...set].filter((c) => !TEMPLATE_CATEGORIES.includes(c)));
  }, [mine, samples, workflows]);  
  const myList = useMemo(() => (mine ?? []).filter(filterFn), [mine, q, cat]); // eslint-disable-line react-hooks/exhaustive-deps
  const sampleList = useMemo(() => samples.filter(filterFn), [samples, q, cat]); // eslint-disable-line react-hooks/exhaustive-deps

  const newMenu = (
    <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[260px] bg-white border border-line rounded-2xl shadow-[0_12px_32px_rgba(27,25,26,0.12)] p-1.5">
      {(
        [
          ["ai", <Sparkles key="a" size={14} />, "Create with AI", "Describe it; the AI drafts it"],
          ["paste", <ClipboardPaste key="p" size={14} />, "Paste text", "From a document or email"],
          ["blank", <FileText key="b" size={14} />, "Start blank", "Write it yourself"],
          ["workflow", <ListChecks key="w" size={14} />, "Workflow checklist", "Steps for a task (Task Board)"],
        ] as [string, React.ReactNode, string, string][]
      ).map(([k, icon, label, sub]) => (
        <button
          key={k}
          onClick={() => {
            setNewOpen(false);
            if (k === "word") (document.getElementById("lp-word-file") as HTMLInputElement | null)?.click();
            else if (k === "ai") setModal({ kind: "ai" });
            else if (k === "paste") setModal({ kind: "text", source: "paste" });
            else if (k === "workflow") {
              setOpen(null);
              setWorkflowModal({ id: null });
            }
            else fromDraft({ name: "", category: "", description: "", body: "", fields: [], source: "blank" });
          }}
          className="w-full text-left flex items-start gap-2.5 px-3 py-2 rounded-xl hover:bg-chip"
        >
          <span className="mt-0.5 text-muted">{icon}</span>
          <span>
            <span className="block text-[13.5px] font-medium">{label}</span>
            <span className="block text-[12px] text-muted">{sub}</span>
          </span>
        </button>
      ))}
      <div className="px-1.5 pb-1 pt-1">
        <UploadButton className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-chip text-[13.5px] font-medium" onText={(text, name) => (setNewOpen(false), setModal({ kind: "text", source: "upload", text, name }))} />
      </div>
    </div>
  );

  const row = (t: DocTemplate) => (
    <button
      key={t.id}
      onClick={() => show(t)}
      className={`w-full text-left px-3.5 py-2.5 rounded-xl transition-colors ${open && (open.id === t.id || (t.sample && open.sample && open.name === t.name)) ? "bg-btn" : "bg-[#E1E7F5] hover:bg-[#D5DDEE]"}`}
    >
      <div className="text-[13.5px] font-medium truncate">{t.name}</div>
      <div className="text-[12px] text-muted truncate">{[t.category, t.description].filter(Boolean).join(" · ") || "No description"}</div>
    </button>
  );

  // A new template (blank, from AI, pasted or uploaded, or a copy) opens in a pop-up window;
  // saved templates and samples open on the page.
  const newDraft = !!open && !open.id && !open.sample;
  const editor = open ? (
            <TemplateEditor
              key={editorKey}
              value={open}
              matters={matters}
              onClose={() => setOpen(null)}
              onSaved={(t) => {
                setReload((r) => r + 1);
                setOpen((o) => (o ? { ...o, id: t.id, sample: false, source: t.source } : o));
              }}
              onDeleted={() => {
                setOpen(null);
                setReload((r) => r + 1);
              }}
              onCopy={() => {
                if (!open) return;
                setOpen({ ...open, id: undefined, sample: false, source: "blank", name: `${open.name} (copy)` });
                setEditorKey((k) => k + 1);
              }}
            />
  ) : null;

  return (
    <div className="px-10 py-10 max-w-[1500px]">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-[28px] font-semibold">AI Templates</h1>
          <p className="text-[14.5px] text-muted mt-1 max-w-[760px]">
            All your templates in one place. <b>Document templates</b> (deeds, letters, agreements): create one with AI, from pasted text, from a Word or PDF, or from scratch, then fill it
            for a matter and get a Word document. <b>Workflow checklists</b>: the step-by-step lists you add to tasks on the Task Board.
          </p>
        </div>
        <div className="relative">
          <button onClick={() => setNewOpen((o) => !o)} className="bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5">
            <Plus size={14} /> New template <ChevronDown size={13} />
          </button>
          {newOpen && (
            <>
              <ClickAway onClose={() => setNewOpen(false)} />
              {newMenu}
            </>
          )}
        </div>
      </div>

      {setupRequired && (
        <div className="mb-5 rounded-xl bg-[#FFF8EE] border border-[#F6D4A6] px-4 py-3 text-[13.5px]">
          Saving your own templates needs a one-time database update: run <b>supabase/migrations/0049_doc_templates.sql</b> in the Supabase SQL editor, then refresh. The samples and AI drafting work meanwhile.
        </div>
      )}
      {error && <div className="mb-5 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3 text-[13.5px]">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">
        <aside className="bg-card-alt rounded-2xl p-4">
          <div className="flex items-center gap-2 bg-white rounded-full px-3 py-2 mb-3">
            <Search size={14} className="text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates" aria-label="Search templates" className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px]" />
          </div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            <button onClick={() => setCat("")} className={`px-2.5 py-1 rounded-full text-[12px] font-medium ${!cat ? "bg-btn-hover" : "bg-white hover:bg-btn"}`}>
              All
            </button>
            {allCategories.map((c) => (
              <button key={c} onClick={() => setCat(c === cat ? "" : c)} className={`px-2.5 py-1 rounded-full text-[12px] font-medium ${cat === c ? "bg-btn-hover" : "bg-white hover:bg-btn"}`}>
                {c}
              </button>
            ))}
          </div>
          <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted mb-1.5">Your templates{mine ? ` (${myList.length})` : ""}</div>
          {mine === null ? (
            <div className="text-[13px] text-muted flex items-center gap-2 py-2">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </div>
          ) : myList.length === 0 ? (
            <div className="text-[12.5px] text-muted py-2 mb-2">{mine.length ? "No templates match." : "None yet. Use New template, or copy a sample."}</div>
          ) : (
            <div className="flex flex-col gap-1.5 mb-4">{myList.map(row)}</div>
          )}
          <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted mb-1.5 mt-3">Samples ({sampleList.length})</div>
          <div className="flex flex-col gap-1.5">{sampleList.map(row)}</div>

          <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted mb-1.5 mt-5 flex items-center gap-1.5">
            <ListChecks size={12} /> Workflow checklists{workflows ? ` (${wfList.length})` : ""}
          </div>
          <p className="text-[12px] text-muted mb-2">Step-by-step checklists for tasks on the Task Board.</p>
          {workflows === null ? (
            <div className="text-[13px] text-muted flex items-center gap-2 py-2">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </div>
          ) : wfList.length === 0 ? (
            <div className="text-[12.5px] text-muted py-2">No workflows match.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {wfList.map((t) => (
                <button key={t.id} onClick={() => (setOpen(null), setWorkflowModal({ id: t.id }))} className={`w-full text-left px-3.5 py-2.5 rounded-xl transition-colors ${workflowModal?.id === t.id ? "bg-btn" : "bg-[#E1E7F5] hover:bg-[#D5DDEE]"}`}>
                  <div className="text-[13.5px] font-medium truncate flex items-center gap-1.5">
                    <span className="truncate">{t.name}</span>
                    {t.example && <span className="text-[10px] font-semibold bg-white rounded px-1 flex-shrink-0">SAMPLE</span>}
                  </div>
                  <div className="text-[12px] text-muted truncate">
                    {wfCategory(t)} · {t.sections.reduce((n, s) => n + s.items.length, 0)} steps
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="bg-card-alt rounded-2xl p-6 min-h-[560px]">
          {workflowModal ? (
            <TemplatesModal
              key={workflowModal.id ?? "new"}
              inline
              initialId={workflowModal.id}
              onClose={() => {
                setWorkflowModal(null);
                setWfReload((r) => r + 1);
              }}
            />
          ) : wordOpen && (mine ?? []).some((t) => t.id === wordOpen) ? (
            <WordTemplateView
              key={`${wordOpen}-${(mine ?? []).find((t) => t.id === wordOpen)?.version}`}
              template={(mine ?? []).find((t) => t.id === wordOpen)!}
              matters={matters}
              onEdit={() => void editInMaker(wordOpen)}
              onChanged={() => setReload((r) => r + 1)}
              onDeleted={() => {
                setWordOpen(null);
                setReload((r) => r + 1);
              }}
              onClose={() => setWordOpen(null)}
            />
          ) : open && !newDraft ? (
            editor
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-10">
              <BookOpenText size={30} strokeWidth={1.5} className="text-muted mb-3" />
              <div className="text-[23px] font-semibold">Make a template</div>
              <p className="text-[13.5px] text-muted mt-1 max-w-[560px]">Pick a sample on the left to see how templates work, or start one of these.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6 w-full max-w-[720px]">
                {(
                  [
                    [<Wand2 key="w" size={18} />, makerBusy ? "Opening your document…" : "From your Word file", "Upload a .docx you already use. Mark the parts that change; your formatting, letterhead and numbering are kept.", () => (document.getElementById("lp-word-file") as HTMLInputElement | null)?.click()],
                    [<Sparkles key="a" size={18} />, "Create with AI", "Describe the document; the AI drafts it with fill-in fields.", () => setModal({ kind: "ai" })],
                    [<ClipboardPaste key="p" size={18} />, "Paste text", "From a document or email; the AI finds the fill-in parts.", () => setModal({ kind: "text", source: "paste" })],
                    [<FileText key="b" size={18} />, "Start blank", "Write it yourself and insert fields.", () => fromDraft({ name: "", category: "", description: "", body: "", fields: [], source: "blank" })],
                  ] as [React.ReactNode, string, string, () => void][]
                ).map(([icon, title, sub, fn]) => (
                  <button key={title} onClick={fn} className="bg-white hover:bg-btn rounded-2xl p-5 text-left transition-[background-color,box-shadow] shadow-[0_1px_2px_rgba(27,25,26,0.14)] hover:shadow-[0_2px_6px_rgba(27,25,26,0.16)]">
                    <div className="text-muted mb-2">{icon}</div>
                    <div className="text-[14.5px] font-semibold">{title}</div>
                    <div className="text-[12.5px] text-muted mt-1">{sub}</div>
                  </button>
                ))}
                <div className="bg-white rounded-2xl p-5 text-left shadow-[0_1px_2px_rgba(27,25,26,0.14)]">
                  <div className="text-muted mb-2">
                    <FileText size={18} />
                  </div>
                  <div className="text-[14.5px] font-semibold">Upload Word or PDF</div>
                  <div className="text-[12.5px] text-muted mt-1 mb-3">A document you already use; the AI turns it into a template.</div>
                  <UploadButton className={chip} onText={(text, name) => setModal({ kind: "text", source: "upload", text, name })} />
                </div>
              </div>
              <p className="text-[12px] text-muted mt-6 max-w-[560px]">Templates are drafts for an attorney&apos;s review. The AI uses only what you give it and the matter&apos;s facts; check names, dates, amounts and citations before sending anything.</p>
            </div>
          )}
        </section>
      </div>

      <input id="lp-word-file" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => (void startMaker(e.target.files?.[0]), (e.target.value = ""))} />
      {maker && (
        <TemplateMaker
          draft={maker}
          onClose={() => setMaker(null)}
          onSaved={(id) => {
            setMaker(null);
            setOpen(null);
            setWorkflowModal(null);
            setWordOpen(id);
            setReload((r) => r + 1);
          }}
        />
      )}
      {newDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4 py-6">
          <div role="dialog" aria-label="New template" className="bg-card-alt rounded-3xl w-full max-w-[1180px] max-h-full overflow-y-auto p-6 shadow-[0_30px_80px_-20px_rgba(18,17,16,0.35)]">
            {editor}
          </div>
        </div>
      )}
      {modal?.kind === "ai" && <CreateWithAiModal onClose={() => setModal(null)} onDraft={fromDraft} />}
      {modal?.kind === "text" && <FromTextModal source={modal.source} initialText={modal.text} initialName={modal.name} onClose={() => setModal(null)} onDraft={fromDraft} />}
    </div>
  );
}
