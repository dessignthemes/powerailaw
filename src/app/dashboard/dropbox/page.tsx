"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Cloud,
  Folder,
  FileText,
  FileSpreadsheet,
  FileImage,
  Mail,
  Presentation,
  File as FileIcon,
  ChevronRight,
  Search,
  X,
  RefreshCw,
  Loader2,
  Download,
  PenLine,
  FolderInput,
  Check,
  ShieldCheck,
} from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import SelectBox from "@/components/SelectBox";
import { formatSize } from "@/components/pdf/DocumentList";
import { fileTypeFromName, fileTypeLabel, MAX_DOCUMENT_BYTES, type FileType } from "@/lib/documents/fileTypes";
import type { DropboxEntry, DropboxStatus } from "@/lib/dropbox/types";

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error ?? `Request failed (${res.status})`), { code: data?.code });
  return data;
}

const CALLBACK_MESSAGES: Record<string, string> = {
  denied: "Dropbox wasn't connected because access wasn't allowed.",
  expired: "The Dropbox sign-in took too long or was opened in another window. Please connect again.",
  failed: "Dropbox couldn't be connected. Please try again.",
  not_configured: "Dropbox isn't set up yet.",
  setup_required: "Dropbox needs a database update. Run supabase/migrations/0015_dropbox.sql in the Supabase SQL editor, then connect again.",
};

