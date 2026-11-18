"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, FolderOpen, Upload, X, Loader2, Search, Check, ShieldCheck } from "lucide-react";

// Documents sent with an email from a matter: picked from the matter's
// Documents, or files dragged in / chosen from the computer (they're saved to
// the matter's Documents first). Too big for an email (over 18 MB together)?
// They go on the matter's secure client portal and the email gets a link.

export type Attached = { id: string; title: string; size: number };
type Doc = { id: string; title: string; versions: { sizeBytes?: number }[] };

export const ATTACH_LIMIT = 18 * 1024 * 1024; // same as the server (lib/mail/matterAttachments)
const mb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function EmailAttachments({
  matterId,
  value,
  onChange,
  asLink,
  onAsLink,
  onUpload,
  uploading,
  uploadError,
  uploaded,
}: {
  matterId: string;
  value: Attached[];
  onChange: (next: Attached[]) => void;
  asLink: boolean;
  onAsLink: (v: boolean) => void;
  onUpload: (files: File[]) => void; // saved to the matter's Documents, then attached
  uploading: boolean;
  uploadError: string | null;
  uploaded: number; // goes up after each upload (the document list is read again)
}) {
  const [picking, setPicking] = useState(false);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [q, setQ] = useState("");
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadDocs = () =>
    fetch(`/api/documents?matterId=${matterId}`)
      .then((r) => (r.ok ? r.json() : { documents: [] }))
      .then((d) => setDocs((d.documents ?? []) as Doc[]))
      .catch(() => setDocs([]));
  // New files were added to the matter: show them in the list too.
  useEffect(() => {
    if (uploaded > 0 && docs) void loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploaded]);
  const busy = uploading;
  const error = uploadError;
  const upload = (files: File[]) => {
    if (files.length) onUpload(files);
    if (fileRef.current) fileRef.current.value = "";
  };

  const total = value.reduce((n, a) => n + a.size, 0);
  const tooBig = total > ATTACH_LIMIT;
  const linkOn = asLink || tooBig;
  const has = (id: string) => value.some((a) => a.id === id);
  function toggle(d: Doc) {
    if (has(d.id)) onChange(value.filter((a) => a.id !== d.id));
    else onChange([...value, { id: d.id, title: d.title, size: d.versions?.[0]?.sizeBytes ?? 0 }]);
  }
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (docs ?? []).filter((d) => words.every((w) => d.title.toLowerCase().includes(w)));

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          upload(Array.from(e.dataTransfer.files));
        }}
        className={`rounded-xl border border-dashed px-3 py-2.5 flex flex-wrap items-center gap-2 transition-colors ${over ? "border-[#9C978E] bg-[#F3F2F0]" : "border-[#D6D3CC] bg-white"}`}
      >
        <Paperclip size={14} className="text-muted" />
        <button
          type="button"
          onClick={() => {
            setPicking((p) => !p);
            if (!docs) void loadDocs();
          }}
          className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3 py-1.5 rounded-full text-[12.5px] font-medium"
        >
          <FolderOpen size={13} /> Attach documents from matter
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3 py-1.5 rounded-full text-[12.5px] font-medium disabled:opacity-60">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {busy ? "Adding…" : "From computer"}
        </button>
        <span className="text-[12px] text-muted">or drag files here</span>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(Array.from(e.target.files ?? []))} />
      </div>

      {picking && (
        <div className="bg-white border border-[#E8E6E2] rounded-xl p-1.5">
          <div className="flex items-center gap-2 px-2 pb-1.5">
            <Search size={13} className="text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this matter's documents" className="flex-1 outline-none text-[13px] bg-transparent py-1" />
            <button type="button" onClick={() => setPicking(false)} className="text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-[#F3F2F0] hover:bg-[#E7E5E1]">
              Done
            </button>
          </div>
          <div className="max-h-[220px] overflow-y-auto">
            {!docs ? (
              <div className="flex items-center gap-2 px-2.5 py-2 text-[12.5px] text-muted">
                <Loader2 size={13} className="animate-spin" /> Loading documents…
              </div>
            ) : shown.length === 0 ? (
              <div className="px-2.5 py-2 text-[12.5px] text-muted">{docs.length ? "No documents match." : "This matter has no documents yet."}</div>
            ) : (
              shown.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggle(d)}
                  className={`w-full flex items-center gap-2.5 text-left px-2.5 py-1.5 rounded-lg ${has(d.id) ? "bg-[#E8F6EE]" : "hover:bg-[#F3F2F0]"}`}
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${has(d.id) ? "bg-[#2F9E5A] border-[#2F9E5A] text-white" : "border-[#C9C6BF]"}`}>
                    {has(d.id) && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-[13px]">{d.title}</span>
                  <span className="text-[11.5px] text-muted flex-shrink-0">{d.versions?.[0]?.sizeBytes ? mb(d.versions[0].sizeBytes) : ""}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {value.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {value.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 bg-[#F3F2F0] border border-[#E8E6E2] rounded-full pl-2.5 pr-1 py-1 text-[12.5px] max-w-full">
                <Paperclip size={11} className="text-muted flex-shrink-0" />
                <span className="truncate max-w-[260px]">{a.title}</span>
                <span className="text-muted flex-shrink-0">{a.size ? mb(a.size) : ""}</span>
                <button type="button" onClick={() => onChange(value.filter((x) => x.id !== a.id))} aria-label="Close" className="w-5 h-5 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-[#E7E5E1]">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
          <label className={`flex items-start gap-2 text-[12.5px] rounded-xl px-3 py-2 ${linkOn ? "bg-[#EEF3FB]" : ""}`}>
            <input type="checkbox" checked={linkOn} disabled={tooBig} onChange={(e) => onAsLink(e.target.checked)} className="mt-0.5 w-3.5 h-3.5 accent-[#5E6E8C]" />
            <span>
              <span className="font-medium inline-flex items-center gap-1">
                <ShieldCheck size={13} /> Send as a secure link to the client portal instead
              </span>
              <span className="block text-muted">
                {tooBig
                  ? `Together they're ${mb(total)}, too big to attach (limit ${mb(ATTACH_LIMIT)}). They'll be put on this matter's client portal and the email will include the link.`
                  : `Attached: ${mb(total)} in all. With a link, the documents are put on this matter's client portal instead; people sign in there to download them.`}
              </span>
            </span>
          </label>
        </>
      )}
      {error && <div className="rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-3 py-2 text-[12.5px]">{error}</div>}
    </div>
  );
}
