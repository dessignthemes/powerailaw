"use client";

import RichTextEditor, { descriptionText } from "@/components/RichTextEditor";
import AssigneeMultiPicker from "@/components/tasks/AssigneeMultiPicker";
import { useCallback, useState, useEffect, useRef } from "react";
import MatterChip from "@/components/tasks/MatterChip";
import { boardForMatter } from "@/lib/matters/boards";
import ChecklistPanel, { ChecklistPicker } from "@/components/templates/ChecklistPanel";
import { autoStatus, type TaskChecklist } from "@/lib/checklist";
import { WAITING_ON, type WaitingOn } from "@/lib/tasks/waitingOn";
import { waitingLabel } from "@/lib/tasks/customFilters";
import Link from "next/link";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import {
  formatMinutes,
  getAutoTimer,
  setAutoTimer,
  newSession,
  storeSession,
  dropSession,
  saveSession,
  recoverSessions,
  MIN_SAVE_MS,
  type TaskSession,
} from "@/lib/taskTimer";
import {
  X,
  Maximize2,
  Pause,
  Trash2,
  ExternalLink,
  CalendarDays,
  Check,
  Hourglass,
  LayoutGrid,
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
  PrivateToggle,
} from "@/components/NewTaskModal";



const detailTabs = ["Comments", "Attachments", "Time tracking", "Contacts"];