function formatModified(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

function EntryIcon({ entry }: { entry: DropboxEntry }) {
  const p = { size: 17, strokeWidth: 1.75, className: "text-muted flex-shrink-0" };
  if (entry.type === "folder") return <Folder {...p} />;
  const t = fileTypeFromName(entry.name);
  if (t === "xls" || t === "xlsx" || t === "csv") return <FileSpreadsheet {...p} />;
  if (t === "ppt" || t === "pptx") return <Presentation {...p} />;
  if (t === "png" || t === "jpg") return <FileImage {...p} />;
  if (t === "eml" || t === "msg") return <Mail {...p} />;
  if (t) return <FileText {...p} />;
  return <FileIcon {...p} />;
}

export default function DropboxPage() {
  return (
    <Suspense fallback={<div className="px-10 py-10 text-[14px] text-muted">Loading Dropbox…</div>}>
      <DropboxBrowser />
    </Suspense>
  );
}

function DropboxBrowser() {
  const router = useRouter();
  const params = useSearchParams();
  const path = params.get("path") || "/";

  const [status, setStatus] = useState<DropboxStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(() => {
    if (params.get("connected")) return "Dropbox is connected.";
    const e = params.get("error");
    return e ? CALLBACK_MESSAGES[e] ?? CALLBACK_MESSAGES.failed : null;
  });
  const [noticeIsError] = useState(() => !!params.get("error"));

  const [entries, setEntries] = useState<DropboxEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<{ key: string; entries: DropboxEntry[] } | null>(null);
  const [preview, setPreview] = useState<DropboxEntry | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Clean the ?connected / ?error flags out of the address after reading them.
  useEffect(() => {
    if (params.get("connected") || params.get("error")) router.replace("/dashboard/dropbox");
  }, [params, router]);

  useEffect(() => {
    fetch("/api/dropbox/status")
      .then(readJson)
      .then(setStatus)
      .catch((e: Error) => setStatusError(e.message));
  }, []);

  const connected = status?.configured && status.connected;

  // The folder shown is loading until its listing arrives.
  const folderKey = `${path}|${reload}`;
  const loading = !!connected && loadedKey !== folderKey;

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    fetch(`/api/dropbox/files?path=${encodeURIComponent(path)}`)
      .then(readJson)
      .then((d) => {
        if (cancelled) return;
        setEntries(d.entries);
        setCursor(d.cursor);
        setError(null);
      })
      .catch((e: Error & { code?: string }) => {
        if (cancelled) return;
        if (e.code === "reconnect") setStatus({ configured: true, connected: false });
        setError(e.message);
        setEntries([]);
        setCursor(null);
      })
      .finally(() => !cancelled && setLoadedKey(`${path}|${reload}`));
    return () => {
      cancelled = true;
    };
  }, [connected, path, reload]);

  // Search as you type (in the current folder and below).
  const q = query.trim();
  const searchKey = `${path}|${q}`;
  const results = q && search?.key === searchKey ? search.entries : null;
  const searching = !!q && search?.key !== searchKey;

  useEffect(() => {
    if (!connected || !q) return;
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/dropbox/search?q=${encodeURIComponent(q)}&path=${encodeURIComponent(path)}`)
        .then(readJson)
        .then((d) => !cancelled && setSearch({ key: `${path}|${q}`, entries: d.entries }))
        .catch((e: Error) => {
          if (cancelled) return;
          setError(e.message);
          setSearch({ key: `${path}|${q}`, entries: [] });
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, path, connected]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const d = await fetch(`/api/dropbox/files?path=${encodeURIComponent(path)}&cursor=${encodeURIComponent(cursor)}`).then(readJson);
      setEntries((list) => [...list, ...d.entries]);
      setCursor(d.cursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  function go(p: string) {
    setQuery("");
    router.push(p === "/" ? "/dashboard/dropbox" : `/dashboard/dropbox?path=${encodeURIComponent(p)}`);
  }

  function openEntry(e: DropboxEntry) {
    if (e.type === "folder") go(e.path);
    else setPreview(e);
  }

  async function disconnectDropbox() {
    if (!confirm("Disconnect Dropbox? Files already saved to LawPower stay where they are.")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/dropbox/disconnect", { method: "POST" }).then(readJson);
      setStatus({ configured: true, connected: false });
      setEntries([]);
      setNotice("Dropbox is disconnected.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDisconnecting(false);
    }
  }

  const crumbs = useMemo(() => {
    const parts = path.split("/").filter(Boolean);
    return parts.map((name, i) => ({ name, path: "/" + parts.slice(0, i + 1).join("/") }));
  }, [path]);

  // While a search is running, keep the folder visible rather than flashing empty.
  const shown = results ?? entries;

  return (
    <div className="px-10 py-10">
      <div className="flex items-center justify-between gap-4 mb-1 flex-wrap">
        <h1 className="text-[28px] font-semibold">Dropbox</h1>
        {connected && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setReload((n) => n + 1)}
              title="Refresh"
              aria-label="Refresh"
              className="w-9 h-9 rounded-full bg-card-alt hover:bg-line/70 flex items-center justify-center transition-colors"
            >
              <RefreshCw size={15} strokeWidth={1.75} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={disconnectDropbox}
              disabled={disconnecting}
              className="bg-card-alt hover:bg-line/70 px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        )}
      </div>
      <p className="text-[14.5px] text-muted mb-6">
        {connected
          ? `Connected as ${status.email ?? status.name ?? "your Dropbox account"}${status.teamSpace ? " · team space" : ""}. LawPower only reads your Dropbox; nothing there is moved or changed.`
          : "Browse your Dropbox inside LawPower, preview files, and send them to Power PDF or Documents."}
      </p>

      {notice && (
        <div
          className={`mb-5 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-[13.5px] ${
            noticeIsError ? "border-red-200 bg-red-50 text-red-700" : "border-line bg-card-alt"
          }`}
        >
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="opacity-70 hover:opacity-100 flex-shrink-0" aria-label="Dismiss">
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>
      )}

      {!status ? (
        <div className="bg-card-alt rounded-2xl p-2">
          <div className="bg-cream rounded-xl py-14 text-center text-[14px] text-muted">{statusError ?? "Loading Dropbox…"}</div>
        </div>
      ) : !status.configured ? (
        <div className="bg-card-alt rounded-2xl p-2">
          <div className="bg-cream rounded-xl py-14 px-6 text-center">
            <Cloud size={24} strokeWidth={1.5} className="text-muted mx-auto mb-3" />
            <div className="text-[15px] font-medium">Dropbox isn’t set up yet</div>
            <div className="text-[13.5px] text-muted mt-1 max-w-[460px] mx-auto">
              An admin needs to add the Dropbox app keys (DROPBOX_CLIENT_ID and DROPBOX_CLIENT_SECRET) in Vercel. Once they’re added,
              everyone can connect their own Dropbox here.
            </div>
          </div>
        </div>
      ) : !status.connected ? (
        <div className="bg-card-alt rounded-2xl p-2">
          <div className="bg-cream rounded-xl py-14 px-6 text-center">
            <Cloud size={24} strokeWidth={1.5} className="text-muted mx-auto mb-3" />
            <div className="text-[15px] font-medium">Connect your Dropbox</div>
            <div className="text-[13.5px] text-muted mt-1 mb-5 max-w-[480px] mx-auto">
              See your folders and files here, preview PDFs and Word files, and send any file to Power PDF or a matter’s documents.
            </div>
            <a
              href="/api/dropbox/connect"
              className="inline-flex bg-btn text-ink px-5 py-2.5 rounded-full text-[14px] font-medium hover:bg-btn-hover transition-colors"
            >
              Connect Dropbox
            </a>
            <div className="flex items-center justify-center gap-1.5 text-[12.5px] text-muted mt-4">
              <ShieldCheck size={13} strokeWidth={1.75} /> Read-only: LawPower never moves, changes or deletes your files.
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <nav className="flex items-center gap-1 text-[14px] min-w-0 flex-wrap" aria-label="Folder path">
              <button onClick={() => go("/")} className={`px-2 py-1 rounded-lg hover:bg-card-alt ${crumbs.length ? "text-muted" : "font-medium"}`}>
                Dropbox
              </button>
              {crumbs.map((c, i) => (
                <span key={c.path} className="flex items-center gap-1 min-w-0">
                  <ChevronRight size={14} strokeWidth={1.75} className="text-muted flex-shrink-0" />
                  <button
                    onClick={() => go(c.path)}
                    className={`px-2 py-1 rounded-lg hover:bg-card-alt truncate max-w-[240px] ${i === crumbs.length - 1 ? "font-medium" : "text-muted"}`}
                  >
                    {c.name}
                  </button>
                </span>
              ))}
            </nav>
            <div className="relative w-full sm:w-80">
              <Search size={15} strokeWidth={1.75} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                placeholder={crumbs.length ? `Search in ${crumbs[crumbs.length - 1].name}` : "Search Dropbox"}
                aria-label="Search Dropbox"
                className="w-full border border-line bg-white rounded-full pl-10 pr-9 py-2 text-[13.5px] outline-none focus:border-ink placeholder:text-muted"
              />
              {searching ? (
                <Loader2 size={14} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
              ) : (
                query && (
                  <button onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
                    <X size={14} strokeWidth={1.75} />
                  </button>
                )
              )}
            </div>
          </div>

          {error && (
            <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 flex-shrink-0" aria-label="Dismiss">
                <X size={15} strokeWidth={1.75} />
              </button>
            </div>
          )}

          <div className="bg-card-alt rounded-2xl p-2">
            {loading && !results ? (
              <div className="bg-cream rounded-xl py-14 text-center text-[14px] text-muted">Loading…</div>
            ) : shown.length === 0 ? (
              <div className="bg-cream rounded-xl py-14 text-center text-[14px] text-muted">
                {results ? `Nothing matches “${query.trim()}”` : searching ? "Searching…" : "This folder is empty."}
              </div>
            ) : (
              <div className="bg-cream rounded-xl divide-y divide-line">
                <div className="hidden sm:flex items-center gap-3.5 px-5 py-2.5 text-[12px] font-medium text-muted">
                  <span className="w-[17px]" />
                  <span className="flex-1">Name</span>
                  <span className="w-[120px]">Modified</span>
                  <span className="w-[80px] text-right">Size</span>
                  <span className="w-[16px]" />
                </div>
                {shown.map((e) => {
                  const parent = e.path.slice(0, e.path.length - e.name.length - 1) || "/";
                  return (
                    <button
                      key={e.id}
                      onClick={() => openEntry(e)}
                      className="w-full flex items-center gap-3.5 px-5 py-3 text-left hover:bg-card-alt/50 transition-colors last:rounded-b-xl"
                    >
                      <EntryIcon entry={e} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-medium truncate">{e.name}</span>
                        {results && <span className="block text-[12px] text-muted truncate">{parent}</span>}
                      </span>
                      <span className="w-[120px] text-[12.5px] text-muted hidden sm:block">{formatModified(e.modified)}</span>
                      <span className="w-[80px] text-[12.5px] text-muted text-right hidden sm:block">{e.size != null ? formatSize(e.size) : ""}</span>
                      <ChevronRight size={16} strokeWidth={1.75} className={`text-muted flex-shrink-0 ${e.type === "file" ? "opacity-0" : ""}`} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {cursor && !results && (
            <div className="flex justify-center mt-4">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="bg-card-alt hover:bg-line/70 px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {loadingMore && <Loader2 size={14} className="animate-spin" />} Load more
              </button>
            </div>
          )}
        </>
      )}

      {preview && <PreviewModal entry={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ── Preview and send to LawPower ──────────────────────────────────────────

const MATTER_KEY = "lawpower.dropbox.matter";
const PROXY_LIMIT = 4 * 1024 * 1024;

type Loaded =
  | { kind: "pdf"; url: string }
  | { kind: "image"; url: string }
  | { kind: "html"; html: string }
  | { kind: "text"; text: string }
  | { kind: "none"; reason: string };

async function fetchBytes(path: string): Promise<{ bytes: ArrayBuffer; link: string }> {
  const { link, size } = await fetch(`/api/dropbox/link?path=${encodeURIComponent(path)}`).then(readJson);
  try {
    const res = await fetch(link);
    if (!res.ok) throw new Error("link failed");
    return { bytes: await res.arrayBuffer(), link };
  } catch {
    // Browser couldn't read the direct link; small files come through LawPower.
    if (size > PROXY_LIMIT) throw new Error("This preview couldn't load. Use Download to open the file.");
    const res = await fetch(`/api/dropbox/preview?path=${encodeURIComponent(path)}`);
    if (!res.ok) await readJson(res);
    return { bytes: await res.arrayBuffer(), link };
  }
}

function PreviewModal({ entry, onClose }: { entry: DropboxEntry; onClose: () => void }) {
  const router = useRouter();
  const { matters, mattersLoaded } = useWorkspaceData();
  const type: FileType | null = fileTypeFromName(entry.name);
  const [fetched, setFetched] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const linkRef = useRef<string | null>(null);

  const [matterId, setMatterId] = useState(() => {
    try {
      return localStorage.getItem(MATTER_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ docId: string } | null>(null);

  const validMatter = matters.some((m) => m.id === matterId) ? matterId : "";
  const tooLarge = (entry.size ?? 0) > MAX_DOCUMENT_BYTES;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  // Files that can't be previewed are known up front; the rest load below.
  const noPreview: Loaded | null = useMemo(() => {
    const previewable = type === "pdf" || type === "png" || type === "jpg" || type === "docx" || type === "txt" || type === "csv";
    if (!previewable) return { kind: "none", reason: `${type ? fileTypeLabel(type) + " files" : "This file type"} can’t be previewed here.` };
    if ((entry.size ?? 0) > 60 * 1024 * 1024) return { kind: "none", reason: "This file is too large to preview. Use Download to open it." };
    return null;
  }, [type, entry.size]);
  const loaded = noPreview ?? fetched;

  useEffect(() => {
    if (noPreview) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const { bytes, link } = await fetchBytes(entry.path);
        linkRef.current = link;
        if (cancelled) return;
        if (type === "pdf" || type === "png" || type === "jpg") {
          objectUrl = URL.createObjectURL(new Blob([bytes], { type: type === "pdf" ? "application/pdf" : type === "png" ? "image/png" : "image/jpeg" }));
          setFetched(type === "pdf" ? { kind: "pdf", url: objectUrl } : { kind: "image", url: objectUrl });
        } else if (type === "docx") {
          const mammoth = await import("mammoth");
          const input = { arrayBuffer: bytes } as unknown as Parameters<typeof mammoth.convertToHtml>[0];
          const { value } = await mammoth.convertToHtml(input);
          if (!cancelled) setFetched({ kind: "html", html: value });
        } else {
          const text = new TextDecoder().decode(bytes.slice(0, 1024 * 1024));
          if (!cancelled) setFetched({ kind: "text", text });
        }
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message || "This preview couldn't load.");
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entry.path, noPreview, type]);

  async function download() {
    try {
      const link = linkRef.current ?? (await fetch(`/api/dropbox/link?path=${encodeURIComponent(entry.path)}`).then(readJson)).link;
      window.open(link, "_blank", "noopener");
    } catch (e) {
      setSaveError((e as Error).message);
    }
  }

  async function send() {
    if (!validMatter) {
      setSaveError("Choose the matter to save this file to.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      try {
        localStorage.setItem(MATTER_KEY, validMatter);
      } catch {}
      const { document } = await fetch("/api/dropbox/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: entry.path, matterId: validMatter }),
      }).then(readJson);
      if (type === "pdf") {
        router.push(`/dashboard/power-pdf/${document.id}?version=${document.versions[0].id}`);
        return;
      }
      setSaved({ docId: document.id });
      setSaving(false);
    } catch (e) {
      setSaveError((e as Error).message);
      setSaving(false);
    }
  }

  const docHtml =
    loaded?.kind === "html"
      ? `<!doctype html><html><head><meta charset="utf-8"><style>body{font:15px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1918;max-width:760px;margin:32px auto;padding:0 28px}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #D1D7E0;padding:4px 8px}</style></head><body>${loaded.html}</body></html>`
      : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => !saving && onClose()}>
      <div className="bg-cream rounded-2xl w-full max-w-[1100px] h-[90vh] flex flex-col shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-line flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="text-[15px] font-semibold truncate">{entry.name}</div>
            <div className="text-[12.5px] text-muted">
              {type ? fileTypeLabel(type) : "File"}
              {entry.size != null ? ` · ${formatSize(entry.size)}` : ""}
              {entry.modified ? ` · modified ${formatModified(entry.modified)}` : ""}
            </div>
          </div>
          {type && !saved && (
            <div className="w-[220px]">
              <SelectBox label="Matter" value={validMatter} onChange={setMatterId}>
                <option value="">{mattersLoaded && matters.length === 0 ? "No matters yet" : "Choose a matter"}</option>
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </SelectBox>
            </div>
          )}
          {type && !saved && (
            <button
              onClick={send}
              disabled={saving || tooLarge}
              title={tooLarge ? "Files over 25 MB can't be added to LawPower" : undefined}
              className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-btn-hover transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : type === "pdf" ? <PenLine size={14} strokeWidth={2} /> : <FolderInput size={14} strokeWidth={2} />}
              {saving ? "Saving…" : type === "pdf" ? "Open in Power PDF" : "Save to Documents"}
            </button>
          )}
          {saved && (
            <Link
              href="/dashboard/documents"
              className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-btn-hover transition-colors"
            >
              <Check size={14} strokeWidth={2} /> Saved · Open Documents
            </Link>
          )}
          <button
            onClick={download}
            className="bg-card-alt hover:bg-line/70 px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 transition-colors"
          >
            <Download size={14} strokeWidth={2} /> Download
          </button>
          <button onClick={onClose} disabled={saving} className="w-9 h-9 rounded-full hover:bg-card-alt flex items-center justify-center text-muted hover:text-ink disabled:opacity-40" aria-label="Close">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {(saveError || tooLarge || (mattersLoaded && matters.length === 0 && type)) && (
          <div className={`px-5 py-2.5 text-[13px] border-b border-line ${saveError ? "bg-red-50 text-red-700" : "bg-card-alt"}`}>
            {saveError ??
              (tooLarge ? (
                "This file is larger than 25 MB, so it can’t be added to LawPower. You can still preview and download it."
              ) : (
                <>
                  Files are saved to a matter.{" "}
                  <Link href="/dashboard/matters" className="underline underline-offset-2">
                    Create a matter first
                  </Link>
                  .
                </>
              ))}
          </div>
        )}
        {!type && (
          <div className="px-5 py-2.5 text-[13px] border-b border-line bg-card-alt">
            This file type can’t be added to LawPower. You can add PDF, Word, Excel, PowerPoint, text, images and emails.
          </div>
        )}

        <div className="flex-1 min-h-0 bg-white">
          {loadError ? (
            <div className="h-full flex items-center justify-center text-[14px] text-muted px-6 text-center">{loadError}</div>
          ) : !loaded ? (
            <div className="h-full flex items-center justify-center text-[14px] text-muted gap-2">
              <Loader2 size={16} className="animate-spin" /> Loading preview…
            </div>
          ) : loaded.kind === "pdf" ? (
            <iframe src={loaded.url} title={entry.name} className="w-full h-full border-0" />
          ) : loaded.kind === "image" ? (
            <div className="h-full overflow-auto flex items-start justify-center p-6 bg-card-alt/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={loaded.url} alt={entry.name} className="max-w-full h-auto shadow-sm" />
            </div>
          ) : loaded.kind === "html" ? (
            // Sandboxed with no scripts: Word content can't run code here.
            <iframe srcDoc={docHtml} sandbox="" title={entry.name} className="w-full h-full border-0" />
          ) : loaded.kind === "text" ? (
            <pre className="h-full overflow-auto p-6 text-[13px] leading-relaxed whitespace-pre-wrap font-mono">{loaded.text}</pre>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <FileIcon size={26} strokeWidth={1.5} className="text-muted mb-3" />
              <div className="text-[14px] text-muted">{loaded.reason}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
