"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Upload, ChevronDown, ChevronRight, Download, PenLine, Loader2, X, Folder, Check, Search, Layers } from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import { uploadNewDocument, versionDownloadUrl, UploadError } from "@/lib/pdf/upload";

export type DocVersion = {
  id: string;
  versionNumber: number;
  sizeBytes: number;
  pageCount: number;
  hasFormFields: boolean;
  note: string;
  createdByEmail: string | null;
  createdAt: string;
};

export type Doc = {
  id: string;
  matterId: string;
  matterTitle: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  versions: DocVersion[];
};

export function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentList({
  matterId: fixedMatterId,
  initialMatterId,
}: {
  matterId?: string; // when set, the list is locked to this matter (matter page)
  initialMatterId?: string | null;
}) {
  const { matters, mattersLoaded } = useWorkspaceData();
  const [selectedMatter, setSelectedMatter] = useState<string>(fixedMatterId ?? initialMatterId ?? "");
  const matterId = fixedMatterId ?? selectedMatter;

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(async (): Promise<Doc[]> => {
    const qs = matterId ? `?matterId=${encodeURIComponent(matterId)}` : "";
    const res = await fetch(`/api/documents${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Couldn't load documents.");
    return data.documents ?? [];
  }, [matterId]);

  const load = useCallback(
    () =>
      fetchDocs()
        .then((d) => {
          setDocs(d);
          setError(null);
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false)),
    [fetchDocs]
  );

  useEffect(() => {
    let cancelled = false;
    fetchDocs()
      .then((d) => {
        if (cancelled) return;
        setDocs(d);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchDocs]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!matterId) {
      setError("Choose the matter this PDF belongs to first.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadNewDocument(matterId, file);
      await load();
    } catch (e) {
      setError(e instanceof UploadError ? e.message : "The upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function download(versionId: string) {
    try {
      window.open(await versionDownloadUrl(versionId), "_blank", "noopener");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const matterTitle = (id: string) => matters.find((m) => m.id === id)?.title ?? "Matter";

  return (
    <div>
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {!fixedMatterId && (
          <MatterPicker
            matters={matters}
            value={selectedMatter}
            onChange={(id) => {
              if (id === selectedMatter) return;
              setLoading(true);
              setSelectedMatter(id);
            }}
          />
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <button
          onClick={() => (matterId ? fileInput.current?.click() : setError("Choose the matter this PDF belongs to first."))}
          disabled={uploading}
          className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-dark2 transition-colors disabled:opacity-60"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} strokeWidth={2} />}
          {uploading ? "Checking and uploading…" : "Upload PDF"}
        </button>
        <span className="text-[12.5px] text-muted">PDF only, up to 25 MB</span>
      </div>

      {error && (
        <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 flex-shrink-0">
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>
      )}

      {!fixedMatterId && mattersLoaded && matters.length === 0 && (
        <div className="mb-5 text-[13.5px] text-muted">
          Create a matter first; every PDF is stored on a matter.{" "}
          <Link href="/dashboard/matters" className="underline underline-offset-2 hover:text-ink">
            Go to Matters
          </Link>
        </div>
      )}

      <div className="bg-card-alt rounded-2xl p-2">
        {loading ? (
          <div className="bg-cream rounded-xl py-14 text-center text-[14px] text-muted">Loading documents…</div>
        ) : docs.length === 0 ? (
          <div className="bg-cream rounded-xl py-14 text-center">
            <FileText size={22} strokeWidth={1.5} className="text-muted mx-auto mb-3" />
            <div className="text-[14.5px] font-medium">No PDFs here yet</div>
            <div className="text-[13px] text-muted mt-1">Upload a PDF to preview, fill, annotate and sign it.</div>
          </div>
        ) : (
          <div className="bg-cream rounded-xl divide-y divide-line">
            {docs.map((d) => {
              const latest = d.versions[0];
              const open = expanded === d.id;
              return (
                <div key={d.id}>
                  <div className="flex items-center gap-3 px-5 py-4 flex-wrap">
                    <button
                      onClick={() => setExpanded(open ? null : d.id)}
                      className="text-muted hover:text-ink"
                      aria-label={open ? "Hide versions" : "Show versions"}
                    >
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <FileText size={17} strokeWidth={1.75} className="text-muted flex-shrink-0" />
                    <div className="flex-1 min-w-[200px]">
                      <div className="text-[14.5px] font-medium truncate">{d.title}</div>
                      <div className="text-[12.5px] text-muted">
                        {!fixedMatterId && <>{d.matterTitle ?? matterTitle(d.matterId)}, </>}
                        version {latest?.versionNumber ?? 1} of {d.versions.length}, saved{" "}
                        {latest ? formatWhen(latest.createdAt) : ""}
                        {latest?.createdByEmail ? ` by ${latest.createdByEmail}` : ""}
                      </div>
                    </div>
                    {latest && (
                      <Link
                        href={`/dashboard/power-pdf/${d.id}?version=${latest.id}`}
                        className="bg-dark text-white px-3.5 py-1.5 rounded-full text-[13px] font-medium flex items-center gap-1.5 hover:bg-dark2 transition-colors"
                      >
                        <PenLine size={13} strokeWidth={2} /> Open in Power PDF
                      </Link>
                    )}
                  </div>
                  {open && (
                    <div className="px-5 pb-4 pl-[68px]">
                      <div className="border border-line rounded-xl divide-y divide-line bg-white/50">
                        {d.versions.map((v) => (
                          <div key={v.id} className="flex items-center gap-3 px-4 py-2.5 flex-wrap text-[13px]">
                            <span className="font-medium w-[34px]">v{v.versionNumber}</span>
                            <span className="flex-1 min-w-[220px] text-muted">
                              {v.note || (v.versionNumber === 1 ? "Original upload" : "Edited")}. {formatWhen(v.createdAt)}
                              {v.createdByEmail ? `, ${v.createdByEmail}` : ""}. {v.pageCount}{" "}
                              {v.pageCount === 1 ? "page" : "pages"}, {formatSize(v.sizeBytes)}
                            </span>
                            <Link
                              href={`/dashboard/power-pdf/${d.id}?version=${v.id}`}
                              className="text-[12.5px] font-medium text-muted hover:text-ink underline underline-offset-2"
                            >
                              Open
                            </Link>
                            <button
                              onClick={() => download(v.id)}
                              className="text-muted hover:text-ink"
                              aria-label={`Download version ${v.versionNumber}`}
                            >
                              <Download size={14} strokeWidth={1.75} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Pill-style matter picker matching the app's dropdowns (replaces the native <select>).
function MatterPicker({
  matters,
  value,
  onChange,
}: {
  matters: { id: string; title: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = matters.find((m) => m.id === value);
  const q = query.trim().toLowerCase();
  const filtered = q ? matters.filter((m) => m.title.toLowerCase().includes(q)) : matters;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  const row = (id: string, label: string, icon: React.ReactNode) => {
    const active = id === value;
    return (
      <button
        key={id || "all"}
        onClick={() => pick(id)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] text-left transition-colors ${
          active ? "bg-card-alt font-medium" : "hover:bg-card-alt/70"
        }`}
      >
        <span className="text-muted flex-shrink-0">{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {active && <Check size={14} strokeWidth={2} className="flex-shrink-0" />}
      </button>
    );
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 bg-card-alt hover:bg-line/50 transition-colors pl-3.5 pr-3 py-2 rounded-full text-[13.5px] font-medium max-w-[320px]"
      >
        {current ? (
          <Folder size={14} strokeWidth={1.75} className="text-muted flex-shrink-0" />
        ) : (
          <Layers size={14} strokeWidth={1.75} className="text-muted flex-shrink-0" />
        )}
        <span className="truncate">{current?.title ?? "All matters"}</span>
        <ChevronDown
          size={13}
          strokeWidth={1.75}
          className={`text-muted flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className="absolute left-0 top-[calc(100%+6px)] z-50 w-[300px] bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5"
          >
            {matters.length > 6 && (
              <div className="flex items-center gap-2 px-3 py-2 mb-1 border-b border-line">
                <Search size={14} strokeWidth={1.75} className="text-muted" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a matter"
                  className="flex-1 bg-transparent outline-none text-[13.5px] placeholder:text-muted"
                />
              </div>
            )}
            <div className="max-h-[300px] overflow-y-auto">
              {!q && row("", "All matters", <Layers size={14} strokeWidth={1.75} />)}
              {!q && matters.length > 0 && <div className="h-px bg-line my-1 mx-2" />}
              {filtered.map((m) => row(m.id, m.title, <Folder size={14} strokeWidth={1.75} />))}
              {filtered.length === 0 && (
                <div className="px-3 py-3 text-[13px] text-muted">
                  {matters.length === 0 ? "No matters yet" : "No matching matters"}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