export default function TaskDetailModal({
  task,
  onClose,
  onUpdate,
}: {
  task: BoardTask;
  onClose: () => void;
  onUpdate: (task: BoardTask) => void;
}) {
  const { matters } = useWorkspaceData();
  const matter = task.matterId ? matters.find((m) => m.id === task.matterId) ?? null : null;
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [assignee, setAssignee] = useState<string | null>(task.assignee);
  const [dueDate, setDueDate] = useState<string | null>(task.dueDate);

  const [statusOpen, setStatusOpen] = useState(false);
  // Who the task is waiting on (Task Board filters "Waiting on lender" etc.).
  const [waitingOn, setWaitingOn] = useState<WaitingOn | null>(task.waitingOn ?? null);
  const [isPrivate, setIsPrivate] = useState<boolean>(!!task.isPrivate);
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [otherParty, setOtherParty] = useState("");
  // The usual parties, the ones the firm's boards filter by, and this task's own.
  const { boardFilters, meEmail, acceptTask, teamMembers, boards, generalName } = useWorkspaceData();
  // Which board the task is on (changeable from the bottom row).
  const [boardId, setBoardId] = useState<string | null>(task.boardId ?? null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardSuggestion, setBoardSuggestion] = useState<string | null>(null);
  const [movedTo, setMovedTo] = useState<string | null>(null);
  // The assigner's instructions, and accepting a task offered to several people.
  const [instructions, setInstructions] = useState(task.instructions ?? "");
  const [offerNote, setOfferNote] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [offeredTo, setOfferedTo] = useState<string[]>(task.offeredTo ?? []);
  const offered = !assignee && offeredTo.length > 0;
  const offeredToMe = offered && !!meEmail && offeredTo.some((e) => e.toLowerCase() === meEmail.toLowerCase());
  // One person: assigned. Several: offered (the first to accept takes it). None: unassigned.
  function pickPeople(list: string[]) {
    const one = list.length === 1 ? list[0] : null;
    const many = list.length > 1 ? list : [];
    setAssignee(one);
    setOfferedTo(many);
    commit({ assignee: one, offeredTo: many, ...(list.length ? { assignedBy: task.assignedBy || meEmail } : {}) });
  }
  const nameOf = (email: string | null | undefined) => {
    const m = teamMembers.find((x) => x.email.toLowerCase() === (email ?? "").toLowerCase());
    return m?.fullName || m?.email || email || "";
  };
  const waitingParties = (() => {
    const out: string[] = [];
    const add = (v: string | null | undefined) => {
      if (v && !out.some((o) => waitingLabel(o).toLowerCase() === waitingLabel(v).toLowerCase())) out.push(v);
    };
    WAITING_ON.forEach(add);
    Object.values(boardFilters).flat().forEach((f) => f.kind === "waiting" && add(f.value));
    add(waitingOn);
    return out;
  })();
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [tab, setTab] = useState("Comments");
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<TaskComment[]>(task.comments ?? []);
  const [checklist, setChecklist] = useState<TaskChecklist | null>(task.checklist ?? null);
  // Ticking steps can move the task to another column (see autoStatus); moving it by hand always works too.
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const changeChecklist = (next: TaskChecklist | null) => {
    const moved = autoStatus(status, checklist, next);
    setChecklist(next);
    if (moved) {
      setStatus(moved);
      setAutoNote(`Moved to ${statusMeta[moved].label} automatically.`);
      commit({ checklist: next, status: moved });
    } else commit({ checklist: next });
  };
  const [taskEntries, setTaskEntries] = useState<{ id: string; minutes: number; date: string; description: string; source: string }[] | null>(null);

  const loadTaskEntries = useCallback(() => {
    fetch(`/api/time-entries?task=${task.id}&everyone=1`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((d) => setTaskEntries(d.entries ?? []))
      .catch(() => setTaskEntries([]));
  }, [task.id]);

  // Automatic timer: starts when the task opens, saves one time entry when it closes.
  const sessionRef = useRef<TaskSession | null>(null);
  const lastTickRef = useRef(0); // set when a session starts
  const titleRef = useRef(task.title);
  useEffect(() => {
    titleRef.current = title || task.title;
  }, [title, task.title]);
  const [clock, setClock] = useState<{ active: boolean; running: boolean; ms: number }>({ active: false, running: false, ms: 0 });
  const [autoOn, setAutoOn] = useState(() => (typeof window === "undefined" ? true : getAutoTimer()));

  const show = useCallback(() => {
    const s = sessionRef.current;
    setClock(s ? { active: true, running: s.running, ms: s.activeMs } : { active: false, running: false, ms: 0 });
  }, []);

  // Count time since the last tick. Gaps over 2 minutes (computer asleep) are not counted.
  const tick = useCallback(() => {
    const now = Date.now();
    const delta = now - lastTickRef.current;
    lastTickRef.current = now;
    const s = sessionRef.current;
    if (!s) return;
    if (s.running && delta > 0 && delta < 120_000) s.activeMs += delta;
    s.lastSeen = now;
    s.title = titleRef.current;
    storeSession(s);
  }, []);

  const startSession = useCallback(() => {
    lastTickRef.current = Date.now();
    sessionRef.current = newSession(task.id, titleRef.current);
    storeSession(sessionRef.current);
    show();
  }, [task.id, show]);

  // Ends the session and saves it (fire-and-forget when the window is closing).
  const finishSession = useCallback(() => {
    tick();
    const s = sessionRef.current;
    sessionRef.current = null;
    if (!s) return Promise.resolve(0);
    dropSession(s.id);
    return saveSession(s).catch(() => {
      storeSession({ ...s, closed: true }); // saved next time a task is opened
      return 0;
    });
  }, [tick]);

  useEffect(() => {
    const auto = getAutoTimer();
    recoverSessions().then((n) => n && loadTaskEntries());
    loadTaskEntries();
    if (auto) startSession();
    const interval = setInterval(() => {
      tick();
      show();
    }, 1000);
    const onHide = () => void finishSession();
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && getAutoTimer()) startSession(); // page restored from the back/forward cache
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      clearInterval(interval);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
      void finishSession(); // closing the task stops and records the time
    };
  }, [task.id, startSession, finishSession, tick, show, loadTaskEntries]);

  function pauseOrResume() {
    const s = sessionRef.current;
    if (!s) return startSession();
    tick();
    s.running = !s.running;
    lastTickRef.current = Date.now();
    storeSession(s);
    show();
  }

  function discardSession() {
    const s = sessionRef.current;
    if (!s) return;
    sessionRef.current = null;
    dropSession(s.id);
    show();
  }

  function toggleAuto() {
    const next = !autoOn;
    setAutoOn(next);
    setAutoTimer(next);
    if (next && !sessionRef.current) startSession();
  }

  const loggedMinutes = (taskEntries ?? []).reduce((n, e) => n + e.minutes, 0);

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
    onUpdate({ ...task, title, description, status, priority, assignee, dueDate, comments, checklist, waitingOn, instructions, boardId, offeredTo, isPrivate, ...patch });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-page rounded-3xl w-full overflow-y-auto flex flex-col transition-all ${
          expanded ? "max-w-none h-[96vh]" : "max-w-[980px] h-[92vh]"
        }`}
      >
        <div className="flex items-center justify-between px-7 pt-6 pb-2">
          <div className="flex items-center gap-2 text-[13.5px] text-muted font-medium">
            <span className="bg-card-alt px-2.5 py-1 rounded-full">Task board</span>
            <span>›</span>
            {matter && (
              <>
                <Link
                  href={`/dashboard/matters/${matter.id}`}
                  title={`Matter: ${matter.title}`}
                  className="bg-[#E1E7F4] hover:bg-[#D5DDEE] text-ink px-2.5 py-1 rounded-full font-semibold truncate max-w-[200px] transition-colors"
                >
                  {matter.matterNumber ?? matter.title}
                </Link>
                <span>›</span>
              </>
            )}
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

        <TimerBar
          clock={clock}
          autoOn={autoOn}
          loggedMinutes={loggedMinutes}
          onPause={pauseOrResume}
          onDiscard={discardSession}
          onToggleAuto={toggleAuto}
          format={formatElapsed}
        />

        <div className="px-7 pt-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => commit({ title })}
            className="w-full bg-transparent outline-none text-[26px] font-semibold mb-3"
          />

          {/* Who it's for: near the top so the list has room to open. */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-medium text-muted w-[92px]">Assigned to</span>
            <AssigneeMultiPicker variant="pill" members={teamMembers} value={assignee ? [assignee] : offeredTo} onChange={pickPeople} />
            <PrivateToggle
              on={isPrivate}
              onChange={(v) => {
                setIsPrivate(v);
                commit({ isPrivate: v });
              }}
            />
            {isPrivate && <span className="text-[12.5px] text-muted">Only you and the assignee can see this task</span>}
          </div>

          {offered && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-[#FFF1DE] px-4 py-2.5 text-[13.5px] text-[#8A4B14]">
              <span className="flex-1 min-w-[220px]">
                Offered to {offeredTo.map(nameOf).join(", ")}
                {task.assignedBy ? ` by ${nameOf(task.assignedBy)}` : ""}. The first to accept takes it.
              </span>
              {offeredToMe && (
                <button
                  disabled={accepting}
                  onClick={async () => {
                    setAccepting(true);
                    try {
                      await acceptTask(task.id);
                      setAssignee(meEmail);
                      setOfferedTo([]);
                      setOfferNote("You accepted this task. It's yours now and left the others' lists.");
                    } catch (e) {
                      setOfferNote((e as Error).message);
                    } finally {
                      setAccepting(false);
                    }
                  }}
                  className="bg-white hover:bg-chip text-ink px-4 py-1.5 rounded-full text-[13px] font-medium disabled:opacity-50"
                >
                  {accepting ? "Accepting…" : "Accept task"}
                </button>
              )}
            </div>
          )}
          {offerNote && <div className="mb-3 rounded-xl bg-[#EEF3FB] px-4 py-2 text-[13px]">{offerNote}</div>}
          {movedTo && <div className="mb-3 rounded-xl bg-[#EEF3FB] px-4 py-2 text-[13px]">Moved to the {movedTo} board.</div>}

          {(instructions || task.assignedBy) && (
            <div className="mb-4 rounded-xl border border-[#D8E2F2] bg-[#F3F7FD] px-4 py-3">
              <div className="text-[12px] font-semibold text-[#1F3A93] mb-1">
                Instructions{task.assignedBy ? ` from ${nameOf(task.assignedBy)}` : ""}
              </div>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value.slice(0, 5000))}
                onBlur={() => commit({ instructions })}
                rows={Math.min(6, Math.max(2, instructions.split("\n").length))}
                placeholder="What exactly should be done?"
                className="w-full bg-transparent outline-none resize-y text-[14px]"
              />
            </div>
          )}

          <RichTextEditor
            value={description}
            onChange={setDescription}
            onBlur={(html) => commit({ description: html })}
            placeholder="Add more detail..."
            className={`mb-2 ${expanded ? "h-[58vh]" : "h-[44vh]"} min-h-[180px]`}
          />
          {/* Links in the notes (e.g. "Open email: https://…") as clean buttons */}
          {(() => {
            const seen = new Set<string>();
            const links = [...descriptionText(description).matchAll(/(?:(open email):\s*)?(https?:\/\/[^\s<>()]+)/gi)]
              .filter((m) => (seen.has(m[2]) ? false : (seen.add(m[2]), true)))
              .slice(0, 6);
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
                      className="flex items-center gap-1.5 bg-chip hover:bg-btn transition-colors rounded-full px-3 py-1.5 text-[13px] font-medium"
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
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
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
            <GenericDropdown
              open={waitingOpen}
              setOpen={setWaitingOpen}
              trigger={
                <span className={waitingOn ? "text-[#8A4B14]" : "text-muted"}>
                  <Hourglass size={13} strokeWidth={1.75} className="inline -mt-0.5 mr-1.5" />
                  {waitingOn ? `Waiting on ${waitingLabel(waitingOn)}` : "Waiting on…"}
                </span>
              }
            >
              {[null, ...waitingParties].map((w) => (
                <button
                  key={w ?? "none"}
                  onClick={() => {
                    setWaitingOn(w);
                    commit({ waitingOn: w });
                    setWaitingOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
                >
                  {w ? waitingLabel(w) : "Not waiting on anyone"}
                  {waitingOn === w && <Check size={14} />}
                </button>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = otherParty.replace(/\s+/g, " ").trim().slice(0, 60);
                  if (!v) return;
                  setWaitingOn(v);
                  commit({ waitingOn: v });
                  setOtherParty("");
                  setWaitingOpen(false);
                }}
                className="flex gap-1.5 px-1.5 pt-1.5 mt-1 border-t border-line"
              >
                <input
                  value={otherParty}
                  onChange={(e) => setOtherParty(e.target.value)}
                  placeholder="Someone else…"
                  aria-label="Waiting on someone else"
                  className="flex-1 min-w-0 bg-white border border-line rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                />
                <button type="submit" className="bg-chip hover:bg-btn px-2.5 rounded-lg text-[12.5px] font-medium">
                  Set
                </button>
              </form>
            </GenericDropdown>

            {/* The matter this task belongs to: it shows on the matter's Tasks tab. */}
            <MatterChip
              value={task.matterId ?? null}
              onChange={(id) => {
                commit({ matterId: id });
                // On the main board and the matter has its own board (REP, RES…): offer to move it there.
                const m = id ? matters.find((x) => x.id === id) : null;
                const suggested = m ? boardForMatter(boards, m) : null;
                setBoardSuggestion(suggested && suggested !== boardId ? suggested : null);
              }}
            />

            {/* Move the task to another board (it lands in that board's first column). */}
            <GenericDropdown
              open={boardOpen}
              setOpen={setBoardOpen}
              trigger={
                <>
                  <LayoutGrid size={13} strokeWidth={1.75} />
                  {boardId ? boards.find((b) => b.id === boardId)?.name ?? "Board" : generalName}
                </>
              }
            >
              <div className="px-3 pt-1 pb-1.5 text-[11.5px] text-muted">Move to board</div>
              <div className="flex flex-col gap-[3px]">
                {[{ id: null as string | null, name: generalName }, ...boards.map((b) => ({ id: b.id as string | null, name: b.name }))].map((b) => (
                  <button
                    key={b.id ?? "general"}
                    onClick={() => {
                      setBoardOpen(false);
                      if (b.id === boardId) return;
                      setBoardId(b.id);
                      commit({ boardId: b.id, columnId: null });
                      setMovedTo(b.name);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-[14px] font-medium text-left ${b.id === boardId ? "bg-chip" : "hover:bg-chip"}`}
                  >
                    <span className="truncate"># {b.name}</span>
                    {b.id === boardId && <Check size={14} />}
                  </button>
                ))}
              </div>
            </GenericDropdown>

            {boardSuggestion && (
              <span className="flex items-center gap-2 bg-[#EEF3FB] rounded-full pl-3 pr-1 py-1 text-[12.5px]">
                Move it to # {boards.find((b) => b.id === boardSuggestion)?.name}?
                <button
                  onClick={() => {
                    setBoardId(boardSuggestion);
                    commit({ boardId: boardSuggestion, columnId: null });
                    setMovedTo(boards.find((b) => b.id === boardSuggestion)?.name ?? "");
                    setBoardSuggestion(null);
                  }}
                  className="bg-white rounded-full px-2.5 py-0.5 font-medium hover:bg-btn"
                >
                  Move
                </button>
                <button onClick={() => setBoardSuggestion(null)} aria-label="Keep it here" className="text-muted hover:text-ink px-1">
                  <X size={12} />
                </button>
              </span>
            )}

            <ChecklistPicker checklist={checklist} onChange={changeChecklist} />

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
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
                >
                  {p}
                  {p === priority && <Check size={14} strokeWidth={2} />}
                </button>
              ))}
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

          {autoNote && (
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-[#E8F6EE] px-3.5 py-2 text-[13px]">
              {autoNote}
              <button onClick={() => setAutoNote(null)} aria-label="Dismiss" className="ml-auto text-muted hover:text-ink">
                <X size={13} />
              </button>
            </div>
          )}
          {checklist && <ChecklistPanel checklist={checklist} onChange={changeChecklist} matter={matter ? { id: matter.id, label: matter.matterNumber ?? matter.title } : null} />}

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
                      <span className="w-7 h-7 rounded-full bg-card-alt border border-line text-muted flex items-center justify-center text-[11px] font-medium flex-shrink-0">
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
                className="w-8 h-8 rounded-full bg-chip flex items-center justify-center text-muted hover:text-ink transition-colors"
              >
                <ArrowUp size={14} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        )}

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
  if (!entries.length) return <div className="text-[13.5px] text-muted py-2">No time logged yet. Time is recorded automatically while this task is open.</div>;
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

