"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  Mail,
  Presentation,
  FileOutput,
  Download,
  Upload,
  Trash2,
  Loader2,
  PenLine,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  FileUp,
  Check,
} from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import SelectBox from "@/components/SelectBox";
import { MatterPicker, formatWhen, formatSize, type Doc, type DocVersion } from "@/components/pdf/DocumentList";
import {
  uploadAnyDocument,
  uploadFileAsVersion,
  convertWordVersionToPdf,
  versionDownloadUrl,
  UploadError,
} from "@/lib/pdf/upload";
import { ACCEPT_ATTR, ACCEPTED_SUMMARY, fileTypeLabel, type FileType } from "@/lib/documents/fileTypes";

const typeOf = (v: DocVersion | undefined): FileType => v?.fileType ?? "pdf";

function TypeIcon({ type, size = 17 }: { type: FileType; size?: number }) {
  const p = { size, strokeWidth: 1.75, className: "text-muted flex-shrink-0" };
  if (type === "xls" || type === "xlsx" || type === "csv") return <FileSpreadsheet {...p} />;
  if (type === "ppt" || type === "pptx") return <Presentation {...p} />;
  if (type === "png" || type === "jpg") return <FileImage {...p} />;
  if (type === "eml" || type === "msg") return <Mail {...p} />;
  return <FileText {...p} />;
}

function TypeBadge({ type }: { type: FileType }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-line/60 text-[11.5px] font-medium text-ink flex-shrink-0">
      {fileTypeLabel(type)}
    </span>
  );
}

const beigeBtn =
  "bg-card-alt hover:bg-line/70 text-ink px-3.5 py-1.5 rounded-full text-[13px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50";
const blackBtn =
  "bg-btn text-ink px-3.5 py-1.5 rounded-full text-[13px] font-medium flex items-center gap-1.5 hover:bg-btn-hover transition-colors disabled:opacity-60";

