"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, ClipboardPaste, FileText, ListChecks, Plus, ChevronDown, Check, X } from "lucide-react";
import ClickAway from "@/components/ClickAway";
import TemplatesModal from "@/components/templates/TemplatesModal";
import TemplateEditor, { type EditorValue } from "@/components/docTemplates/TemplateEditor";
import { CreateWithAiModal, FromTextModal, UploadButton, type Draft } from "@/components/docTemplates/CreateModals";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import { pageBtnB, pageBtnOpenB, menuPanel } from "@/lib/ui";

type Modal = { kind: "ai" } | { kind: "text"; source: "paste" | "upload"; text?: string; name?: string } | null;

// "+ Add template" with the same menu as AI Templates → New template. Every choice opens
// as a pop-up right here (no jump to another page).
export default function NewTemplateMenu({ label = "Add template" }: { label?: string }) {
  const { matters } = useWorkspaceData();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [draft, setDraft] = useState<EditorValue | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [workflow, setWorkflow] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fromDraft = (d: Draft) => {
    setModal(null);
    setDraft({ ...d });
    setEditorKey((k) => k + 1);
  };
  const choose = (k: string) => {
    setOpen(false);
    if (k === "ai") setModal({ kind: "ai" });
    else if (k === "paste") setModal({ kind: "text", source: "paste" });
    else if (k === "workflow") setWorkflow(true);
    else fromDraft({ name: "", category: "", description: "", body: "", fields: [], source: "blank" });
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className={open ? pageBtnOpenB : pageBtnB}>
        <Plus size={14} /> {label} <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <ClickAway onClose={() => setOpen(false)} />
          <div role="menu" className={`absolute right-0 top-[calc(100%+14px)] z-50 w-[260px] ${menuPanel}`}>
            {(
              [
                ["ai", <Sparkles key="a" size={14} />, "Create with AI", "Describe it; the AI drafts it"],
                ["paste", <ClipboardPaste key="p" size={14} />, "Paste text", "From a document or email"],
                ["blank", <FileText key="b" size={14} />, "Start blank", "Write it yourself"],
                ["workflow", <ListChecks key="w" size={14} />, "Workflow checklist", "Steps for a task (Task Board)"],
              ] as [string, React.ReactNode, string, string][]
            ).map(([k, icon, l, sub]) => (
              <button key={k} role="menuitem" onClick={() => choose(k)} className="w-full text-left flex items-start gap-2.5 px-3 py-2 rounded-xl hover:bg-[#F7F6F2]">
                <span className="mt-0.5 text-muted">{icon}</span>
                <span>
                  <span className="block text-[13.5px] font-medium">{l}</span>
                  <span className="block text-[12px] text-muted">{sub}</span>
                </span>
              </button>
            ))}
            <div className="px-1.5 pb-1 pt-1">
              <UploadButton
                className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#F7F6F2] text-[13.5px] font-medium"
                onText={(text, name) => (setOpen(false), setModal({ kind: "text", source: "upload", text, name }))}
              />
            </div>
          </div>
        </>
      )}

      {modal?.kind === "ai" && <CreateWithAiModal onClose={() => setModal(null)} onDraft={fromDraft} />}
      {modal?.kind === "text" && <FromTextModal source={modal.source} initialText={modal.text} initialName={modal.name} onClose={() => setModal(null)} onDraft={fromDraft} />}

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4 py-6">
          <div role="dialog" aria-label="New template" className="bg-card-alt rounded-3xl w-full max-w-[1180px] max-h-full overflow-y-auto p-6 shadow-[0_30px_80px_-20px_rgba(18,17,16,0.35)] text-left">
            <TemplateEditor
              key={editorKey}
              value={draft}
              matters={matters}
              onClose={() => setDraft(null)}
              onSaved={(t) => {
                setDraft(null);
                setNotice(`“${t.name || "Template"}” was saved to AI Templates.`);
              }}
              onDeleted={() => setDraft(null)}
              onCopy={() => {
                setDraft((d) => (d ? { ...d, id: undefined, sample: false, source: "blank", name: `${d.name} (copy)` } : d));
                setEditorKey((k) => k + 1);
              }}
            />
          </div>
        </div>
      )}

      {workflow && <TemplatesModal onClose={() => setWorkflow(false)} />}

      {notice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-white rounded-full pl-4 pr-2 py-2 text-[13px] shadow-[0_0_0_6px_#F2F0EA,0_0_0_7px_#EBE8DF,0_18px_40px_-14px_rgba(18,17,16,0.3)]">
          <Check size={14} className="text-[#2F5E2A]" /> {notice}
          <Link href="/dashboard/ai-templates" className="font-medium underline underline-offset-2">Open AI Templates</Link>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="w-6 h-6 rounded-full hover:bg-[#F7F6F2] flex items-center justify-center text-muted">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