function TimerBar({
  clock,
  autoOn,
  loggedMinutes,
  onPause,
  onDiscard,
  onToggleAuto,
  format,
}: {
  clock: { active: boolean; running: boolean; ms: number };
  autoOn: boolean;
  loggedMinutes: number;
  onPause: () => void;
  onDiscard: () => void;
  onToggleAuto: () => void;
  format: (s: number) => string;
}) {
  const seconds = Math.floor(clock.ms / 1000);
  const state = !clock.active ? "Timer off" : clock.running ? "Recording time" : "Paused";
  return (
    <div className="mx-7 mt-2 flex flex-wrap items-center gap-3 rounded-2xl bg-card-alt px-4 py-2.5">
      <span className="flex items-center gap-2 text-[13.5px] font-medium">
        <span
          className={`w-2 h-2 rounded-full ${clock.active && clock.running ? "bg-[#2F9E5A] animate-pulse" : "bg-btn-ring"}`}
          aria-hidden
        />
        {state}
      </span>
      <span className={`mono text-[15px] ${clock.active ? "text-ink font-semibold" : "text-muted"}`} aria-live="off">
        {format(seconds)}
      </span>
      <button
        onClick={onPause}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-medium bg-btn text-ink hover:bg-btn-hover transition-colors"
      >
        {clock.active && clock.running ? <Pause size={12} strokeWidth={2} /> : <Play size={12} strokeWidth={2} />}
        {!clock.active ? "Start" : clock.running ? "Pause" : "Resume"}
      </button>
      {clock.active && (
        <button
          onClick={onDiscard}
          title="Throw away this time (nothing is recorded)"
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-medium text-muted hover:text-ink hover:bg-btn transition-colors"
        >
          <Trash2 size={12} strokeWidth={1.75} />
          Don&apos;t record
        </button>
      )}
      <span className="ml-auto flex items-center gap-4 text-[13px] text-muted">
        <span>
          Logged on this task: <span className="text-ink font-medium">{formatMinutes(loggedMinutes)}</span>
        </span>
        <button
          onClick={onToggleAuto}
          role="switch"
          aria-checked={autoOn}
          title="Start the timer automatically when a task is opened"
          className="flex items-center gap-2 hover:text-ink"
        >
          Auto-start
          <span className={`relative w-8 h-[18px] rounded-full transition-colors ${autoOn ? "bg-ink" : "bg-btn-ring"}`}>
            <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${autoOn ? "left-[16px]" : "left-[2px]"}`} />
          </span>
        </button>
      </span>
      {clock.active && clock.ms < MIN_SAVE_MS && (
        <span className="basis-full text-[12px] text-muted">Saved to your timesheet when you close the task (quick looks under 30 seconds aren&apos;t recorded).</span>
      )}
    </div>
  );
}
