"use client";

import ClickAway from "@/components/ClickAway";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, FolderInput, Mail, Check, X, RefreshCw, Undo2, Paperclip, ChevronDown, Inbox, UserCheck, CheckCircle2, RotateCcw, AlertCircle } from "lucide-react";
import PriorityDot from "@/components/PriorityDot";
import { statusMeta, type BoardTask } from "@/components/NewTaskModal";
import { numberOf } from "@/components/NewMatterModal";
import { displayName } from "@/lib/initials";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import CreateTaskFromEmail from "@/components/mail/CreateTaskFromEmail";
import { sortFolders } from "@/lib/mail/folders";
import type { MailFolder, MailProvider, MailSummary } from "@/lib/mail/types";

type Conn = { provider: MailProvider; email: string | null; status: string };
type Settings = { provider: MailProvider; folderId: string; folderName: string } | null;
type Item = { provider: MailProvider; messageId: string; status: "task" | "dismissed"; taskId: string | null };

const providerName: Record<MailProvider, string> = { google: "Gmail", microsoft: "Outlook" };
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

type Tab = "todo" | "assigned" | "completed";

// Plain text of a (rich-text) task description, for a one-line preview.
const plain = (s: string) =>
  (s ?? "")
    .replace(/<\/(p|li|h[1-6]|div)>|<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shortDate = (s: string) => new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function TaskFolderPage() {
  const { teamMembers, boards, addTask, tasks, tasksLoaded, updateTask, matters, generalName } = useWorkspaceData();
  const [tab, setTab] = useState<Tab>("todo");
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
  // To Be Assigned: emails not yet turned into a task (dismissed ones only on request).
  const visible = messages.filter((m) => {
    const it = itemFor(m);
    return !it || (showHandled && it.status === "dismissed");
  });
  const waitingCount = messages.filter((m) => !itemFor(m)).length;
  const dismissedCount = messages.filter((m) => itemFor(m)?.status === "dismissed").length;

  // Assigned / Completed: the tasks made from Task Folder emails, newest first.
  const folderTasks = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const seen = new Set<string>();
    const list: BoardTask[] = [];
    for (const i of items) {
      if (i.status !== "task" || !i.taskId || seen.has(i.taskId)) continue;
      const t = byId.get(i.taskId);
      if (t) {
        seen.add(t.id);
        list.push(t);
      }
    }
    return list;
  }, [items, tasks]);
  const assignedTasks = folderTasks.filter((t) => t.status !== "done");
  const completedTasks = folderTasks
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const today = ymd(new Date());
  const person = (email: string | null | undefined) => {
    if (!email) return null;
    const m = teamMembers.find((x) => x.email.toLowerCase() === email.toLowerCase());
    return displayName(m?.fullName, email);
  };
  const boardName = (id?: string | null) => (id ? boards.find((b) => b.id === id)?.name ?? generalName : generalName);
  const matterLabel = (id?: string | null) => {
    const m = id ? matters.find((x) => x.id === id) : null;
    return m ? numberOf(m) ?? m.title : null;
  };

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

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-line mb-6" role="tablist" aria-label="Task Folder">
        {(
          [
            { key: "todo", label: "To Be Assigned", icon: Inbox, count: settings ? waitingCount : null },
            { key: "assigned", label: "Assigned", icon: UserCheck, count: assignedTasks.length },
            { key: "completed", label: "Completed", icon: CheckCircle2, count: completedTasks.length },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 pb-3 -mb-px border-b-2 text-[14.5px] font-medium transition-colors ${on ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              <Icon size={15} strokeWidth={1.75} />
              {t.label}
              {t.count !== null && t.count > 0 && (
                <span className={`min-w-[22px] h-[20px] px-1.5 rounded-full text-[12px] font-semibold flex items-center justify-center ${on ? "bg-btn text-ink" : "bg-chip text-muted"}`}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {loadError && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">{loadError}</div>}

      {tab !== "todo" ? (
        <TaskTable
          kind={tab}
          tasks={tab === "assigned" ? assignedTasks : completedTasks}
          loaded={tasksLoaded && conns !== null}
          today={today}
          person={person}
          boardName={boardName}
          matterLabel={matterLabel}
          onComplete={(t) => updateTask({ ...t, status: "done", updatedAt: new Date().toISOString() })}
          onReopen={(t) => updateTask({ ...t, status: "todo", updatedAt: new Date().toISOString() })}
          onGoToFolder={() => setTab("todo")}
        />
      ) : conns === null ? (
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
                <ClickAway onClose={() => setPicking(false)} />
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
                  {waitingCount} {waitingCount === 1 ? "email" : "emails"} waiting
                  {dismissedCount > 0 && ` · ${dismissedCount} dismissed`}
                </div>
                {dismissedCount > 0 && (
                  <button onClick={() => setShowHandled((v) => !v)} className="text-[13px] text-muted hover:text-ink underline underline-offset-2">
                    {showHandled ? "Hide dismissed" : "Show dismissed"}
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
                              <button onClick={() => mark(m, "dismissed")} className="px-3 py-1.5 rounded-full text-[13px] font-medium bg-chip text-ink hover:bg-btn transition-colors">
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
            setNotice({ text: `Task created: ${task.title}. It's now under Assigned.`, taskId: task.id, boardId });
            setCreating(null);
          }}
        />
      )}
    </div>
  );
}

// Assigned and Completed: the tasks made from Task Folder emails.
function TaskTable({
  kind,
  tasks,
  loaded,
  today,
  person,
  boardName,
  matterLabel,
  onComplete,
  onReopen,
  onGoToFolder,
}: {
  kind: "assigned" | "completed";
  tasks: BoardTask[];
  loaded: boolean;
  today: string;
  person: (email: string | null | undefined) => string | null;
  boardName: (id?: string | null) => string;
  matterLabel: (id?: string | null) => string | null;
  onComplete: (t: BoardTask) => void;
  onReopen: (t: BoardTask) => void;
  onGoToFolder: () => void;
}) {
  if (!loaded)
    return (
      <div className="flex items-center gap-2 text-[14px] text-muted py-8">
        <Loader2 size={15} className="animate-spin" /> Loading tasks…
      </div>
    );
  if (!tasks.length)
    return (
      <div className="border border-line rounded-2xl bg-white text-center px-6 py-14">
        <span className="w-12 h-12 rounded-full bg-card-alt mx-auto mb-3 flex items-center justify-center">
          {kind === "assigned" ? <UserCheck size={18} strokeWidth={1.5} className="text-muted" /> : <CheckCircle2 size={18} strokeWidth={1.5} className="text-muted" />}
        </span>
        <div className="text-[16px] font-semibold mb-1">{kind === "assigned" ? "No open tasks from the Task Folder" : "Nothing completed yet"}</div>
        <div className="text-[13.5px] text-muted">
          {kind === "assigned" ? (
            <>
              Click <span className="text-ink font-medium">Create task</span> on an email under{" "}
              <button onClick={onGoToFolder} className="text-ink font-medium underline underline-offset-2">
                To Be Assigned
              </button>{" "}
              and it shows up here.
            </>
          ) : (
            "Tasks made from Task Folder emails move here once they're marked complete."
          )}
        </div>
      </div>
    );
  const th = "text-left text-[12px] font-semibold text-muted px-3 py-2.5 whitespace-nowrap";
  return (
    <div className="border border-line rounded-2xl bg-white overflow-x-auto">
      <table className="w-full min-w-[860px] text-[13.5px]">
        <thead className="border-b border-line bg-cream">
          <tr>
            <th className={`${th} pl-5 w-[150px]`}>Action</th>
            <th className={`${th} w-[120px]`}>{kind === "assigned" ? "Due date" : "Completed"}</th>
            <th className={th}>Task</th>
            <th className={`${th} w-[130px]`}>Matter</th>
            <th className={`${th} w-[150px]`}>Assigned to</th>
            <th className={`${th} w-[130px] pr-5`}>{kind === "assigned" ? "Status" : "Board"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {tasks.map((t) => {
            const overdue = kind === "assigned" && !!t.dueDate && t.dueDate < today;
            const who = person(t.assignee);
            const offered = !t.assignee && (t.offeredTo ?? []).length > 0;
            const matter = matterLabel(t.matterId);
            const desc = plain(t.description);
            const st = statusMeta[t.status];
            const StIcon = st.icon;
            return (
              <tr key={t.id} className="align-top hover:bg-[#F7F9FC]">
                <td className="pl-5 pr-3 py-3">
                  {kind === "assigned" ? (
                    <button onClick={() => onComplete(t)} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3 py-1.5 rounded-full text-[12.5px] font-medium whitespace-nowrap transition-colors">
                      <Check size={13} /> Mark complete
                    </button>
                  ) : (
                    <button onClick={() => onReopen(t)} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3 py-1.5 rounded-full text-[12.5px] font-medium whitespace-nowrap transition-colors">
                      <RotateCcw size={13} /> Reopen
                    </button>
                  )}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {kind === "completed" ? (
                    <span className="text-muted">{t.updatedAt ? shortDate(t.updatedAt) : "—"}</span>
                  ) : t.dueDate ? (
                    <span className={`flex items-center gap-1 ${overdue ? "text-[#D92D3A] font-medium" : ""}`}>
                      {overdue && <AlertCircle size={13} />}
                      {shortDate(t.dueDate)}
                    </span>
                  ) : (
                    <span className="text-muted">No date</span>
                  )}
                </td>
                <td className="px-3 py-3 min-w-0">
                  <div className="flex items-start gap-2">
                    <PriorityDot priority={t.priority} size={18} />
                    <div className="min-w-0">
                      <Link href={`/dashboard/task-board?${t.boardId ? `board=${t.boardId}&` : ""}task=${t.id}`} className={`font-medium hover:underline underline-offset-2 ${kind === "completed" ? "text-muted line-through decoration-muted-light" : "text-ink"}`}>
                        {t.title || "(untitled task)"}
                      </Link>
                      {desc && <div className="text-[12.5px] text-muted line-clamp-2 mt-0.5 max-w-[460px]">{desc}</div>}
                      {kind === "assigned" && <div className="text-[12px] text-muted-light mt-0.5">{boardName(t.boardId)}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{matter ?? <span className="text-muted">—</span>}</td>
                <td className="px-3 py-3">
                  {who ? <span className="truncate block max-w-[150px]" title={t.assignee ?? ""}>{who}</span> : offered ? <span className="text-muted">Offered to {(t.offeredTo ?? []).length}</span> : <span className="text-muted">Unassigned</span>}
                </td>
                <td className="px-3 py-3 pr-5 whitespace-nowrap">
                  {kind === "assigned" ? (
                    <span className={`flex items-center gap-1.5 ${st.color}`}>
                      <StIcon size={14} /> <span className="text-ink">{st.label}</span>
                    </span>
                  ) : (
                    boardName(t.boardId)
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
