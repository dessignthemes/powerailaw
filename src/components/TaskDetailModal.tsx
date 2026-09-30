"use client";

import AssigneeOptions from "@/components/AssigneeOptions";
import { useCallback, useState, useEffect } from "react";
import { getTimer, startTimer, clearTimer, saveTimer, formatMinutes, type RunningTimer } from "@/lib/taskTimer";
import {
  X,
  Maximize2,
  Square,
  ExternalLink,
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code,
  SquareCode,
  Link2,
  Folder,
  User,
  CalendarDays,
  Check,
  Flag,
  Play,
  Plus,
  ArrowUp,
} from "lucide-react";
import {
  BoardTask,
  TaskComment,
  TaskStatus,
  TaskPriority,
  statusMeta,
  GenericDropdown,
} from "@/components/NewTaskModal";

const toolbarIcons = [
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code,
  SquareCode,
  Link2,
];

const detailTabs = ["Comments", "Attachments", "Time tracking", "Records"];

export default function TaskDetailModal({
  task,
  onClose,
  onUpdate,
}: {
  task: BoardTask;
  onClose: () => void;
  onUpdate: (task: BoardTask) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [assignee, setAssignee] = useState<string | null>(task.assignee);
  const [dueDate, setDueDate] = useState<string | null>(task.dueDate);

  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [tab, setTab] = useState("Comments");
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<TaskComment[]>(task.comments ?? []);
  // Task timer: survives closing this window; stopping it saves a time entry.
  const [timer, setTimer] = useState<RunningTimer | null>(() => (typeof window === "undefined" ? null : getTimer()));
  const [now, setNow] = useState(() => Date.now());
  const [timerMsg, setTimerMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [timerBusy, setTimerBusy] = useState(false);
  const [taskEntries, setTaskEntries] = useState<{ id: string; minutes: number; date: string; description: string; source: string }[] | null>(null);
  const timerRunning = !!timer && timer.taskId === task.id;
  const elapsedSeconds = timerRunning ? Math.max(0, Math.floor((now - new Date(timer!.startedAt).getTime()) / 1000)) : 0;

  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  const loadTaskEntries = useCallback(() => {
    fetch(`/api/time-entries?task=${task.id}&everyone=1`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((d) => setTaskEntries(d.entries ?? []))
      .catch(() => setTaskEntries([]));
  }, [task.id]);

  async function toggleTimer() {
    setTimerMsg(null);
    if (timerRunning && timer) {
      setTimerBusy(true);
      try {
        const { minutes } = await saveTimer(timer);
        clearTimer();
        setTimer(null);
        setTimerMsg({ ok: true, text: `Saved ${formatMinutes(minutes)} to your timesheet.` });
        loadTaskEntries();
      } catch (e) {
        setTimerMsg({ ok: false, text: `${(e as Error).message} The timer is still running.` });
      } finally {
        setTimerBusy(false);
      }
      return;
    }
    const other = getTimer();
    if (other && other.taskId !== task.id) {
      if (!confirm(`A timer is running on “${other.title}”. Stop it (and save that time) and start one here?`)) return;
      try {
        await saveTimer(other);
      } catch (e) {
        setTimerMsg({ ok: false, text: (e as Error).message });
        return;
      }
    }
    setNow(Date.now());
    setTimer(startTimer(task.id, title || task.title));
  }

  function formatElapsed(totalSeconds: number) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    if (m === 0) return `${s}s`;
    if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
    return `${m}m ${String(s).padStart(2, "0")}s`;
  }

  function submitComment() {
    if (!comment.trim()) return;
    const next = [
      ...comments,
      { id: crypto.randomUUID(), body: comment.trim(), createdAt: new Date().toISOString() },
    ];
    setComments(next);
    setComment("");
    commit({ comments: next });
  }

  const StatusIcon = statusMeta[status].icon;

  function commit(patch: Partial<BoardTask>) {
    if (!(patch.title ?? title).trim()) return;
    onUpdate({ ...task, title, description, status, priority, assignee, dueDate, comments, ...patch });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-cream rounded-3xl w-full overflow-y-auto flex flex-col transition-all ${
          expanded ? "max-w-none h-[96vh]" : "max-w-[980px] h-[92vh]"
        }`}
      >
        <div className="flex items-center justify-between px-7 pt-6 pb-2">
          <div className="flex items-center gap-2 text-[13.5px] text-muted font-medium">
            <span className="bg-card-alt px-2.5 py-1 rounded-full">Task board</span>
            <span>›</span>
            <span className="text-ink font-semibold truncate max-w-[240px]">{title}</span>
          </div>
          <div className="flex items-center gap-3 text-muted">
            <button
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Exit full screen" : "Full screen"}
              aria-label={expanded ? "Exit full screen" : "Full screen"}
              className="hover:text-ink transition-colors"
            >
              <Maximize2 size={16} strokeWidth={1.75} />
            </button>
            <button onClick={onClose} className="hover:text-ink transition-colors">
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div className="px-7 pt-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => commit({ title })}
            className="w-full bg-transparent outline-none text-[26px] font-semibold mb-4"
          />

          <div className="flex items-center gap-1 flex-wrap mb-3 border-b border-line pb-3">
            {toolbarIcons.map((Icon, i) => (
              <button
                key={i}
                className="w-7 h-7 rounded-lg hover:bg-card-alt flex items-center justify-center text-muted hover:text-ink transition-colors"
              >
                <Icon size={14} strokeWidth={1.75} />
              </button>
            ))}
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => commit({ description })}
            placeholder="Add more detail..."
            className={`w-full bg-transparent outline-none text-[15px] leading-relaxed placeholder:text-muted resize-y mb-2 overflow-y-auto ${
              expanded ? "h-[58vh]" : "h-[44vh]"
            } min-h-[180px]`}
          />
          {/* Links in the notes (e.g. "Open email: https://…") as clean buttons */}
          {(() => {
            const links = [...description.matchAll(/(?:(open email):\s*)?(https?:\/\/[^\s<>()]+)/gi)].slice(0, 6);
            if (!links.length) return <div className="mb-4" />;
            return (
              <div className="flex flex-wrap gap-2 mb-5">
                {links.map((m, i) => {
                  const url = m[2].replace(/[.,;:!?'"\]]+$/, ""); // drop punctuation after the address
                  let host = "";
                  try {
                    host = new URL(url).hostname.replace(/^www\./, "");
                  } catch {
                    return null;
                  }
                  const isEmail = /open email/i.test(m[1] ?? "");
                  const label = isEmail
                    ? `Open email in ${/outlook|office|live\.com/.test(host) ? "Outlook" : /google/.test(host) ? "Gmail" : host}`
                    : `Open ${host}`;
                  return (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-white border border-line hover:border-muted rounded-full px-3 py-1.5 text-[13px] font-medium"
                    >
                      <ExternalLink size={13} strokeWidth={1.75} /> {label}
                    </a>
                  );
                })}
              </div>
            );
          })()}

          <div className="flex flex-wrap items-center gap-2 mb-6">
            <GenericDropdown
              open={statusOpen}
              setOpen={setStatusOpen}
              trigger={
                <>
                  <StatusIcon size={13} strokeWidth={2} className={statusMeta[status].color} />
                  {statusMeta[status].label}
                </>
              }
            >
              {(Object.keys(statusMeta) as TaskStatus[]).map((s) => {
                const Icon = statusMeta[s].icon;
                return (
                  <button
                    key={s}
                    onClick={() => {
                      setStatus(s);
                      commit({ status: s });
                      setStatusOpen(false);
                    }}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Icon size={15} strokeWidth={2} className={statusMeta[s].color} />
                      {statusMeta[s].label}
                    </span>
                    {s === status && <Check size={14} strokeWidth={2} />}
                  </button>
                );
              })}
            </GenericDropdown>

            <div className="flex items-center gap-1.5 bg-card-alt px-3 py-1.5 rounded-full text-[13px] font-medium text-muted">
              <Folder size={13} strokeWidth={1.75} /> Matter
            </div>

            <GenericDropdown
              open={priorityOpen}
              setOpen={setPriorityOpen}
              trigger={
                <>
                  <Flag size={13} strokeWidth={1.75} />
                  {priority}
                </>
              }
            >
              {(["Low", "Medium", "High"] as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPriority(p);
                    commit({ priority: p });
                    setPriorityOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
                >
                  {p}
                  {p === priority && <Check size={14} strokeWidth={2} />}
                </button>
              ))}
            </GenericDropdown>

            <GenericDropdown
              open={assigneeOpen}
              setOpen={setAssigneeOpen}
              trigger={
                <>
                  <User size={13} strokeWidth={1.75} />
                  {assignee ?? "Assignee"}
                </>
              }
            >
              <AssigneeOptions
                value={assignee}
                onPick={(email) => {
                  setAssignee(email);
                  commit({ assignee: email });
                  setAssigneeOpen(false);
                }}
              />
            </GenericDropdown>

            <GenericDropdown
              open={dateOpen}
              setOpen={setDateOpen}
              trigger={
                <>
                  <CalendarDays size={13} strokeWidth={1.75} />
                  {dueDate ?? "Due date"}
                </>
              }
            >
              <div className="p-2">
                <input
                  type="date"
                  value={dueDate ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setDueDate(v);
                    commit({ dueDate: v });
                  }}
                  className="w-full bg-card-alt rounded-lg px-3 py-2 text-[13.5px] outline-none"
                />
              </div>
            </GenericDropdown>
          </div>

          <div className="flex items-center gap-6 border-b border-line mb-5">
            {detailTabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`pb-3 text-[14px] font-medium transition-colors ${
                  tab === t ? "text-ink border-b-2 border-ink" : "text-muted hover:text-ink"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="min-h-[56px] mb-3">
            {tab === "Time tracking" && (
              <TimeForTask entries={taskEntries} load={loadTaskEntries} />
            )}
            {tab === "Comments" && (
              comments.length === 0 ? (
                <div className="text-[13.5px] text-muted text-center py-2">
                  No comments yet — start the conversation.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {comments.map((c) => (
                    <div key={c.id} className="flex items-start gap-2.5">
                      <span className="w-7 h-7 rounded-full bg-dark text-white flex items-center justify-center text-[11px] font-medium flex-shrink-0">
                        M
                      </span>
                      <div className="bg-card-alt rounded-2xl px-3.5 py-2.5 text-[14px]">{c.body}</div>
                    </div>
                  ))}
                </div>
              )
            )}
            {tab !== "Comments" && (
              <div className="text-[14px] text-muted text-center py-6">
                Nothing here yet.
              </div>
            )}
          </div>
        </div>

        {tab === "Comments" && (
          <div className="px-7 pb-4">
            <div className="border border-line rounded-2xl px-4 py-3 flex items-center gap-2 bg-white">
              <button className="text-muted hover:text-ink">
                <Plus size={16} strokeWidth={1.75} />
              </button>
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitComment();
                }}
                placeholder="Write a comment..."
                className="flex-1 outline-none text-[14px] placeholder:text-muted bg-transparent"
              />
              <button
                onClick={submitComment}
                className="w-8 h-8 rounded-full bg-card-alt flex items-center justify-center text-muted hover:text-ink transition-colors"
              >
                <ArrowUp size={14} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-7 py-4 border-t border-line">
          <button
            onClick={toggleTimer}
            disabled={timerBusy}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13.5px] font-medium transition-colors disabled:opacity-50 ${
              timerRunning ? "bg-btn text-ink ring-1 ring-inset ring-btn-ring hover:bg-btn-hover" : "bg-card-alt text-ink hover:bg-line/70"
            }`}
          >
            {timerRunning ? <Square size={11} fill="currentColor" /> : <Play size={13} strokeWidth={1.75} />}
            {timerBusy ? "Saving…" : timerRunning ? "Stop & save time" : "Start timer"}
          </button>
          <span className="flex items-center gap-3">
            {timerMsg && <span className={`text-[12.5px] ${timerMsg.ok ? "text-[#2F5E2A]" : "text-red-600"}`}>{timerMsg.text}</span>}
            <span className={`text-[13px] mono ${timerRunning ? "text-ink font-semibold" : "text-muted"}`}>{formatElapsed(elapsedSeconds)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function TimeForTask({
  entries,
  load,
}: {
  entries: { id: string; minutes: number; date: string; description: string; source: string }[] | null;
  load: () => void;
}) {
  useEffect(() => {
    load();
  }, [load]);
  if (!entries) return <div className="text-[13.5px] text-muted py-2">Loading time…</div>;
  if (!entries.length) return <div className="text-[13.5px] text-muted py-2">No time logged yet. Use the timer below, or add an entry in Time tracking.</div>;
  const total = entries.reduce((n, e) => n + e.minutes, 0);
  return (
    <div className="text-[13.5px]">
      <div className="mb-2 font-medium">Total: {formatMinutes(total)}</div>
      <div className="divide-y divide-line border border-line rounded-xl bg-white">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-3 px-3.5 py-2">
            <span className="mono text-[12.5px] text-muted w-[88px]">{e.date}</span>
            <span className="flex-1 truncate">{e.description || "—"}</span>
            {e.source === "timer" && <span className="text-[11.5px] text-muted">timer</span>}
            <span className="font-medium">{formatMinutes(e.minutes)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
