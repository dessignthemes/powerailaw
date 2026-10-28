"use client";

import ClickAway from "@/components/ClickAway";
import PortalMessagesPanel from "@/components/mail/PortalMessagesPanel";

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
  Inbox as InboxIcon,
  X,
  Briefcase,
  PanelLeftOpen,
  Flag,
  Mail as MailIcon,
  ListChecks,
  Forward,
  PenSquare,
  ChevronDown,
  ChevronRight,
  FolderInput,
  Reply,
} from "lucide-react";
import ComposeEmail, { forwardBody, fwdSubject } from "@/components/mail/ComposeEmail";
import CreateTaskFromEmail, { htmlToText } from "@/components/mail/CreateTaskFromEmail";
import type { MailFolder, MailMessage, MailProvider, MailSummary } from "@/lib/mail/types";
import FolderPanel from "@/components/mail/FolderPanel";
import AttachmentPreview, { attachmentUrl } from "@/components/mail/AttachmentPreview";
import SaveAttachmentsModal, { type SaveMode } from "@/components/mail/SaveAttachmentsModal";
import { emailDocument } from "@/lib/mail/emailDocument";
import { AutoHeightFrame, ThreadView } from "@/components/mail/ThreadView";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";

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

// Emails opened here are remembered in this browser too, so they stay read
// straight away (the server also records them once migration 0016 has run).
const openedKey = (p: MailProvider) => `lawpower.inbox.opened.${p}`;
function openedIds(p: MailProvider): Set<string> {
  try {
    return new Set(JSON.parse(readPref(openedKey(p)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function rememberOpened(p: MailProvider, id: string) {
  const ids = [...openedIds(p)].filter((x) => x !== id);
  ids.push(id);
  writePref(openedKey(p), JSON.stringify(ids.slice(-1500)));
}
// "Mark as unread": this browser forgets it was opened too.
function forgetOpened(p: MailProvider, id: string) {
  writePref(openedKey(p), JSON.stringify([...openedIds(p)].filter((x) => x !== id)));
}
// syncs: the mailbox keeps read / unread itself (Outlook / Gmail is the source of truth).
function withOpened(p: MailProvider, list: MailSummary[], syncs = false) {
  if (syncs) return list;
  const opened = openedIds(p);
  return opened.size ? list.map((m) => (m.unread && opened.has(m.id) ? { ...m, unread: false } : m)) : list;
}

// The last folder list is kept for this browser session, so it shows at once
// when you come back and stays visible if Outlook or Gmail is slow to answer.
const foldersKey = (p: MailProvider) => `lawpower.inbox.folders.${p}`;
function cachedFolders(p: MailProvider | null): MailFolder[] {
  if (!p || typeof window === "undefined") return [];
  try {
    return JSON.parse(window.sessionStorage.getItem(foldersKey(p)) ?? "[]") as MailFolder[];
  } catch {
    return [];
  }
}
function cacheFolders(p: MailProvider, folders: MailFolder[]) {
  try {
    window.sessionStorage.setItem(foldersKey(p), JSON.stringify(folders));
  } catch {
    // storage full or blocked: the list just loads fresh next time
  }
}

type Conn = { provider: MailProvider; email: string | null; status: "ok" | "reconnect" | "missing_scope"; autoRefresh: boolean; syncsRead?: boolean; canSend?: boolean };
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

// Files the open email on a matter (or takes it off). Saved emails show on the matter's Emails tab.
function FileToMatter({
  provider,
  messageId,
  current,
  onChange,
}: {
  provider: MailProvider;
  messageId: string;
  current: { id: string; number: string | null; title: string } | null;
  onChange: (m: { id: string; number: string | null; title: string } | null) => void;
}) {
  const { matters } = useWorkspaceData();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const list = matters
    .filter((m) => m.status !== "Closed" || m.id === current?.id)
    .filter((m) => !q.trim() || `${m.matterNumber ?? ""} ${m.title}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (b.matterSeq ?? 0) - (a.matterSeq ?? 0))
    .slice(0, 50);

  async function pick(matterId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/mail/messages/${encodeURIComponent(messageId)}/matter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, matterId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? "Couldn't file the email. Please try again.");
      const m = matterId ? matters.find((x) => x.id === matterId) : null;
      onChange(m ? { id: m.id, number: m.matterNumber ?? null, title: m.title } : null);
      setOpen(false);
      const att = d?.matter?.attachments as { added: string[]; skipped: { name: string; why: string }[] } | undefined;
      if (m && att) {
        const parts: string[] = [];
        if (att.added.length) parts.push(`${att.added.length} attachment${att.added.length === 1 ? "" : "s"} added to the matter's Documents`);
        if (att.skipped.length) parts.push(`not added: ${att.skipped.map((x) => `${x.name} (${x.why})`).join("; ")}`);
        setNotice(parts.length ? `Filed. ${parts.join(". ")}.` : "Filed. The attachments were already in the matter's Documents.");
      } else setNotice(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      {current ? (
        <span className="flex items-center gap-1 bg-[#E1E7F4] rounded-full pl-3 pr-1 py-0.5 text-[12.5px] font-medium">
          <a href={`/dashboard/matters/${current.id}`} title={current.title} className="font-semibold hover:underline">
            {current.number ?? current.title}
          </a>
          <button onClick={() => setOpen((o) => !o)} className="px-1.5 py-0.5 rounded-full hover:bg-[#D5DDEE] text-muted" title="Change matter">
            Change
          </button>
          <button onClick={() => void pick(null)} disabled={busy} aria-label="Take off matter" className="w-5 h-5 rounded-full hover:bg-[#D5DDEE] flex items-center justify-center">
            {busy ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
          </button>
        </span>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-chip text-[12.5px] font-medium hover:bg-btn"
        >
          <Briefcase size={12} /> File to matter
        </button>
      )}
      {error && <div className="absolute left-0 top-full mt-1 text-[12px] text-[#B42318] whitespace-nowrap">{error}</div>}
      {notice && !error && (
        <div className="absolute left-0 top-full mt-1 z-30 w-[360px] bg-white border border-line rounded-xl shadow-sm px-3 py-2 text-[12.5px] flex gap-2">
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="text-muted hover:text-ink flex-shrink-0">
            <X size={12} />
          </button>
        </div>
      )}
      {open && (
        <>
          <ClickAway onClose={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+6px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[320px]">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Matter number or name"
              className="w-full bg-card-alt rounded-lg px-3 py-2 text-[13px] outline-none mb-1"
            />
            <div className="max-h-[300px] overflow-y-auto">
              {list.length === 0 ? (
                <div className="px-3 py-2.5 text-[13px] text-muted">No matching matters</div>
              ) : (
                list.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => void pick(m.id)}
                    disabled={busy}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] hover:bg-chip disabled:opacity-50"
                  >
                    {m.matterNumber && <span className="font-semibold flex-shrink-0">{m.matterNumber}</span>}
                    <span className="truncate text-muted">{m.title}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function InboxPage() {
  const { teamMembers, boards, addTask, matters } = useWorkspaceData();
  // New email / forward (opens in the person's Gmail or Outlook) and "Turn into task".
  const [composing, setComposing] = useState<"new" | "forward" | "reply" | null>(null);
  const [taskFrom, setTaskFrom] = useState<MailSummary | null>(null);
  const [attMenu, setAttMenu] = useState<number | null>(null);
  // Conversations opened with the ▸ arrow in the list, and their emails (newest first).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [threadRows, setThreadRows] = useState<Record<string, "loading" | { list: MailSummary[]; mailbox: string }>>({});
  function toggleThread(threadId: string) {
    const closing = expanded.has(threadId);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
    if (closing) {
      // Fetched fresh next time it's opened (new replies may have arrived).
      setThreadRows((t) => {
        const { [threadId]: _gone, ...rest } = t;
        void _gone;
        return rest;
      });
      return;
    }
    if (!provider || threadRows[threadId]) return;
    setThreadRows((t) => ({ ...t, [threadId]: "loading" }));
    fetch(`/api/mail/threads/${encodeURIComponent(threadId)}?provider=${provider}`)
      .then((r) => (r.ok ? r.json() : { messages: [], mailbox: "" }))
      .then((d: { messages?: MailSummary[]; mailbox?: string }) =>
        setThreadRows((t) => ({ ...t, [threadId]: { list: d.messages ?? [], mailbox: (d.mailbox ?? "").toLowerCase() } }))
      )
      .catch(() => setThreadRows((t) => ({ ...t, [threadId]: { list: [], mailbox: "" } })));
  }
  const [saveAtt, setSaveAtt] = useState<{ mode: SaveMode; index?: number } | null>(null);
  const [previewAtt, setPreviewAtt] = useState<{ provider: MailProvider; messageId: string; index: number; attachment: MailMessage["attachments"][number] } | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
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
  const [foldersTry, setFoldersTry] = useState(0);
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
  // Does this mailbox keep read / unread in step with LawPower? (Reconnected with the newer permission.)
  const syncRef = useRef(false);
  const [syncNoteHidden, setSyncNoteHidden] = useState(false);
  // Unread only: the mailbox sends unread emails; ones already read in LawPower are hidden too
  // (the open email stays until you move on). Remembered in this browser.
  const [unreadOnly, setUnreadOnly] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("lawpower.inbox.unreadOnly") === "1";
    } catch {
      return false;
    }
  });
  // Conversations (like Outlook): one line per conversation in the list, and the
  // whole thread under the open email. On by default; remembered on this computer.
  const [threaded, setThreaded] = useState<boolean>(() => readPref("lawpower.inbox.conversations") !== "0");
  const toggleThreaded = () =>
    setThreaded((v) => {
      writePref("lawpower.inbox.conversations", v ? "0" : "1");
      return !v;
    });
  const toggleUnread = () =>
    setUnreadOnly((v) => {
      try {
        localStorage.setItem("lawpower.inbox.unreadOnly", v ? "0" : "1");
      } catch {
        /* private mode */
      }
      return !v;
    });
  const [message, setMessage] = useState<MailMessage | null>(null);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);
  // Images in emails are shown automatically (the "Show images" step was removed at the firm's request).
  const [showImages, setShowImages] = useState(true);

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
    (p: MailProvider, q: string, pageToken?: string, folder?: string | null, unread?: boolean) => {
      const params = new URLSearchParams({ provider: p });
      if (unread) params.set("unread", "1");
      if (q) params.set("q", q);
      if (folder) params.set("folder", folder);
      if (pageToken) params.set("pageToken", pageToken);
      return getJson<{ messages: MailSummary[]; nextPageToken: string | null }>(`/api/mail/messages?${params}`);
    },
    []
  );

  const filtered = unreadOnly ? messages.filter((m) => m.unread || m.id === selectedId) : messages;
  // One line per conversation: its newest email, how many are listed, and unread
  // if any of them is.
  const groups = useMemo(() => {
    if (!threaded) return null;
    const by = new Map<string, MailSummary[]>();
    for (const m of filtered) {
      const k = m.threadId ? `t:${m.threadId}` : `m:${m.id}`;
      const g = by.get(k);
      if (g) g.push(m);
      else by.set(k, [m]);
    }
    return by;
  }, [filtered, threaded]);
  const shown = groups ? [...groups.values()].map((g) => ({ ...g[0], unread: g.some((x) => x.unread), hasAttachments: g.some((x) => x.hasAttachments) })) : filtered;
  const countOf = (m: MailSummary) => (groups && m.threadId ? groups.get(`t:${m.threadId}`)?.length ?? 1 : 1);
  const inGroup = (m: MailSummary, id: string | null) => !!id && (m.id === id || (!!groups && !!m.threadId && !!groups.get(`t:${m.threadId}`)?.some((x) => x.id === id)));

  // Known before the first list loads: a syncing mailbox needs no browser memory of opened emails.
  useEffect(() => {
    syncRef.current = !!conns?.find((c) => c.provider === provider)?.syncsRead;
  }, [conns, provider]);

  // First page whenever provider or search changes
  useEffect(() => {
    if (!provider) return;
    let cancelled = false;
    fetchPage(provider, activeQuery, undefined, folderId, unreadOnly)
      .then((d) => {
        if (cancelled) return;
        setMessages(withOpened(provider, d.messages, syncRef.current));
        setNextPage(d.nextPageToken);
        setListError(null);
      })
      .catch((e: Error & { code?: string }) => !cancelled && setListError({ message: e.message, code: e.code }))
      .finally(() => !cancelled && setListLoading(false));
    return () => {
      cancelled = true;
    };
  }, [provider, activeQuery, folderId, fetchPage, unreadOnly]);

  // Folders for the current mailbox
  useEffect(() => {
    if (!provider) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = (attempt: number) =>
      getJson<{ folders: MailFolder[] }>(`/api/mail/folders?provider=${provider}`)
        .then((d) => {
          if (cancelled) return;
          setFolders(d.folders);
          cacheFolders(provider, d.folders);
          setFoldersError(null);
          setFoldersLoading(false);
        })
        .catch((e: Error) => {
          if (cancelled) return;
          // One quiet retry: Outlook often answers on the second try.
          if (attempt === 0) {
            retry = setTimeout(() => load(1), 1500);
            return;
          }
          setFoldersError(e.message);
          setFoldersLoading(false);
        });
    load(0);
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [provider, foldersTry]);

  const shownFolders = folders.length ? folders : cachedFolders(provider);

  function retryFolders() {
    setFoldersError(null);
    setFoldersLoading(true);
    setFoldersTry((n) => n + 1);
  }

  function reload() {
    if (!provider) return;
    setListLoading(true);
    fetchPage(provider, activeQuery, undefined, folderId, unreadOnly)
      .then((d) => {
        setMessages(withOpened(provider, d.messages, syncRef.current));
        setNextPage(d.nextPageToken);
        setListError(null);
      })
      .catch((e: Error & { code?: string }) => setListError({ message: e.message, code: e.code }))
      .finally(() => setListLoading(false));
  }

  function loadMore() {
    if (!provider || !nextPage) return;
    setListLoading(true);
    fetchPage(provider, activeQuery, nextPage, folderId, unreadOnly)
      .then((d) => {
        setMessages((m) => [...m, ...withOpened(provider, d.messages, syncRef.current).filter((x) => !m.some((y) => y.id === x.id))]);
        setNextPage(d.nextPageToken);
      })
      .catch((e: Error & { code?: string }) => setListError({ message: e.message, code: e.code }))
      .finally(() => setListLoading(false));
  }

  function open(m: MailSummary) {
    if (!provider) return;
    setAttMenu(null);
    setSaveAtt(null);
    setSelectedId(m.id);
    setMessage(null);
    setMsgError(null);
    setShowImages(true);
    setMsgLoading(true);
    getJson<{ message: MailMessage }>(`/api/mail/messages/${encodeURIComponent(m.id)}?provider=${provider}`)
      .then((d) => {
        setMessage(d.message);
        rememberOpened(provider, m.id);
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
            className="bg-btn text-ink px-5 py-2.5 rounded-full text-[14.5px] font-medium hover:bg-btn-hover transition-colors"
          >
            Connect Gmail
          </Link>
          <Link
            href={connectHref("microsoft")}
            className="bg-chip px-5 py-2.5 rounded-full text-[14.5px] font-medium transition-colors hover:bg-btn"
          >
            Connect Outlook
          </Link>
        </div>
      </div>
    );
  }

  // ── Connected ───────────────────────────────────────────────────────────
  return (
    <div ref={rootRef} className="px-6 lg:px-10 pt-4 flex flex-col" style={{ height: height ?? "calc(100vh - 100px)" }}>
      {/* Messages clients sent through the client portal (the mailbox takes the rest of the height). */}
      <PortalMessagesPanel />
      {composing && (() => {
        const summary = message ? messages.find((x) => x.id === message.id) : null;
        const fwd = composing === "forward" && message;
        const rep = composing === "reply" && message;
        if (rep) {
          const subj = message.subject || "(no subject)";
          return (
            <ComposeEmail
              title="Reply"
              initialTo={message.fromEmail ?? ""}
              initialSubject={/^re:/i.test(subj) ? subj : `Re: ${subj}`}
              providers={(conns ?? []).map((c) => c.provider)}
              replyMessage={provider ? { provider, id: message.id } : null}
              footnote="Your reply goes into the same conversation, with the original email underneath."
              onClose={() => setComposing(null)}
              onOpened={() => setComposing(null)}
            />
          );
        }
        const text = fwd ? (message.text?.trim() ? message.text : message.html ? htmlToText(message.html) : "") : "";
        return (
          <ComposeEmail
            title={fwd ? "Forward email" : "New email"}
            initialSubject={fwd ? fwdSubject(message.subject || "(no subject)") : ""}
            initialBody={fwd ? forwardBody({ from: message.from, fromEmail: message.fromEmail, to: message.to, date: message.date, subject: message.subject, text }) : ""}
            matterNumber={fwd ? summary?.matter?.number ?? null : null}
            providers={(conns ?? []).map((c) => c.provider)}
            forwardOriginal={fwd && message.webLink && provider ? { provider, url: message.webLink } : null}
            forwardMessage={fwd && provider ? { provider, id: message.id } : null}
            onClose={() => setComposing(null)}
            onOpened={() => setComposing(null)}
          />
        );
      })()}
      {previewAtt && (
        <AttachmentPreview
          provider={previewAtt.provider}
          messageId={previewAtt.messageId}
          index={previewAtt.index}
          attachment={previewAtt.attachment}
          onClose={() => setPreviewAtt(null)}
        />
      )}
      {taskFrom && provider && (
        <CreateTaskFromEmail
          email={taskFrom}
          provider={provider}
          members={teamMembers}
          boards={boards}
          onClose={() => setTaskFrom(null)}
          onCreate={(task) => {
            // A task from an email filed to a matter belongs to that matter.
            addTask(taskFrom.matter ? { ...task, matterId: taskFrom.matter.id } : task);
            setTaskFrom(null);
            setActionNote(`Task created: "${task.title}". It's on the Task Board.`);
          }}
        />
      )}
      {actionNote && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-[#EEF3FB] px-4 py-2 text-[13px]">
          {actionNote}
          <button onClick={() => setActionNote(null)} aria-label="Dismiss" className="ml-auto text-muted hover:text-ink">
            <X size={13} />
          </button>
        </div>
      )}
      <div className="flex flex-col flex-1 min-h-0 border border-line rounded-2xl overflow-hidden bg-cream">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line flex-wrap">
          {panelHidden && (
            <button
              onClick={() => togglePanel(false)}
              title="Show folders"
              aria-label="Show folders"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full hover:bg-chip text-[13px] font-medium text-muted hover:text-ink"
            >
              <PanelLeftOpen size={15} strokeWidth={1.75} /> Folders
            </button>
          )}
          {conns.length > 1 ? (
            <div className="flex bg-chip rounded-full p-1">
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
            onClick={() => setComposing("new")}
            className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover px-3.5 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap"
          >
            <PenSquare size={13} /> New email
          </button>
          <button
            onClick={reload}
            disabled={listLoading}
            className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center text-muted hover:text-ink disabled:opacity-50"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw size={15} strokeWidth={1.75} className={listLoading ? "animate-spin" : ""} />
          </button>
        </div>

        {!needsReconnect && provider && conn?.status === "ok" && conn.canSend === false && !syncNoteHidden && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#EEF3FB] border-b border-line text-[13px] flex-wrap">
            <span>
              <b>Send email from LawPower, free:</b> reconnect {providerLabel[provider]} once and keep <b>Send email</b> ticked. Emails then go from your own address and appear in your Sent folder.
            </span>
            <span className="flex items-center gap-2">
              <Link href={connectHref(provider)} className="bg-btn text-ink px-3.5 py-1.5 rounded-full text-[12.5px] font-medium hover:bg-btn-hover">
                Reconnect {providerLabel[provider]}
              </Link>
              <button onClick={() => setSyncNoteHidden(true)} className="text-muted hover:text-ink text-[12.5px]">
                Later
              </button>
            </span>
          </div>
        )}

        {!needsReconnect && provider && conn?.status === "ok" && conn.canSend !== false && conn.syncsRead === false && !syncNoteHidden && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#EEF3FB] border-b border-line text-[13px] flex-wrap">
            <span>Read / unread only changes in LawPower for now. Reconnect {providerLabel[provider]} once so it stays in step with {providerLabel[provider]} both ways.</span>
            <span className="flex items-center gap-2">
              <Link href={connectHref(provider)} className="bg-btn text-ink px-3.5 py-1.5 rounded-full text-[12.5px] font-medium hover:bg-btn-hover">
                Reconnect {providerLabel[provider]}
              </Link>
              <button onClick={() => setSyncNoteHidden(true)} className="text-muted hover:text-ink text-[12.5px]">
                Later
              </button>
            </span>
          </div>
        )}

        {needsReconnect && provider && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#F5E3B3]/60 border-b border-line text-[13px] flex-wrap">
            <span className="flex items-center gap-2">
              <AlertTriangle size={14} className="flex-shrink-0" />
              {listError?.message ??
                (conn?.status === "missing_scope"
                  ? "Gmail access wasn't granted. Reconnect and keep the Gmail box ticked."
                  : `Your ${providerLabel[provider]} connection has expired.`)}
            </span>
            <Link href={connectHref(provider)} className="bg-btn text-ink px-3.5 py-1.5 rounded-full text-[12.5px] font-medium hover:bg-btn-hover">
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
                  folders={shownFolders}
                  loading={foldersLoading}
                  error={foldersError}
                  onRetry={retryFolders}
                  accountEmail={conn?.email ?? null}
                  selectedId={folderId ?? shownFolders.find((f) => f.kind === "inbox")?.id ?? null}
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
            <div className="sticky top-0 z-10 bg-page/95 backdrop-blur border-b border-line px-4 py-2 flex items-center justify-between">
              <button
                role="switch"
                aria-checked={threaded}
                onClick={toggleThreaded}
                title="Group emails by conversation and show the whole thread, like Outlook"
                className="flex items-center gap-2 text-[13px] font-medium"
              >
                <span className={`relative w-9 h-5 rounded-full transition-colors ${threaded ? "bg-ink" : "bg-btn"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-[left] ${threaded ? "left-[18px]" : "left-0.5"}`} />
                </span>
                Conversations
              </button>
              <button
                role="switch"
                aria-checked={unreadOnly}
                onClick={toggleUnread}
                className="flex items-center gap-2 text-[13px] font-medium"
              >
                Unread only
                <span className={`relative w-9 h-5 rounded-full transition-colors ${unreadOnly ? "bg-ink" : "bg-btn"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-[left] ${unreadOnly ? "left-[18px]" : "left-0.5"}`} />
                </span>
              </button>
            </div>
            {listError && !needsReconnect && (
              <div className="m-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">{listError.message}</div>
            )}
            {listLoading && messages.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-16 text-[13.5px] text-muted">
                <Loader2 size={15} className="animate-spin" /> Loading messages…
              </div>
            ) : shown.length === 0 && !listError ? (
              <div className="py-16 text-center text-[13.5px] text-muted">
                {unreadOnly
                  ? "No unread emails here."
                  : activeQuery
                    ? "No messages match that search."
                    : folderId
                      ? "This folder is empty."
                      : "Your inbox is empty."}
              </div>
            ) : (
              <>
                {shown.map((m) => {
                  const convo = threaded && !!m.threadId && countOf(m) > 1;
                  const isOpen = convo && expanded.has(m.threadId!);
                  const kids = m.threadId ? threadRows[m.threadId] : undefined;
                  return (
                    <div key={m.id} className="border-b border-line">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          open(m);
                          if (convo && !isOpen) toggleThread(m.threadId!);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && open(m)}
                        className={`relative w-full text-left pr-4 py-3 cursor-pointer transition-colors ${convo ? "pl-8" : "pl-4"} ${
                          inGroup(m, selectedId) ? "bg-chip" : "hover:bg-chip/50"
                        } ${isOpen ? "border-l-[3px] border-[#2B6CB0]" : ""}`}
                      >
                        {convo && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleThread(m.threadId!);
                            }}
                            aria-label={isOpen ? "Hide the emails in this conversation" : "Show the emails in this conversation"}
                            aria-expanded={isOpen}
                            title={isOpen ? "Hide the conversation" : "Show every email in this conversation"}
                            className="absolute left-1.5 top-3 w-6 h-6 rounded-md hover:bg-btn flex items-center justify-center text-muted"
                          >
                            <ChevronRight size={14} strokeWidth={2.25} className={`transition-transform ${isOpen ? "rotate-90 text-[#2B6CB0]" : ""}`} />
                          </button>
                        )}
                        <div className="flex items-center gap-2 mb-0.5">
                          {m.unread && <span className="w-2 h-2 rounded-full bg-[#3B82F6] flex-shrink-0" aria-label="Unread" />}
                          <span className={`text-[13.5px] truncate flex-1 ${m.unread ? "font-semibold" : "font-medium"}`}>
                            {m.from}
                            {countOf(m) > 1 && <span className="ml-1.5 text-muted font-normal">({countOf(m)})</span>}
                          </span>
                          {m.flagged && <Flag size={12} className="text-[#E5484D] fill-current flex-shrink-0" aria-label="Flagged as important" />}
                          {m.hasAttachments && <Paperclip size={12} className="text-muted flex-shrink-0" />}
                          <span className="text-[12px] text-muted flex-shrink-0">{when(m.date)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 min-w-0">
                          {m.matter && (
                            <span className="flex-shrink-0 text-[11px] font-semibold tracking-wide bg-[#E1E7F4] rounded-md px-1.5 py-px" title={m.matter.title}>
                              {m.matter.number ?? m.matter.title}
                            </span>
                          )}
                          <span className={`text-[13px] truncate ${isOpen ? "text-[#2B6CB0] font-medium" : m.unread ? "font-semibold" : ""}`}>{m.subject}</span>
                        </div>
                        {!isOpen && <div className="text-[12.5px] text-muted truncate">{m.snippet}</div>}
                      </div>

                      {/* Every email in the conversation, like Outlook: newest first, Sent Items included. */}
                      {isOpen && (
                        <div className="bg-[#EEF3FB] border-l-[3px] border-[#2B6CB0]">
                          {!kids || kids === "loading" ? (
                            <div className="pl-9 pr-4 py-2.5 text-[12.5px] text-muted flex items-center gap-2">
                              <Loader2 size={12} className="animate-spin" /> Loading the conversation…
                            </div>
                          ) : (
                            kids.list.map((k) => {
                              const you = !!kids.mailbox && k.fromEmail.toLowerCase() === kids.mailbox;
                              return (
                                <button
                                  key={k.id}
                                  onClick={() => open(k)}
                                  className={`w-full text-left pl-9 pr-4 py-2 border-t border-[#D8E2F1] transition-colors ${selectedId === k.id ? "bg-[#D5E1F3]" : "hover:bg-[#E2EAF7]"}`}
                                >
                                  <div className="flex items-center gap-2">
                                    {k.unread && <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] flex-shrink-0" aria-label="Unread" />}
                                    <span className={`text-[13px] truncate flex-1 ${k.unread ? "font-semibold text-[#1E4E8C]" : "font-medium"}`}>{you ? `You (${k.from})` : k.from}</span>
                                    {k.hasAttachments && <Paperclip size={11} className="text-muted flex-shrink-0" />}
                                    {you && <Forward size={11} className="text-[#7C5CC4] -scale-x-100 flex-shrink-0" aria-label="Sent by you" />}
                                    <span className="text-[11.5px] text-muted flex-shrink-0">{when(k.date)}</span>
                                  </div>
                                  <div className="text-[12px] text-muted truncate">{k.snippet}</div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {nextPage && (
                  <div className="p-3">
                    <button
                      onClick={loadMore}
                      disabled={listLoading}
                      className="w-full py-2 rounded-full bg-chip text-[13px] font-medium hover:bg-btn disabled:opacity-60 flex items-center justify-center gap-2"
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
                    {provider && (() => {
                      const summary = messages.find((x) => x.id === message.id);
                      const flagged = !!summary?.flagged;
                      const mark = async (patch: { flagged?: boolean; unread?: boolean }) => {
                        try {
                          const r = await fetch(`/api/mail/messages/${encodeURIComponent(message.id)}/mark`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ provider, ...patch }),
                          });
                          const d = await r.json().catch(() => ({}));
                          if (!r.ok) throw new Error(d?.error ?? "That didn't save. Please try again.");
                          setActionNote(null);
                          return true;
                        } catch (e) {
                          setActionNote((e as Error).message);
                          return false;
                        }
                      };
                      return (
                        <>
                          <button
                            onClick={() => summary && setTaskFrom(summary)}
                            disabled={!summary}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-chip text-[12.5px] font-medium hover:bg-btn disabled:opacity-50"
                          >
                            <ListChecks size={12} /> Turn into task
                          </button>
                        <FileToMatter
                          key={message.id}
                          provider={provider}
                          messageId={message.id}
                          current={messages.find((x) => x.id === message.id)?.matter ?? null}
                          onChange={(mt) => setMessages((list) => list.map((x) => (x.id === message.id ? { ...x, matter: mt } : x)))}
                        />
                          <button
                            onClick={async () => {
                              setMessages((list) => list.map((x) => (x.id === message.id ? { ...x, flagged: !flagged } : x)));
                              if (!(await mark({ flagged: !flagged })))
                                setMessages((list) => list.map((x) => (x.id === message.id ? { ...x, flagged } : x)));
                            }}
                            aria-pressed={flagged}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[12.5px] font-medium transition-colors ${
                              flagged ? "bg-[#FDE8E8] text-[#B42318] hover:bg-[#FBD5D5]" : "bg-chip hover:bg-btn"
                            }`}
                          >
                            <Flag size={12} className={flagged ? "fill-current" : ""} /> {flagged ? "Flagged as important" : "Flag as important"}
                          </button>
                          <button
                            onClick={async () => {
                              if (!(await mark({ unread: true }))) return;
                              forgetOpened(provider, message.id);
                              setMessages((list) => list.map((x) => (x.id === message.id ? { ...x, unread: true } : x)));
                              const current = folderId ?? folders.find((f) => f.kind === "inbox")?.id;
                              setFolders((fs) => fs.map((f) => (f.id === current ? { ...f, unread: f.unread + 1 } : f)));
                              setSelectedId(null);
                              setMessage(null);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-chip text-[12.5px] font-medium hover:bg-btn"
                          >
                            <MailIcon size={12} /> Mark as unread
                          </button>
                          {message.webLink && (
                        <a
                          href={message.webLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-chip text-[12.5px] font-medium hover:bg-btn"
                        >
                          <ExternalLink size={12} /> Open in {provider ? providerLabel[provider] : "mail"}
                        </a>
                          )}
                          <button onClick={() => setComposing("forward")} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-chip text-[12.5px] font-medium hover:bg-btn">
                            <Forward size={12} /> Forward
                          </button>
                          <button onClick={() => setComposing("reply")} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-chip text-[12.5px] font-medium hover:bg-btn">
                            <Reply size={12} /> Reply
                          </button>
                        </>
                      );
                    })()}

                  </div>
                  {message.attachments.length > 0 && (
                    <div className="flex gap-2 flex-wrap items-center mt-3">
                      {message.attachments.map((a, i) => (
                        <div key={i} className="relative flex items-stretch bg-white border border-line rounded-lg hover:border-btn transition-colors">
                          <button
                            onClick={() => provider && setPreviewAtt({ provider, messageId: message.id, index: i, attachment: a })}
                            title={`Preview ${a.name}`}
                            className="flex items-center gap-1.5 text-[12.5px] pl-2.5 pr-1.5 py-1 rounded-l-lg hover:bg-chip"
                          >
                            <Paperclip size={12} className="text-muted" />
                            <span className="max-w-[220px] truncate">{a.name}</span>
                            <span className="text-muted">{sizeLabel(a.size)}</span>
                          </button>
                          <button
                            onClick={() => setAttMenu(attMenu === i ? null : i)}
                            aria-label={`More for ${a.name}`}
                            title="Preview, download or save to a matter"
                            className="px-1.5 border-l border-line rounded-r-lg hover:bg-chip text-muted"
                          >
                            <ChevronDown size={12} />
                          </button>
                          {attMenu === i && provider && (
                            <>
                              <ClickAway onClose={() => setAttMenu(null)} />
                              <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-[250px] bg-white border border-line rounded-xl shadow-[0_12px_32px_rgba(27,25,26,0.14)] p-1.5 text-[13px]">
                                {(
                                  [
                                    ["Preview", () => setPreviewAtt({ provider, messageId: message.id, index: i, attachment: a })],
                                    ["Download", () => window.open(attachmentUrl(provider, message.id, i, true), "_blank")],
                                    ["Save attachment to matter…", () => setSaveAtt({ mode: "one", index: i })],
                                    ["Rename and save to matter…", () => setSaveAtt({ mode: "rename", index: i })],
                                    ...(message.attachments.length > 1 ? ([["Save all attachments to matter…", () => setSaveAtt({ mode: "all" })]] as [string, () => void][]) : []),
                                  ] as [string, () => void][]
                                ).map(([label, fn]) => (
                                  <button
                                    key={label}
                                    onClick={() => {
                                      setAttMenu(null);
                                      fn();
                                    }}
                                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-chip"
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => setSaveAtt({ mode: "all" })}
                        className="flex items-center gap-1.5 text-[12.5px] font-medium bg-chip hover:bg-btn rounded-full px-3 py-1 transition-colors"
                        title="Save the attachments to a matter's Documents"
                      >
                        <FolderInput size={12} /> {message.attachments.length > 1 ? `Save all ${message.attachments.length} to matter` : "Save to matter"}
                      </button>
                    </div>
                  )}
                  {saveAtt && provider && (
                    <SaveAttachmentsModal
                      provider={provider}
                      messageId={message.id}
                      attachments={message.attachments}
                      mode={saveAtt.mode}
                      index={saveAtt.index}
                      matters={matters}
                      defaultMatterId={messages.find((x) => x.id === message.id)?.matter?.id ?? null}
                      onClose={() => setSaveAtt(null)}
                    />
                  )}
                </div>
                {threaded && message.threadId && provider ? (
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <AutoHeightFrame srcDoc={srcDoc} title="" minHeight={240} />
                    <ThreadView key={message.threadId} provider={provider} threadId={message.threadId} currentId={message.id} onOpen={(x) => open(x)} />
                  </div>
                ) : (
                  <iframe
                    aria-label="Email content"
                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                    srcDoc={srcDoc}
                    className="flex-1 w-full bg-white"
                  />
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
