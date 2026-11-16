"use client";

import { useRef, useState } from "react";
import { Paperclip, Upload, FolderOpen, X, Loader2, Download, Eye } from "lucide-react";
import type { TaskAttachment } from "@/components/NewTaskModal";
import { uploadAnyDocument, versionDownloadUrl, UploadError } from "@/lib/pdf/upload";
import PdfPreview from "@/components/pdf/PdfPreview";

// Documents attached to a task: picked from the matter's Documents, or a file
// uploaded (it's added to the matter's Documents and attached). The assignee
// opens them from the task.

type Doc = { id: string; title: string; versions: { id: string; fileType?: string }[] };

export default function TaskAttachments({
  matterId,
  value,
  onChange,
  compact = false,
}: {
  matterId: string | null;
  value: TaskAttachment[];
  onChange: (next: TaskAttachment[]) => void;
  compact?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<TaskAttachment | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function openPicker() {
    setPicking((p) => !p);
    if (docs || !matterId) return;
    fetch(`/api/documents?matterId=${matterId}`)
      .then((r) => (r.ok ? r.json() : { documents: [] }))
      .then((d) => setDocs((d.documents ?? []) as Doc[]))
      .catch(() => setDocs([]));
  }
  const add = (a: TaskAttachment) => {
    if (!value.some((x) => x.documentId === a.documentId)) onChange([...value, a]);
  };
  async function upload(files: FileList | null) {
    if (!files?.length || !matterId) return;
    setBusy(true);
    setError(null);
    try {
      const added: TaskAttachment[] = [];
      for (const f of Array.from(files)) {
        const doc = (await uploadAnyDocument(matterId, f)) as Doc;
        const v = doc.versions?.[0];
        if (v) added.push({ documentId: doc.id, versionId: v.id, name: doc.title, fileType: v.fileType });
      }
      onChange([...value, ...added.filter((a) => !value.some((x) => x.documentId === a.documentId))]);
    } catch (e) {
      setError(e instanceof UploadError ? e.message : "The file couldn't be uploaded. Please try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function download(a: TaskAttachment) {
    window.location.assign(await versionDownloadUrl(a.versionId, true));
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-col gap-1">
          {value.map((a) => (
            <div key={a.documentId} className="flex items-center gap-2 rounded-lg bg-[#FCFCFC] border border-[#EBEAE7] px-2.5 py-1.5 text-[13px]">
              <Paperclip size={13} className="text-muted flex-shrink-0" />
              <span className="flex-1 min-w-0 truncate">{a.name}</span>
              {(a.fileType ?? "pdf") === "pdf" && (
                <button type="button" onClick={() => setPreview(a)} className="w-7 h-7 rounded-full hover:bg-[#F3F2F0] flex items-center justify-center text-muted" title="Preview" aria-label={`Preview ${a.name}`}>
                  <Eye size={13} />
                </button>
              )}
              <button type="button" onClick={() => void download(a)} className="w-7 h-7 rounded-full hover:bg-[#F3F2F0] flex items-center justify-center text-muted" title="Download" aria-label={`Download ${a.name}`}>
                <Download size={13} />
              </button>
              <button type="button" onClick={() => onChange(value.filter((x) => x.documentId !== a.documentId))} className="w-7 h-7 rounded-full hover:bg-[#F3F2F0] flex items-center justify-center text-muted" title="Remove from the task (the document stays on the matter)" aria-label={`Remove ${a.name}`}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {matterId ? (
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={openPicker} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium bg-chip border border-btn hover:bg-btn">
            <FolderOpen size={13} /> From the matter&apos;s documents
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium bg-chip border border-btn hover:bg-btn disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {busy ? "Uploading…" : "Upload a file"}
          </button>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} />
        </div>
      ) : (
        <div className={`text-[12.5px] text-muted ${compact ? "" : "py-2"}`}>Pick the task&apos;s matter first: attached files are kept with the matter&apos;s Documents.</div>
      )}
      {picking && matterId && (
        <div className="rounded-xl border border-[#E8E6E2] bg-white p-1.5 max-h-[220px] overflow-y-auto">
          {!docs ? (
            <div className="p-3 text-[12.5px] text-muted flex items-center gap-2">
              <Loader2 size={13} className="animate-spin" /> Loading documents…
            </div>
          ) : docs.length === 0 ? (
            <div className="p-3 text-[12.5px] text-muted">No documents on this matter yet. Use Upload a file.</div>
          ) : (
            docs.map((d) => {
              const on = value.some((x) => x.documentId === d.id);
              const v = d.versions?.[0];
              return (
                <button
                  key={d.id}
                  type="button"
                  disabled={!v}
                  onClick={() => (on ? onChange(value.filter((x) => x.documentId !== d.id)) : v && add({ documentId: d.id, versionId: v.id, name: d.title, fileType: v.fileType }))}
                  className={`w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] ${on ? "bg-[#E8F6EE]" : "hover:bg-[#F3F2F0]"}`}
                >
                  <Paperclip size={12} className="text-muted" />
                  <span className="flex-1 truncate">{d.title}</span>
                  {on && <span className="text-[11.5px] text-[#1F7A4D]">Attached</span>}
                </button>
              );
            })
          )}
        </div>
      )}
      {error && <div className="text-[12.5px] text-[#B42318]">{error}</div>}
      {preview && <PdfPreview documentId={preview.documentId} versionId={preview.versionId} title={preview.name} subtitle="Attached to the task" onClose={() => setPreview(null)} />}
    </div>
  );
}

// "15:30" → "3:30 PM"
export function timeLabel(t: string | null | undefined) {
  if (!t || !/^\d\d:\d\d$/.test(t)) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
