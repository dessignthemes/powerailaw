"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, FolderInput, Mail, Check, X, RefreshCw, Undo2, Paperclip, ExternalLink, ChevronDown } from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import { todayYmd, type TaskPriority } from "@/components/NewTaskModal";
import { displayName } from "@/lib/initials";
import SelectBox from "@/components/SelectBox";
import { sortFolders } from "@/lib/mail/folders";
import type { MailFolder, MailMessage, MailProvider, MailSummary } from "@/lib/mail/types";

type Conn = { provider: MailProvider; email: string | null; status: string };
type Settings = { provider: MailProvider; folderId: string; folderName: string } | null;
type Item = { provider: MailProvider; messageId: string; status: "task" | "dismissed"; taskId: string | null };

const providerName: Record<MailProvider, string> = { google: "Gmail", microsoft: "Outlook" };
const LAST_BOARD_KEY = "lawpower.triage.lastBoard";
const MAX_BODY = 20000; // characters of email text copied into the task

// Readable plain text from an email's HTML (runs in the browser only).
function htmlToText(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, head").forEach((n) => n.remove());
  doc.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
  doc.querySelectorAll("p, div, tr, li, h1, h2, h3, h4, blockquote").forEach((n) => n.append("\n"));
  return (doc.body.textContent ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function emailHeader(email: MailSummary) {
  return `From: ${email.from}${email.fromEmail && email.fromEmail !== email.from ? ` <${email.fromEmail}>` : ""}\nReceived: ${new Date(email.date).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  })}\nSubject: ${email.subject || "(no subject)"}`;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.error ?? "Something went wrong.");
  return d as T;
}

function when(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TaskFolderPage() {
  const { teamMembers, boards, addTask } = useWorkspaceData();
  const [conns, setConns] = useState<Conn[] | null>(null);
  const [settings, setSettings] = useState<Settings>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [picking, setPicking] = useState(false);
  const [pickProvider, setPickProvider] = useState<MailProvider | null>(null);
  const [folders, setFolders] = useState<MailFolder[] | null>(null);
  const [foldersError, setFoldersError] = useState<string | null>(null);

  const [messages, setMessages] = useState<MailSummary[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [showHandled, setShowHandled] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [creating, setCreating] = useState<MailSummary | null>(null);
  const [notice, setNotice] = useState<{ text: string; taskId?: string; boardId?: string | null } | null>(null);

  // Mailbox connections + saved folder
  useEffect(() => {
    Promise.all([getJson<{ connections: Conn[] }>("/api/mail/status"), getJson<{ settings: Settings; items: Item[] }>("/api/triage")])
      .then(([s, t]) => {
        setConns(s.connections); // a mailbox that needs reconnecting shows that message in the list
        setSettings(t.settings);
        setItems(t.items);
      })
      .catch((e: Error) => {
        setLoadError(e.message);
        setConns([]);
      });
  }, []);

  // Emails in the watched folder
  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    const qs = new URLSearchParams({ provider: settings.provider, folder: settings.folderId });
    getJson<{ messages: MailSummary[]; nextPageToken: string | null }>(`/api/mail/messages?${qs}`)
      .then((d) => {
        if (cancelled) return;
        setMessages(d.messages);
        setNext(d.nextPageToken);
        setListError(null);
      })
      .catch((e: Error) => !cancelled && setListError(e.message))
      .finally(() => !cancelled && setListLoading(false));
    return () => {
      cancelled = true;
    };
  }, [settings, refreshKey]);

  const openPicker = useCallback(
    (p: MailProvider) => {
      setPicking(true);
      setPickProvider(p);
      setFolders(null);
      setFoldersError(null);
      getJson<{ folders: MailFolder[] }>(`/api/mail/folders?provider=${p}`)
        .then((d) => setFolders(d.folders))
        .catch((e: Error) => setFoldersError(e.message));
    },
    []
  );

  async function chooseFolder(f: MailFolder) {
    if (!pickProvider) return;
    try {
      const d = await getJson<{ settings: Settings }>("/api/triage/settings", {
        method: "PUT",
        body: JSON.stringify({ provider: pickProvider, folderId: f.id, folderName: f.name }),
      });
      setPicking(false);
      setMessages([]);
      setListLoading(true);
      setSettings(d.settings);
    } catch (e) {
      setFoldersError((e as Error).message);
    }
  }

  function loadMore() {
    if (!settings || !next) return;
    setListLoading(true);
    const qs = new URLSearchParams({ provider: settings.provider, folder: settings.folderId, pageToken: next });
    getJson<{ messages: MailSummary[]; nextPageToken: string | null }>(`/api/mail/messages?${qs}`)
      .then((d) => {
        setMessages((m) => [...m, ...d.messages]);
        setNext(d.nextPageToken);
      })
      .catch((e: Error) => setListError(e.message))
      .finally(() => setListLoading(false));
  }

  const handled = useMemo(() => new Map(items.map((i) => [`${i.provider}:${i.messageId}`, i])), [items]);
  const itemFor = (m: MailSummary) => (settings ? handled.get(`${settings.provider}:${m.id}`) : undefined);
  const visible = messages.filter((m) => showHandled || !itemFor(m));
  const handledCount = messages.filter((m) => itemFor(m)).length;

  async function mark(m: MailSummary, status: "task" | "dismissed", taskId?: string) {
    if (!settings) return;
    const item: Item = { provider: settings.provider, messageId: m.id, status, taskId: taskId ?? null };
    setItems((list) => [item, ...list.filter((i) => !(i.provider === item.provider && i.messageId === item.messageId))]);
    try {
      await getJson("/api/triage/items", { method: "POST", body: JSON.stringify(item) });
    } catch (e) {
      setListError((e as Error).message);
    }
  }

  async function putBack(m: MailSummary) {
    if (!settings) return;
    setItems((list) => list.filter((i) => !(i.provider === settings.provider && i.messageId === m.id)));
    await fetch(`/api/triage/items?provider=${settings.provider}&messageId=${encodeURIComponent(m.id)}`, { method: "DELETE" }).catch(() => {});
  }

  const connected = conns ?? [];

  return (
    <div className="px-10 py-10 max-w-[1100px]">
      <h1 className="text-[28px] font-semibold mb-1">Task Folder</h1>
      <p className="text-[14.5px] text-muted mb-7">
        Drop emails that need action into one folder in your mailbox. They show up here, and with one click each becomes a task you can assign to anyone on a board.
        LawPower only reads that folder; your emails are never moved or changed.
      </p>

      {loadError && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">{loadError}</div>}

      {conns === null ? (
        <div className="flex items-center gap-2 text-[14px] text-muted py-8">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </div>
      ) : connected.length === 0 ? (
        <div className="border border-line rounded-2xl px-6 py-5 bg-card-alt flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[14.5px] font-semibold mb-0.5">Connect your mailbox first</div>
            <div className="text-[13.5px] text-muted">Task Folder reads a folder from the mailbox you connect in the Inbox.</div>
          </div>
          <Link href="/dashboard/inbox" className="bg-btn text-ink px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-btn-hover">
            Go to Inbox
          </Link>
        </div>
      ) : (
        <>
          {/* Watched folder */}
          <div className="border border-line rounded-2xl px-6 py-5 bg-card-alt flex items-center justify-between gap-4 flex-wrap mb-6 relative">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-full bg-white border border-line flex items-center justify-center flex-shrink-0">
                <FolderInput size={17} strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <div className="text-[14.5px] font-semibold truncate">
                  {settings ? `Watching: ${settings.folderName}` : "Choose a folder to watch"}
                </div>
                <div className="text-[13px] text-muted truncate">
                  {settings
                    ? `${providerName[settings.provider]}${connected.find((c) => c.provider === settings.provider)?.email ? ` · ${connected.find((c) => c.provider === settings.provider)?.email}` : ""}`
                    : "Pick the folder you'll drop emails into, for example PlannerLawFirm."}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {settings && (
                <button
                  onClick={() => {
                    setListLoading(true);
                    setRefreshKey((k) => k + 1);
                  }}
                  title="Refresh"
                  aria-label="Refresh"
                  className="w-9 h-9 rounded-full bg-chip flex items-center justify-center hover:bg-btn"
                >
                  <RefreshCw size={14} strokeWidth={1.75} className={listLoading ? "animate-spin" : ""} />
                </button>
              )}
              {connected.length > 1 ? (
                connected.map((c) => (
                  <button key={c.provider} onClick={() => openPicker(c.provider)} className="bg-btn text-ink px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-btn-hover">
                    {settings ? "Change" : "Choose"} {providerName[c.provider]} folder
                  </button>
                ))
              ) : (
                <button onClick={() => openPicker(connected[0].provider)} className="bg-btn text-ink px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-btn-hover flex items-center gap-1.5">
                  {settings ? "Change folder" : "Choose folder"} <ChevronDown size={14} />
                </button>
              )}
            </div>

            {picking && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPicking(false)} />
                <div className="absolute right-6 top-[calc(100%-8px)] z-50 w-[320px] max-h-[60vh] overflow-y-auto bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5">
                  <div className="px-3 pt-2 pb-1 text-[12px] font-semibold uppercase tracking-wide text-muted">
                    {pickProvider ? providerName[pickProvider] : ""} folders
                  </div>
                  {foldersError ? (
                    <div className="px-3 py-3 text-[13px] text-red-600">{foldersError}</div>
                  ) : !folders ? (
                    <div className="px-3 py-3 text-[13px] text-muted flex items-center gap-2">
                      <Loader2 size={13} className="animate-spin" /> Loading folders…
                    </div>
                  ) : (
                    (() => {
                      const sorted = sortFolders(folders);
                      const roots = sorted.filter((f) => !f.parentId);
                      const rows: { f: MailFolder; depth: number }[] = [];
                      for (const r of roots) {
                        rows.push({ f: r, depth: 0 });
                        for (const c of sorted.filter((x) => x.parentId === r.id)) rows.push({ f: c, depth: 1 });
                      }
                      return rows.map(({ f, depth }) => (
                        <button
                          key={f.id}
                          onClick={() => chooseFolder(f)}
                          className="w-full flex items-center gap-2 py-2 pr-3 rounded-xl text-[13.5px] hover:bg-chip text-left"
                          style={{ paddingLeft: 12 + depth * 16 }}
                        >
                          <span className="flex-1 truncate">{f.name}</span>
                          {settings?.folderId === f.id && <Check size={14} />}
                        </button>
                      ));
                    })()
                  )}
                </div>
              </>
            )}
          </div>

          {notice && (
            <div className="mb-4 rounded-xl border border-[#B9D6B2] bg-[#F1F7EF] px-4 py-3 text-[13.5px] flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <Check size={14} className="text-[#2F5E2A]" /> {notice.text}
              </span>
              <span className="flex items-center gap-3">
                {notice.taskId && (
                  <Link
                    href={`/dashboard/task-board?board=${notice.boardId ?? "general"}&task=${notice.taskId}`}
                    className="font-medium underline underline-offset-2"
                  >
                    View task
                  </Link>
                )}
                <button onClick={() => setNotice(null)} aria-label="Dismiss">
                  <X size={14} />
                </button>
              </span>
            </div>
          )}

          {/* Emails */}
          {settings && (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[13px] text-muted">
                  {visible.length} {visible.length === 1 ? "email" : "emails"} waiting
                  {handledCount > 0 && ` · ${handledCount} handled`}
                </div>
                {handledCount > 0 && (
                  <button onClick={() => setShowHandled((v) => !v)} className="text-[13px] text-muted hover:text-ink underline underline-offset-2">
                    {showHandled ? "Hide handled" : "Show handled"}
                  </button>
                )}
              </div>

              {listError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">{listError}</div>}

              <div className="border border-line rounded-2xl bg-white divide-y divide-line overflow-hidden">
                {listLoading && messages.length === 0 ? (
                  <div className="flex items-center gap-2 text-[14px] text-muted px-5 py-8">
                    <Loader2 size={15} className="animate-spin" /> Loading emails…
                  </div>
                ) : visible.length === 0 ? (
                  <div className="text-center px-6 py-14">
                    <span className="w-12 h-12 rounded-full bg-card-alt mx-auto mb-3 flex items-center justify-center">
                      <Mail size={18} strokeWidth={1.5} className="text-muted" />
                    </span>
                    <div className="text-[16px] font-semibold mb-1">Nothing waiting</div>
                    <div className="text-[13.5px] text-muted">
                      Move emails into <span className="text-ink font-medium">{settings.folderName}</span> in {providerName[settings.provider]}, then refresh.
                    </div>
                  </div>
                ) : (
                  visible.map((m) => {
                    const it = itemFor(m);
                    return (
                      <div key={m.id} className={`px-5 py-4 flex items-start gap-4 ${it ? "bg-cream/60" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-[14px] truncate ${m.unread && !it ? "font-semibold" : "font-medium"}`}>{m.from || m.fromEmail}</span>
                            <span className="text-[12px] text-muted flex-shrink-0">{when(m.date)}</span>
                            {m.hasAttachments && <Paperclip size={12} className="text-muted flex-shrink-0" />}
                          </div>
                          <div className="text-[14px] truncate">{m.subject || "(no subject)"}</div>
                          <div className="text-[12.5px] text-muted truncate">{m.snippet}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                          {it ? (
                            <>
                              <span className="text-[12.5px] text-muted flex items-center gap-1">
                                <Check size={13} /> {it.status === "task" ? "Task created" : "Dismissed"}
                              </span>
                              {it.status === "task" && it.taskId && (
                                <Link href={`/dashboard/task-board?task=${it.taskId}`} className="text-[12.5px] font-medium underline underline-offset-2">
                                  View
                                </Link>
                              )}
                              <button onClick={() => putBack(m)} title="Show in Task Folder again" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center text-muted hover:text-ink">
                                <Undo2 size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => mark(m, "dismissed")} className="px-3 py-1.5 rounded-full text-[13px] font-medium text-muted hover:text-ink hover:bg-chip">
                                Dismiss
                              </button>
                              <button onClick={() => setCreating(m)} className="bg-btn text-ink px-3.5 py-1.5 rounded-full text-[13px] font-medium hover:bg-btn-hover">
                                Create task
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {next && (
                <div className="text-center mt-4">
                  <button onClick={loadMore} disabled={listLoading} className="px-4 py-2 rounded-full bg-chip text-[13px] font-medium hover:bg-btn disabled:opacity-50">
                    {listLoading ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {creating && settings && (
        <CreateTaskFromEmail
          email={creating}
          provider={settings.provider}
          members={teamMembers}
          boards={boards}
          onClose={() => setCreating(null)}
          onCreate={(task, boardId) => {
            addTask(task);
            mark(creating, "task", task.id);
            setNotice({ text: `Task created: ${task.title}`, taskId: task.id, boardId });
            setCreating(null);
          }}
        />
      )}
    </div>
  );
}

function CreateTaskFromEmail({
  email,
  provider,
  members,
  boards,
  onClose,
  onCreate,
}: {
  email: MailSummary;
  provider: MailProvider;
  members: { id: string; email: string; fullName?: string | null }[];
  boards: { id: string; name: string }[];
  onClose: () => void;
  onCreate: (task: Parameters<ReturnType<typeof useWorkspaceData>["addTask"]>[0], boardId: string | null) => void;
}) {
  const [title, setTitle] = useState(email.subject?.trim() || `Email from ${email.from || email.fromEmail}`);
  const [assignee, setAssignee] = useState<string>("");
  const [board, setBoard] = useState<string>(() => {
    try {
      const b = window.localStorage.getItem(LAST_BOARD_KEY);
      return b && (b === "general" || boards.some((x) => x.id === b)) ? b : "general";
    } catch {
      return "general";
    }
  });
  const [due, setDue] = useState(todayYmd());
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [link, setLink] = useState<string | null>(null);
  const [notes, setNotes] = useState(`${emailHeader(email)}\n\n${email.snippet}`);
  const notesEdited = useRef(false); // has the person typed in the notes yet?
  const [bodyState, setBodyState] = useState<"loading" | "full" | "preview">("loading");

  // The full email (text + a link back to it in Outlook / Gmail) for the task notes.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/mail/messages/${encodeURIComponent(email.id)}?provider=${provider}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { message?: MailMessage } | null) => {
        if (cancelled) return;
        const msg = d?.message;
        if (msg?.webLink) setLink(msg.webLink);
        const body = (msg?.text?.trim() || (msg?.html ? htmlToText(msg.html) : "")).slice(0, MAX_BODY);
        if (!body) return setBodyState("preview");
        setBodyState("full");
        // Don't overwrite anything the person has already typed.
        if (!notesEdited.current) setNotes(`${emailHeader(email)}\n\n${body}`);
      })
      .catch(() => !cancelled && setBodyState("preview"));
    return () => {
      cancelled = true;
    };
  }, [email, provider]);

  function create() {
    if (!title.trim()) return;
    const boardId = board === "general" ? null : board;
    try {
      window.localStorage.setItem(LAST_BOARD_KEY, board);
    } catch {
      // not remembered
    }
    onCreate(
      {
        id: crypto.randomUUID(),
        title: title.trim().slice(0, 200),
        description: `${notes.trim()}${link ? `\n\nOpen email: ${link}` : ""}`,
        status: "todo",
        priority,
        assignee: assignee || null,
        dueDate: due || null,
        comments: [],
        boardId,
      },
      boardId
    );
  }

  const field = "w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-ink";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-cream rounded-3xl w-full max-w-[720px] max-h-[92vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[19px] font-semibold">Create task from email</h2>
            <p className="text-[13px] text-muted">The email stays in your mailbox; the task goes to your team&apos;s board.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <label className="block text-[12.5px] font-medium text-muted mb-1">Task</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={`${field} mb-3`} autoFocus />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1">Assign to</label>
            <SelectBox label="Assign to" value={assignee} onChange={(v) => setAssignee(v)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.email}>
                  {displayName(m.fullName, m.email)}
                </option>
              ))}
            </SelectBox>
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1">Board</label>
            <SelectBox label="Board" value={board} onChange={(v) => setBoard(v)}>
              <option value="general">General</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </SelectBox>
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1">Due date</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1">Priority</label>
            <SelectBox label="Priority" value={priority} onChange={(v) => setPriority(v as TaskPriority)}>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </SelectBox>
          </div>
        </div>

        <label className="block text-[12.5px] font-medium text-muted mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            notesEdited.current = true;
          }}
          rows={12}
          className={`${field} resize-y mb-1 leading-relaxed`}
        />
        <div className="text-[12px] text-muted mb-5 flex items-center gap-1.5">
          {bodyState === "loading" ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Loading the full email…
            </>
          ) : (
            <>
              <ExternalLink size={12} />
              {bodyState === "full" ? "The full email is in the notes" : "Only the email preview could be loaded"}
              {link ? ", with a link to open it." : "."}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-[13.5px] font-medium text-muted hover:text-ink">
            Cancel
          </button>
          <button onClick={create} disabled={!title.trim()} className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-btn-hover disabled:opacity-40">
            Create task
          </button>
        </div>
      </div>
    </div>
  );
}