export default function DocumentsLibrary({ matterId: fixedMatterId }: { matterId?: string }) {
  const router = useRouter();
  const { matters, mattersLoaded } = useWorkspaceData();
  const [matterFilter, setMatterFilter] = useState("");
  const matterId = fixedMatterId ?? matterFilter;

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // doc id with an action running
  const [converting, setConverting] = useState<{ doc: Doc; version: DocVersion } | null>(null);
  const versionInput = useRef<HTMLInputElement>(null);
  const versionTarget = useRef<Doc | null>(null);

  const fetchDocs = useCallback(async (): Promise<Doc[]> => {
    const qs = matterId ? `?matterId=${encodeURIComponent(matterId)}` : "";
    const res = await fetch(`/api/documents${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Couldn't load documents.");
    return data.documents ?? [];
  }, [matterId]);

  const reload = useCallback(
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

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!q) return docs;
    const words = q.split(/\s+/);
    return docs.filter((d) => {
      const hay = [
        d.title,
        d.matterTitle ?? "",
        ...d.versions.flatMap((v) => [fileTypeLabel(v.fileType), v.fileType, v.createdByEmail ?? "", v.note]),
      ]
        .join(" ")
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [docs, q]);

  async function download(v: DocVersion) {
    try {
      window.open(await versionDownloadUrl(v.id, true), "_blank", "noopener");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(d: Doc) {
    const n = d.versions.length;
    const ok = confirm(
      `Delete "${d.title}"?\n\nThis permanently deletes the file${n > 1 ? ` and all ${n} versions` : ""} for everyone in your workspace. It can't be undone.`
    );
    if (!ok) return;
    setBusy(d.id);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${d.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Couldn't delete the document.");
      setDocs((list) => list.filter((x) => x.id !== d.id));
      if (expanded === d.id) setExpanded(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onVersionFile(file: File | undefined) {
    const d = versionTarget.current;
    if (versionInput.current) versionInput.current.value = "";
    if (!file || !d) return;
    setBusy(d.id);
    setError(null);
    try {
      const updated: Doc = await uploadFileAsVersion(d.id, file, d.versions[0]?.id ?? null);
      setDocs((list) => list.map((x) => (x.id === d.id ? updated : x)));
      setExpanded(d.id);
      setNotice(`Saved "${file.name}" as version ${updated.versions[0]?.versionNumber}. Earlier versions are kept.`);
    } catch (e) {
      setError(e instanceof UploadError ? e.message : "The upload failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function convert(doc: Doc, version: DocVersion) {
    const { document, skippedImages } = await convertWordVersionToPdf(doc.id, doc.title, version);
    const pdf = (document as Doc).versions[0];
    if (skippedImages > 0) {
      setNotice(`Converted. ${skippedImages} ${skippedImages === 1 ? "image" : "images"} in an unsupported format couldn't be included.`);
    }
    setDocs((list) => list.map((x) => (x.id === doc.id ? (document as Doc) : x)));
    router.push(`/dashboard/power-pdf/${doc.id}?version=${pdf.id}`);
  }

  const addButton = (
    <button onClick={() => setAdding(true)} className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-btn-hover transition-colors">
      + Add document
    </button>
  );

  return (
    <div>
      {!fixedMatterId ? (
        <>
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-[28px] font-semibold">
              Documents <span className="text-muted font-normal text-[18px]">/ {loading ? "–" : docs.length}</span>
            </h1>
            {addButton}
          </div>
          <p className="text-[14.5px] text-muted mb-6">
            Every document in your firm. Open PDFs in Power PDF, and convert Word files to PDF when you need to edit or sign them.
          </p>
        </>
      ) : null}

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-[420px]">
          <Search size={15} strokeWidth={1.75} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Search by name, matter, type or person"
            aria-label="Search documents"
            className="w-full border border-line bg-white rounded-full pl-10 pr-9 py-2.5 text-[13.5px] outline-none focus:border-ink placeholder:text-muted"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
        {!fixedMatterId && (
          <MatterPicker
            matters={matters}
            value={matterFilter}
            onChange={(id) => {
              if (id === matterFilter) return;
              setLoading(true);
              setMatterFilter(id);
            }}
          />
        )}
        {fixedMatterId && <div className="ml-auto">{addButton}</div>}
      </div>

      {error && (
        <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 flex-shrink-0" aria-label="Dismiss">
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>
      )}
      {notice && (
        <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-line bg-card-alt px-4 py-3 text-[13.5px]">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-muted hover:text-ink flex-shrink-0" aria-label="Dismiss">
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>
      )}

      <input
        ref={versionInput}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => onVersionFile(e.target.files?.[0])}
      />

      <div className="bg-card-alt rounded-2xl p-2">
        {loading ? (
          <div className="bg-cream rounded-xl py-14 text-center text-[14px] text-muted">Loading documents…</div>
        ) : docs.length === 0 ? (
          <div className="bg-cream rounded-xl py-14 text-center">
            <FileText size={22} strokeWidth={1.5} className="text-muted mx-auto mb-3" />
            <div className="text-[14.5px] font-medium">No documents {matterId ? "on this matter " : ""}yet</div>
            <div className="text-[13px] text-muted mt-1 mb-5">{ACCEPTED_SUMMARY}.</div>
            {addButton}
          </div>
        ) : shown.length === 0 ? (
          <div className="bg-cream rounded-xl py-14 text-center">
            <div className="text-[14.5px] font-medium">No documents match “{query.trim()}”</div>
            <button onClick={() => setQuery("")} className={`${beigeBtn} mx-auto mt-4`}>
              Clear search
            </button>
          </div>
        ) : (
          <div className="bg-cream rounded-xl divide-y divide-line">
            {shown.map((d) => {
              const latest = d.versions[0];
              const type = typeOf(latest);
              const open = expanded === d.id;
              const working = busy === d.id;
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
                    <TypeIcon type={type} />
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[14.5px] font-medium truncate">{d.title}</span>
                        <TypeBadge type={type} />
                      </div>
                      <div className="text-[12.5px] text-muted">
                        {!fixedMatterId && <>{d.matterTitle ?? "Matter"}, </>}
                        version {latest?.versionNumber ?? 1} of {d.versions.length}, saved {latest ? formatWhen(latest.createdAt) : ""}
                        {latest?.createdByEmail ? ` by ${latest.createdByEmail}` : ""}
                      </div>
                    </div>
                    {latest && type === "pdf" && (
                      <Link href={`/dashboard/power-pdf/${d.id}?version=${latest.id}`} className={blackBtn}>
                        <PenLine size={13} strokeWidth={2} /> Open in Power PDF
                      </Link>
                    )}
                    {latest && type === "docx" && (
                      <button onClick={() => setConverting({ doc: d, version: latest })} disabled={working} className={blackBtn}>
                        <FileOutput size={13} strokeWidth={2} /> Convert to PDF
                      </button>
                    )}
                    {latest && (
                      <button onClick={() => download(latest)} className={beigeBtn}>
                        <Download size={13} strokeWidth={2} /> Download
                      </button>
                    )}
                    <button
                      onClick={() => remove(d)}
                      disabled={working}
                      title="Delete document"
                      aria-label={`Delete ${d.title}`}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {working ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={15} strokeWidth={1.75} />}
                    </button>
                  </div>
                  {latest && type === "doc" && (
                    <div className="px-5 -mt-2 pb-3 pl-[68px] text-[12.5px] text-muted">
                      Older Word format (.doc). To edit it in Power PDF, open it in Word, save it as .docx or PDF, and upload that as a new
                      version.
                    </div>
                  )}
                  {open && (
                    <div className="px-5 pb-4 pl-[68px]">
                      <div className="border border-line rounded-xl divide-y divide-line bg-white/50">
                        {d.versions.map((v) => {
                          const vt = typeOf(v);
                          return (
                            <div key={v.id} className="flex items-center gap-3 px-4 py-2.5 flex-wrap text-[13px]">
                              <span className="font-medium w-[34px]">v{v.versionNumber}</span>
                              <TypeBadge type={vt} />
                              <span className="flex-1 min-w-[220px] text-muted">
                                {v.note || (v.versionNumber === 1 ? "Original upload" : "Edited")}. {formatWhen(v.createdAt)}
                                {v.createdByEmail ? `, ${v.createdByEmail}` : ""}.{" "}
                                {vt === "pdf" && v.pageCount > 0 ? `${v.pageCount} ${v.pageCount === 1 ? "page" : "pages"}, ` : ""}
                                {formatSize(v.sizeBytes)}
                              </span>
                              {vt === "pdf" && (
                                <Link
                                  href={`/dashboard/power-pdf/${d.id}?version=${v.id}`}
                                  className="text-[12.5px] font-medium text-muted hover:text-ink underline underline-offset-2"
                                >
                                  Open
                                </Link>
                              )}
                              {vt === "docx" && (
                                <button
                                  onClick={() => setConverting({ doc: d, version: v })}
                                  className="text-[12.5px] font-medium text-muted hover:text-ink underline underline-offset-2"
                                >
                                  Convert to PDF
                                </button>
                              )}
                              <button
                                onClick={() => download(v)}
                                className="text-muted hover:text-ink"
                                aria-label={`Download version ${v.versionNumber}`}
                                title="Download"
                              >
                                <Download size={14} strokeWidth={1.75} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => {
                          versionTarget.current = d;
                          versionInput.current?.click();
                        }}
                        disabled={working}
                        className={`${beigeBtn} mt-3`}
                      >
                        {working ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} strokeWidth={2} />}
                        Upload new version
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {adding && (
        <AddDocumentModal
          matters={matters}
          mattersLoaded={mattersLoaded}
          fixedMatterId={fixedMatterId}
          initialMatterId={matterFilter}
          onClose={() => setAdding(false)}
          onUploaded={() => reload()}
        />
      )}
      {converting && (
        <ConvertModal
          title={converting.doc.title}
          fromVersion={converting.version.versionNumber}
          nextVersion={(converting.doc.versions[0]?.versionNumber ?? 0) + 1}
          onClose={() => setConverting(null)}
          onConvert={() => convert(converting.doc, converting.version)}
        />
      )}
    </div>
  );
}

// ── Add document ──────────────────────────────────────────────────────────

type Pending = { file: File; status: "waiting" | "uploading" | "done" | "error"; error?: string };

function AddDocumentModal({
  matters,
  mattersLoaded,
  fixedMatterId,
  initialMatterId,
  onClose,
  onUploaded,
}: {
  matters: { id: string; title: string }[];
  mattersLoaded: boolean;
  fixedMatterId?: string;
  initialMatterId: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [matterId, setMatterId] = useState(fixedMatterId ?? initialMatterId);
  const [files, setFiles] = useState<Pending[]>([]);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !running && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, onClose]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = [...list].map((file) => ({ file, status: "waiting" as const }));
    setFiles((cur) => [...cur.filter((p) => p.status !== "done"), ...incoming]);
    if (input.current) input.current.value = "";
  }

  async function upload() {
    if (!matterId) {
      setError("Choose the matter these documents belong to.");
      return;
    }
    setError(null);
    setRunning(true);
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === "done") continue;
      setFiles((cur) => cur.map((p, j) => (j === i ? { ...p, status: "uploading", error: undefined } : p)));
      try {
        await uploadAnyDocument(matterId, files[i].file);
        ok++;
        setFiles((cur) => cur.map((p, j) => (j === i ? { ...p, status: "done" } : p)));
      } catch (e) {
        failed++;
        const msg = e instanceof UploadError ? e.message : "The upload failed. Please try again.";
        setFiles((cur) => cur.map((p, j) => (j === i ? { ...p, status: "error", error: msg } : p)));
      }
    }
    setRunning(false);
    if (ok) onUploaded();
    if (!failed) onClose();
  }

  const waiting = files.filter((p) => p.status !== "done").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8" onClick={() => !running && onClose()}>
      <div className="bg-cream rounded-2xl w-full max-w-[540px] p-7 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-[20px] font-semibold">Add documents</h2>
            <p className="text-[13px] text-muted mt-0.5">{ACCEPTED_SUMMARY}.</p>
          </div>
          <button onClick={onClose} disabled={running} className="text-muted hover:text-ink disabled:opacity-40" aria-label="Close">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {!fixedMatterId && (
          <div className="mb-4">
            <div className="text-[13px] font-medium mb-1.5">Matter</div>
            <SelectBox label="Matter" value={matterId} onChange={setMatterId}>
              <option value="">{mattersLoaded && matters.length === 0 ? "No matters yet" : "Choose a matter"}</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </SelectBox>
            {mattersLoaded && matters.length === 0 && (
              <div className="text-[12.5px] text-muted mt-1.5">
                Every document is stored on a matter.{" "}
                <Link href="/dashboard/matters" className="underline underline-offset-2 hover:text-ink">
                  Create a matter first
                </Link>
              </div>
            )}
          </div>
        )}

        <input ref={input} type="file" multiple accept={ACCEPT_ATTR} className="hidden" onChange={(e) => addFiles(e.target.files)} />
        <button
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          disabled={running}
          className={`w-full border-2 border-dashed rounded-xl py-8 flex flex-col items-center gap-2 transition-colors ${
            dragging ? "border-ink bg-card-alt" : "border-line bg-white/60 hover:bg-card-alt/60"
          }`}
        >
          <FileUp size={22} strokeWidth={1.5} className="text-muted" />
          <span className="text-[14px] font-medium">Drop files here or click to choose</span>
          <span className="text-[12.5px] text-muted">You can add several at once</span>
        </button>

        {files.length > 0 && (
          <div className="mt-4 border border-line rounded-xl divide-y divide-line bg-white/60 max-h-[240px] overflow-y-auto">
            {files.map((p, i) => (
              <div key={`${p.file.name}-${i}`} className="px-3.5 py-2.5 text-[13px]">
                <div className="flex items-center gap-2.5">
                  <span className="flex-1 truncate">{p.file.name}</span>
                  <span className="text-muted text-[12px] flex-shrink-0">{formatSize(p.file.size)}</span>
                  {p.status === "uploading" && <Loader2 size={14} className="animate-spin text-muted" />}
                  {p.status === "done" && <Check size={14} strokeWidth={2} className="text-green-700" />}
                  {(p.status === "waiting" || p.status === "error") && !running && (
                    <button
                      onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                      className="text-muted hover:text-ink"
                      aria-label={`Remove ${p.file.name}`}
                    >
                      <X size={14} strokeWidth={1.75} />
                    </button>
                  )}
                </div>
                {p.error && <div className="text-[12px] text-red-700 mt-1">{p.error}</div>}
              </div>
            ))}
          </div>
        )}

        {error && <div className="mt-3 text-[13px] text-red-700">{error}</div>}

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} disabled={running} className="bg-card-alt hover:bg-line/70 px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={upload}
            disabled={running || waiting === 0}
            className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-btn-hover transition-colors disabled:opacity-50"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} strokeWidth={2} />}
            {running ? "Uploading…" : waiting > 1 ? `Add ${waiting} documents` : "Add document"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Convert Word to PDF ───────────────────────────────────────────────────

function ConvertModal({
  title,
  fromVersion,
  nextVersion,
  onClose,
  onConvert,
}: {
  title: string;
  fromVersion: number;
  nextVersion: number;
  onClose: () => void;
  onConvert: () => Promise<void>;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setRunning(true);
    setError(null);
    try {
      await onConvert();
    } catch (e) {
      setError(e instanceof UploadError ? e.message : "The conversion failed. Please try again.");
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8" onClick={() => !running && onClose()}>
      <div className="bg-cream rounded-2xl w-full max-w-[500px] p-7 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[20px] font-semibold mb-2">Convert to PDF</h2>
        <p className="text-[14px] text-muted mb-3">
          A PDF copy of <span className="text-ink font-medium">{title}</span> is saved as version {nextVersion} and opened in Power PDF,
          where you can edit and sign it. The Word file stays as version {fromVersion}.
        </p>
        <p className="text-[13px] text-muted mb-5">
          Text, headings, lists, tables and images are kept. Word’s exact fonts, colors, alignment, headers and footers aren’t. For an exact
          copy, use Save as PDF in Word and upload that PDF instead.
        </p>
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={running} className="bg-card-alt hover:bg-line/70 px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={go}
            disabled={running}
            className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-btn-hover transition-colors disabled:opacity-60"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <FileOutput size={14} strokeWidth={2} />}
            {running ? "Converting…" : "Convert and open in Power PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
