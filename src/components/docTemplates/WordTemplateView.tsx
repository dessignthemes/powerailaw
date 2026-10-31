"use client";

import { useEffect, useState } from "react";
import { FileText, Wand2, History, Trash2, Loader2, RotateCcw, FilePlus2, ArrowLeft, X } from "lucide-react";
import UseForMatterModal from "@/components/docTemplates/UseForMatterModal";
import type { DocTemplate } from "@/lib/docTemplates/format";
import { FIELD_TYPES } from "@/lib/docTemplates/vocabulary";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import type { Matter } from "@/components/NewMatterModal";

type Version = { version: number; name: string; createdAt: string; createdBy: string | null; note: string; fieldCount: number };

// A template made from the firm's own Word file: fields, a preview, making a
// document for a matter, editing in the template maker, and version history.
export default function WordTemplateView({ template, matters, onEdit, onChanged, onDeleted, onClose }: { template: DocTemplate; matters: Matter[]; onEdit: () => void; onChanged: () => void; onDeleted: () => void; onClose?: () => void }) {
  const { teamMembers } = useWorkspaceData();
  const [using, setUsing] = useState(false);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = (id: string | null) => teamMembers.find((m) => m.id === id)?.fullName ?? "someone";

  useEffect(() => {
    if (!showHistory) return;
    let live = true;
    fetch(`/api/doc-templates/${template.id}/versions`)
      .then((r) => r.json())
      .then((d) => live && setVersions(d.versions ?? []))
      .catch(() => live && setVersions([]));
    return () => {
      live = false;
    };
  }, [showHistory, template.id, template.version]);

  async function restore(v: number) {
    if (!confirm(`Go back to version ${v}? It's saved as a new version, so nothing is lost.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/doc-templates/${template.id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restore: v }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Couldn't restore that version.");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirm(`Delete “${template.name}”? Documents already created from it are not affected.`)) return;
    const r = await fetch(`/api/doc-templates/${template.id}`, { method: "DELETE" });
    if (r.ok) onDeleted();
    else setError((await r.json().catch(() => ({}))).error ?? "Couldn't delete it.");
  }

  const chip = "flex items-center gap-1.5 bg-white hover:bg-btn px-3 py-1.5 rounded-full text-[13px] font-medium";
  const typeLabel = (t?: string) => FIELD_TYPES.find((x) => x.value === (t ?? "text"))?.label ?? "Text";
  return (
    <div>
      {onClose && (
        <div className="flex items-center justify-between mb-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
            <ArrowLeft size={14} /> All templates
          </button>
          <button onClick={onClose} aria-label="Close" title="Close" className="w-8 h-8 rounded-full hover:bg-white flex items-center justify-center text-muted hover:text-ink">
            <X size={16} />
          </button>
        </div>
      )}
      <div className="flex items-start gap-3 flex-wrap mb-1">
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-muted flex items-center gap-1.5">
            <FileText size={12} /> Word template · version {template.version ?? 1} · formatting kept
          </div>
          <h2 className="text-[22px] font-semibold">{template.name}</h2>
          <div className="text-[13px] text-muted">{[template.category, template.description].filter(Boolean).join(" · ")}</div>
        </div>
        <button onClick={() => setUsing(true)} className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium">
          <FilePlus2 size={14} /> Make a document
        </button>
      </div>
      <div className="flex gap-2 flex-wrap my-4">
        <button onClick={onEdit} className={chip}>
          <Wand2 size={13} /> Edit in template maker
        </button>
        <button onClick={() => setShowHistory((s) => !s)} className={chip}>
          <History size={13} /> Version history
        </button>
        <button onClick={() => void remove()} className={`${chip} ml-auto text-[#B42318]`}>
          <Trash2 size={13} /> Delete
        </button>
      </div>
      {error && <div className="rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-3.5 py-2 text-[13px] mb-3">{error}</div>}
      {showHistory && (
        <div className="bg-white rounded-xl border border-line mb-4 divide-y divide-line">
          {versions === null ? (
            <div className="px-4 py-3 text-[13px] text-muted flex items-center gap-2">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </div>
          ) : (
            versions.map((v) => (
              <div key={v.version} className="px-4 py-2.5 flex items-center gap-3 text-[13px]">
                <span className="font-semibold w-[70px]">v{v.version}</span>
                <span className="flex-1 min-w-0 truncate">
                  {new Date(v.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} by {who(v.createdBy)} · {v.fieldCount} fields
                  {v.note && <span className="text-muted"> · {v.note}</span>}
                </span>
                {v.version === template.version ? (
                  <span className="text-[12px] text-muted">current</span>
                ) : (
                  <button disabled={busy} onClick={() => void restore(v.version)} className="flex items-center gap-1 text-[12.5px] underline underline-offset-2 disabled:opacity-50">
                    <RotateCcw size={12} /> Restore
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="bg-white rounded-xl border border-line px-6 py-5 text-[13.5px] leading-relaxed font-[Georgia,'Times_New_Roman',serif] max-h-[560px] overflow-y-auto whitespace-pre-wrap">
          {template.body.split(/(\{\{[#/]?[a-zA-Z][a-zA-Z0-9_]*\}\})/).map((part, i) =>
            /^\{\{/.test(part) ? (
              <span key={i} className="font-sans text-[12px] bg-[#E1E7F5] rounded px-1 py-0.5">
                {part}
              </span>
            ) : (
              <span key={i}>{part}</span>
            )
          )}
        </div>
        <div className="bg-white rounded-xl border border-line p-4">
          <div className="text-[13px] font-semibold mb-2">Fields ({template.fields.length})</div>
          <div className="flex flex-col gap-1.5">
            {template.fields.map((f) => (
              <div key={f.key} className="text-[12.5px]">
                <span className="font-medium">{f.label}</span>
                {f.required && <span className="text-[#B42318]"> *</span>}
                <span className="text-muted"> · {typeLabel(f.type)}</span>
                {f.default && <span className="text-muted"> · default “{f.default}”</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {using && <UseForMatterModal template={{ id: template.id, name: template.name, body: template.body, fields: template.fields, format: "docx" }} matters={matters} onClose={() => setUsing(false)} />}
    </div>
  );
}
