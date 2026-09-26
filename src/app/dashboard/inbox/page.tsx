"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Mail,
  Search,
  RefreshCw,
  Paperclip,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Image as ImageIcon,
  Inbox as InboxIcon,
  X,
  PanelLeftOpen,
} from "lucide-react";
import type { MailFolder, MailMessage, MailProvider, MailSummary } from "@/lib/mail/types";
import FolderPanel from "@/components/mail/FolderPanel";

// Folder panel preferences live in this browser (they're just layout choices).
const PANEL_KEY = "lawpower.inbox.foldersHidden";
const favKey = (p: MailProvider) => `lawpower.inbox.favorites.${p}`;
function readPref(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writePref(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // private mode etc.: preference just won't persist
  }
}

type Conn = { provider: MailProvider; email: string | null; status: "ok" | "reconnect" | "missing_scope"; autoRefresh: boolean };
type Problem = { message: string; code?: string };

const providerLabel: Record<MailProvider, string> = { google: "Gmail", microsoft: "Outlook" };
const connectHref = (p: MailProvider) => `/connect?provider=${p}&next=/dashboard/inbox`;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error ?? "Something went wrong."), { code: data?.code });
  return data as T;
}

function when(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function sizeLabel(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Email HTML runs in a sandboxed iframe: no scripts, no access to the app,
// links open in a new tab, and remote images stay blocked until the person
// asks for them (they're often used to track when an email is opened).
function emailDocument(msg: MailMessage, showImages: boolean) {
  const img = showImages ? "img-src data: cid: https: http:;" : "img-src data: cid:;";
  const csp = `default-src 'none'; ${img} style-src 'unsafe-inline' https:; font-src https: data:;`;
  const body = msg.html ?? `<pre style="white-space:pre-wrap;font:14px/1.55 -apple-system,Segoe UI,Arial,sans-serif;margin:0">${escapeHtml(msg.text ?? "")}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{margin:0;padding:20px 24px;font:14px/1.55 -apple-system,"Segoe UI",Arial,sans-serif;color:#1a1917;word-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${body}</body></html>`;
}

export default function InboxPage() {
  const [conns, setConns] = useState<Conn[] | null>(null);
  const [statusError, setStatusError] = useState<Problem | null>(null);
  const [provider, setProvider] = useState<MailProvider | null>(null);

  const [messages, setMessages] = useState<MailSummary[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<Problem | null>(null);
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null); // null = Inbox
  const [panelHidden, setPanelHidden] = useState<boolean>(() => {
    const saved = readPref(PANEL_KEY);
    if (saved !== null) return saved === "1";
    return typeof window !== "undefined" && window.innerWidth < 900; // start hidden on small screens
  });
  const [favorites, setFavorites] = useState<Partial<Record<MailProvider, string[]>>>(() => {
    const out: Partial<Record<MailProvider, string[]>> = {};
    for (const p of ["google", "microsoft"] as MailProvider[]) {
      const raw = readPref(favKey(p));
      if (raw) {
        try {
          out[p] = JSON.parse(raw);
        } catch {
          // ignore bad value
        }
      }
    }
    return out;
  });
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<MailMessage | null>(null);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [showImages, setShowImages] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const fit = () => {
      const top = rootRef.current?.getBoundingClientRect().top ?? 0;
      setHeight(Math.max(480, window.innerHeight - top - window.scrollY - 16));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [conns]);

  // Connection status
  useEffect(() => {
    getJson<{ connections: Conn[] }>("/api/mail/status")
      .then((d) => {
        setConns(d.connections);
        const usable = d.connections.find((c) => c.provider === "google") ?? d.connections[0];
        setProvider(usable?.provider ?? null);
      })
      .catch((e: Error & { code?: string }) => {
        setConns([]);
        setStatusError({ message: e.message, code: e.code });
      });
  }, []);

  const fetchPage = useCallback(
    (p: MailProvider, q: string, pageToken?: string, folder?: string | null) => {
      const params = new URLSearchParams({ provider: p });
      if (q) params.set("q", q);
      if (folder) params.set("folder", folder);
      if (pageToken) params.set("pageToken", pageToken);
      return getJson<{ messages: MailSummary[]; nextPageToken: string | null }>(`/api/mail/messages?${params}`);
    },
    []
  );

  // First page whenever provider or search changes
  useEffect(() => {
    if (!provider) return;
    let cancelled = false;
    fetchPage(provider, activeQuery, undefined, folderId)
      .then((d) => {
        if (cancelled) return;
        setMessages(d.messages);
        setNextPage(d.nextPageToken);
        setListError(null);
      })
      .catch((e: Error & { code?: string }) => !cancelled && setListError({ message: e.message, code: e.code }))
      .finally(() => !cancelled && setListLoading(false));
    return () => {
      cancelled = true;
    };
  }, [provider, activeQuery, folderId, fetchPage]);

  // Folders for the current mailbox
  useEffect(() => {
    if (!provider) return;
    let cancelled = false;
    getJson<{ folders: MailFolder[] }>(`/api/mail/folders?provider=${provider}`)
      .then((d) => {
        if (cancelled) return;
        setFolders(d.folders);
        setFoldersError(null);
      })
      .catch((e: Error) => !cancelled && setFoldersError(e.message))
      .finally(() => !cancelled && setFoldersLoading(false));
    return () => {
      cancelled = true;
    };
  }, [provider]);

  function reload() {
    if (!provider) return;
    setListLoading(true);
    fetchPage(provider, activeQuery, undefined, folderId)
      .then((d) => {
        setMessages(d.messages);
        setNextPage(d.nextPageToken);
        setListError(null);
      })
      .catch((e: Error & { code?: string }) => setListError({ message: e.message, code: e.code }))
      .finally(() => setListLoading(false));
  }

  function loadMore() {
    if (!provider || !nextPage) return;
    setListLoading(true);
    fetchPage(provider, activeQuery, nextPage, folderId)
      .then((d) => {
        setMessages((m) => [...m, ...d.messages.filter((x) => !m.some((y) => y.id === x.id))]);
        setNextPage(d.nextPageToken);
      })
      .catch((e: Error & { code?: string }) => setListError({ message: e.message, code: e.code }))
      .finally(() => setListLoading(false));
  }

  function open(m: MailSummary) {
    if (!provider) return;
    setSelectedId(m.id);
    setMessage(null);
    setMsgError(null);
    setShowImages(false);
    setMsgLoading(true);
    getJson<{ message: MailMessage }>(`/api/mail/messages/${encodeURIComponent(m.id)}?provider=${provider}`)
      .then((d) => {
        setMessage(d.message);
        setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, unread: false } : x)));
        // Opening an unread message lowers the folder's unread count here too.
        if (m.unread) {
          const current = folderId ?? folders.find((f) => f.kind === "inbox")?.id;
          setFolders((fs) => fs.map((f) => (f.id === current ? { ...f, unread: Math.max(0, f.unread - 1) } : f)));
        }
      })
      .catch((e: Error) => setMsgError(e.message))
      .finally(() => setMsgLoading(false));
  }

  function switchProvider(p: MailProvider) {
    if (p === provider) return;
    setListLoading(true);
    setMessages([]);
    setSelectedId(null);
    setMessage(null);
    setFolders([]);
    setFoldersLoading(true);
    setFolderId(null);
    setProvider(p);
  }

  function selectFolder(f: MailFolder) {
    const id = f.kind === "inbox" ? null : f.id;
    if (id === folderId && !activeQuery) return;
    setListLoading(true);
    setMessages([]);
    setSelectedId(null);
    setMessage(null);
    setQuery("");
    setActiveQuery("");
    setFolderId(id);
    if (typeof window !== "undefined" && window.innerWidth < 900) setPanelHidden(true);
  }

  function togglePanel(hidden: boolean) {
    setPanelHidden(hidden);
    writePref(PANEL_KEY, hidden ? "1" : "0");
  }

  function currentFavorites(p: MailProvider) {
    return favorites[p] ?? folders.filter((f) => ["inbox", "sent", "drafts"].includes(f.kind)).map((f) => f.id);
  }

  function toggleFavorite(f: MailFolder) {
    if (!provider) return;
    const cur = currentFavorites(provider);
    const next = cur.includes(f.id) ? cur.filter((id) => id !== f.id) : [...cur, f.id];
    setFavorites((m) => ({ ...m, [provider]: next }));
    writePref(favKey(provider), JSON.stringify(next));
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim() === activeQuery) return reload();
    setListLoading(true);
    setSelectedId(null);
    setMessage(null);
    setActiveQuery(query.trim());
  }

  const conn = conns?.find((c) => c.provider === provider) ?? null;
  const srcDoc = useMemo(() => (message ? emailDocument(message, showImages) : ""), [message, showImages]);
  const needsReconnect =
    listError?.code === "reconnect" || listError?.code === "missing_scope" || conn?.status === "reconnect" || conn?.status === "missing_scope";

  // ── Not connected ───────────────────────────────────────────────────────
  if (conns === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-[14px] text-muted gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading your inbox…
      </div>
    );
  }

  if (conns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-6">
          <Mail size={26} strokeWidth={1.75} className="text-red-500" />
        </div>
        <h1 className="text-[26px] font-bold mb-3">Connect your mailbox</h1>
        <p className="text-[15px] text-muted max-w-[440px] mb-7 leading-relaxed">
          Connect your Gmail or Outlook account to read your email here. Only you can see your mailbox.
        </p>
        {statusError && (
          <div className="mb-6 max-w-[520px] rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700 text-left">
            {statusError.message}
          </div>
        )}
        <div className="flex gap-3 flex-wrap justify-center">
          <Link
            href={connectHref("google")}
            className="bg-dark text-white px-5 py-2.5 rounded-full text-[14.5px] font-medium hover:bg-dark2 transition-colors"
          >
            Connect Gmail
          </Link>
          <Link
            href={connectHref("microsoft")}
            className="bg-white border border-line px-5 py-2.5 rounded-full text-[14.5px] font-medium hover:border-muted transition-colors"
          >
            Connect Outlook
          </Link>
        </div>
      </div>
    );
  }

  // ── Connected ───────────────────────────────────────────────────────────
  return (
    <div ref={rootRef} className="px-6 lg:px-10 pt-4" style={{ height: height ?? "calc(100vh - 100px)" }}>
      <div className="flex flex-col h-full border border-line rounded-2xl overflow-hidden bg-cream">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line flex-wrap">
          {panelHidden && (
            <button
              onClick={() => togglePanel(false)}
              title="Show folders"
              aria-label="Show folders"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full hover:bg-card-alt text-[13px] font-medium text-muted hover:text-ink"
            >
              <PanelLeftOpen size={15} strokeWidth={1.75} /> Folders
            </button>
          )}
          {conns.length > 1 ? (
            <div className="flex bg-card-alt rounded-full p-1">
              {conns.map((c) => (
                <button
                  key={c.provider}
                  onClick={() => switchProvider(c.provider)}
                  className={`px-3 py-1 rounded-full text-[13px] font-medium transition-colors ${
                    provider === c.provider ? "bg-white shadow-sm" : "text-muted hover:text-ink"
                  }`}
                >
                  {providerLabel[c.provider]}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[13.5px] font-medium">
              <InboxIcon size={15} strokeWidth={1.75} className="text-muted" />
              {provider && providerLabel[provider]}
            </div>
          )}
          {conn?.email && <span className="text-[12.5px] text-muted truncate">{conn.email}</span>}
          {(() => {
            const f = folderId ? folders.find((x) => x.id === folderId) : folders.find((x) => x.kind === "inbox");
            return f ? <span className="text-[13px] font-semibold truncate">· {f.name}</span> : null;
          })()}

          <form onSubmit={submitSearch} className="flex items-center gap-2 bg-white border border-line rounded-full px-3.5 py-1.5 ml-auto w-full sm:w-[320px]">
            <Search size={14} strokeWidth={1.75} className="text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                folderId
                  ? `Search ${folders.find((x) => x.id === folderId)?.name ?? "this folder"}`
                  : provider === "google"
                    ? "Search mail (e.g. from:client@x.com)"
                    : "Search mail"
              }
              className="flex-1 bg-transparent outline-none text-[13.5px] placeholder:text-muted"
            />
            {activeQuery && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setListLoading(true);
                  setActiveQuery("");
                }}
                className="text-muted hover:text-ink"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </form>
          <button
            onClick={reload}
            disabled={listLoading}
            className="w-8 h-8 rounded-full hover:bg-card-alt flex items-center justify-center text-muted hover:text-ink disabled:opacity-50"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw size={15} strokeWidth={1.75} className={listLoading ? "animate-spin" : ""} />
          </button>
        </div>

        {needsReconnect && provider && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#F5E3B3]/60 border-b border-line text-[13px] flex-wrap">
            <span className="flex items-center gap-2">
              <AlertTriangle size={14} className="flex-shrink-0" />
              {listError?.message ??
                (conn?.status === "missing_scope"
                  ? "Gmail access wasn't granted. Reconnect and keep the Gmail box ticked."
                  : `Your ${providerLabel[provider]} connection has expired.`)}
            </span>
            <Link href={connectHref(provider)} className="bg-dark text-white px-3.5 py-1.5 rounded-full text-[12.5px] font-medium hover:bg-dark2">
              Reconnect {providerLabel[provider]}
            </Link>
          </div>
        )}

        <div className="flex flex-1 min-h-0 relative">
          {/* Folders */}
          {!panelHidden && (
            <>
              <div className="fixed inset-0 bg-black/20 z-30 min-[900px]:hidden" onClick={() => togglePanel(true)} />
              <div className="absolute min-[900px]:static inset-y-0 left-0 z-40 w-[250px] flex-shrink-0 border-r border-line bg-cream shadow-lg min-[900px]:shadow-none">
                <FolderPanel
                  folders={folders}
                  loading={foldersLoading}
                  error={foldersError}
                  accountEmail={conn?.email ?? null}
                  selectedId={folderId ?? folders.find((f) => f.kind === "inbox")?.id ?? null}
                  favorites={provider ? currentFavorites(provider) : []}
                  onSelect={selectFolder}
                  onToggleFavorite={toggleFavorite}
                  onHide={() => togglePanel(true)}
                />
              </div>
            </>
          )}
          {/* List */}
          <div className={`w-full md:w-[380px] md:flex-shrink-0 border-r border-line overflow-y-auto ${selectedId ? "hidden md:block" : ""}`}>
            {listError && !needsReconnect && (
              <div className="m-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">{listError.message}</div>
            )}
            {listLoading && messages.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-16 text-[13.5px] text-muted">
                <Loader2 size={15} className="animate-spin" /> Loading messages…
              </div>
            ) : messages.length === 0 && !listError ? (
              <div className="py-16 text-center text-[13.5px] text-muted">
                {activeQuery ? "No messages match that search." : folderId ? "This folder is empty." : "Your inbox is empty."}
              </div>
            ) : (
              <>
                {messages.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => open(m)}
                    className={`w-full text-left px-4 py-3 border-b border-line transition-colors ${
                      selectedId === m.id ? "bg-card-alt" : "hover:bg-card-alt/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      {m.unread && <span className="w-2 h-2 rounded-full bg-[#3B82F6] flex-shrink-0" aria-label="Unread" />}
                      <span className={`text-[13.5px] truncate flex-1 ${m.unread ? "font-semibold" : "font-medium"}`}>{m.from}</span>
                      {m.hasAttachments && <Paperclip size={12} className="text-muted flex-shrink-0" />}
                      <span className="text-[12px] text-muted flex-shrink-0">{when(m.date)}</span>
                    </div>
                    <div className={`text-[13px] truncate ${m.unread ? "font-semibold" : ""}`}>{m.subject}</div>
                    <div className="text-[12.5px] text-muted truncate">{m.snippet}</div>
                  </button>
                ))}
                {nextPage && (
                  <div className="p-3">
                    <button
                      onClick={loadMore}
                      disabled={listLoading}
                      className="w-full py-2 rounded-full bg-card-alt text-[13px] font-medium hover:bg-line/60 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {listLoading && <Loader2 size={13} className="animate-spin" />} Load more
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Reader */}
          <div className={`flex-1 min-w-0 flex flex-col ${selectedId ? "" : "hidden md:flex"}`}>
            {!selectedId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-muted text-[13.5px] gap-2">
                <Mail size={22} strokeWidth={1.5} />
                Select a message to read it.
              </div>
            ) : msgLoading ? (
              <div className="flex-1 flex items-center justify-center gap-2 text-[13.5px] text-muted">
                <Loader2 size={15} className="animate-spin" /> Opening message…
              </div>
            ) : msgError ? (
              <div className="m-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">{msgError}</div>
            ) : message ? (
              <>
                <div className="px-6 pt-5 pb-4 border-b border-line">
                  <button onClick={() => setSelectedId(null)} className="md:hidden text-[13px] text-muted mb-3">
                    ← Back to inbox
                  </button>
                  <h2 className="text-[19px] font-semibold leading-snug mb-2">{message.subject}</h2>
                  <div className="text-[13px] text-muted flex flex-col gap-0.5">
                    <div>
                      <span className="text-ink font-medium">{message.from}</span>
                      {message.fromEmail && message.fromEmail !== message.from && <> &lt;{message.fromEmail}&gt;</>}
                    </div>
                    {message.to && <div className="truncate">To: {message.to}</div>}
                    {message.cc && <div className="truncate">Cc: {message.cc}</div>}
                    <div>{new Date(message.date).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {message.html && !showImages && (
                      <button
                        onClick={() => setShowImages(true)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-card-alt text-[12.5px] font-medium hover:bg-line/60"
                        title="Remote images are blocked by default because they can tell the sender you opened the email."
                      >
                        <ImageIcon size={12} /> Show images
                      </button>
                    )}
                    {message.webLink && (
                      <a
                        href={message.webLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-card-alt text-[12.5px] font-medium hover:bg-line/60"
                      >
                        <ExternalLink size={12} /> Open in {provider ? providerLabel[provider] : "mail"}
                      </a>
                    )}
                  </div>
                  {message.attachments.length > 0 && (
                    <div className="flex gap-2 flex-wrap mt-3">
                      {message.attachments.map((a, i) => (
                        <span key={i} className="flex items-center gap-1.5 text-[12.5px] bg-white border border-line rounded-lg px-2.5 py-1">
                          <Paperclip size={12} className="text-muted" />
                          <span className="max-w-[220px] truncate">{a.name}</span>
                          <span className="text-muted">{sizeLabel(a.size)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <iframe
                  title="Email content"
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  srcDoc={srcDoc}
                  className="flex-1 w-full bg-white"
                />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
