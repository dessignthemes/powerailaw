"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ScrollHint from "@/components/ScrollHint";
import PriorityDot from "@/components/PriorityDot";
import Link from "next/link";
import TaskFilterDropdown from "@/components/TaskFilterDropdown";
import TaskDetailModal from "@/components/TaskDetailModal";
import { BoardTask, priorityMeta, statusMeta } from "@/components/NewTaskModal";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import MemberAvatar from "@/components/MemberAvatar";
import EventDetailModal from "@/components/EventDetailModal";
import { isDueIn, isOverdue, ymd } from "@/lib/taskDates";
import {
  ListChecks,
  Calendar,
  Activity,
  Flag,
  CalendarCheck,
  Circle,
  CheckCircle2,
  ArrowUpRight,
  UserPlus,
  FolderPlus,
} from "lucide-react";

const rangeTabs = [
  { key: "today", label: "Today", due: "Due today" },
  { key: "week", label: "Week", due: "Due this week" },
  { key: "month", label: "Month", due: "Due this month" },
] as const;

type RangeKey = (typeof rangeTabs)[number]["key"];

function formatDue(dueDate: string) {
  const [y, m, d] = dueDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
const PRIORITIES = ["High", "Medium", "Low"] as const;

export default function DashboardHome() {
  const [range, setRange] = useState<RangeKey>("today");
  const [bottomTab, setBottomTab] = useState<"tasks" | "events">("tasks");
  // The scrolling lists in the top cards (for the "Scroll for N more" hint).
  const boardsList = useRef<HTMLDivElement>(null);
  const eventsList = useRef<HTMLDivElement>(null);
  // Clicking a priority on the "By priority" card shows only those tasks below.
  const [priorityFilter, setPriorityFilter] = useState<(typeof PRIORITIES)[number] | null>(null);

  // Greeting follows the user's own clock (set in the browser, refreshed every minute).
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    const update = () => {
      const h = new Date().getHours();
      setGreeting(h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
    };
    const first = setTimeout(update, 0);
    const timer = setInterval(update, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const activeRange = rangeTabs.find((r) => r.key === range)!;

  // Real calendar events (Outlook / Google) for the selected period.
  type DashEvent = { id: string; provider: "google" | "microsoft"; title: string; start: string; end: string; allDay: boolean; location: string | null; link: string | null };
  const [calAll, setCal] = useState<{ events: DashEvent[]; connected: boolean; loaded: boolean }>({ events: [], connected: true, loaded: false });
  // Calendar periods for events: today, the whole week (Mon–Sun), the whole month.
  const periods = useMemo(() => {
    const t = new Date();
    const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return {
      today: [today, tomorrow] as const,
      week: [monday, nextMonday] as const,
      month: [new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 1)] as const,
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    // One request covering the week and the month, so each count can be shown.
    const from = periods.week[0] < periods.month[0] ? periods.week[0] : periods.month[0];
    const to = periods.week[1] > periods.month[1] ? periods.week[1] : periods.month[1];
    fetch(`/api/calendar/events?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })}`)
      .then((r) => (r.ok ? r.json() : { events: [], sources: [] }))
      .then((d: { events?: DashEvent[]; sources?: { status: string }[] }) => {
        if (cancelled) return;
        setCal({ events: d.events ?? [], connected: (d.sources ?? []).length > 0, loaded: true });
      })
      .catch(() => !cancelled && setCal({ events: [], connected: true, loaded: true }));
    return () => {
      cancelled = true;
    };
  }, [periods]);
  const eventsIn = (key: "today" | "week" | "month") => {
    const [a, b] = periods[key];
    return calAll.events.filter((e) => {
      const s0 = e.allDay ? new Date(`${e.start}T00:00:00`) : new Date(e.start);
      const e0 = e.allDay ? new Date(`${e.end}T00:00:00`) : new Date(e.end);
      return s0 < b && (e0 > a || (e0.getTime() === s0.getTime() && s0 >= a));
    });
  };
  const periodKey = range === "today" ? "today" : range === "week" ? "week" : "month";
  // Events for the selected tab (used by the card and the Events list).
  const cal = { ...calAll, events: eventsIn(periodKey) };
  const [openEvent, setOpenEvent] = useState<DashEvent | null>(null);

  const eventStart = (e: DashEvent) => (e.allDay ? new Date(`${e.start}T00:00:00`) : new Date(e.start));
  const fmtTime = (e: DashEvent) =>
    e.allDay ? "All day" : eventStart(e).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase();

  const { tasks, tasksLoaded, updateTask, boards, generalName } = useWorkspaceData();
  const boardName = (id: string | null | undefined) => (id ? boards.find((b) => b.id === id)?.name ?? "Board" : generalName);
  const [selectedTask, setSelectedTask] = useState<BoardTask | null>(null);

  const { dueTasks, undatedTasks, openCount, recent } = useMemo(() => {
    const open = tasks.filter((t) => t.status !== "done");
    // Most important first: High → Medium → Low, then the oldest due date.
    const due = tasks
      .filter((t) => isDueIn(t, range))
      .sort((a, z) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[z.priority] || (a.dueDate! < z.dueDate! ? -1 : a.dueDate! > z.dueDate! ? 1 : 0));
    const undated = open.filter((t) => !t.dueDate);
    const rec = [...tasks]
      .filter((t) => t.updatedAt || t.createdAt)
      .sort((a, z) => ((z.updatedAt ?? z.createdAt)! > (a.updatedAt ?? a.createdAt)! ? 1 : -1))
      .slice(0, 8);
    return { dueTasks: due, undatedTasks: undated, openCount: open.length, recent: rec };
  }, [tasks, range]);

  const todayStr = ymd(new Date());

  function toggleDone(t: BoardTask) {
    updateTask({ ...t, status: t.status === "done" ? "todo" : "done" });
  }

  function renderTaskRow(t: BoardTask) {
    const overdue = t.dueDate && t.dueDate < todayStr;
    const done = t.status === "done";
    return (
      <div
        key={t.id}
        onClick={() => setSelectedTask(t)}
        className="flex items-center justify-between gap-3 px-5 py-3.5 cursor-pointer hover:bg-chip/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleDone(t);
            }}
            className="text-muted hover:text-green-600 transition-colors flex-shrink-0"
            aria-label={done ? "Mark as not done" : "Mark as done"}
          >
            {done ? (
              <CheckCircle2 size={17} strokeWidth={1.75} className="text-green-600" />
            ) : (
              <Circle size={17} strokeWidth={1.75} />
            )}
          </button>
          <span className={`text-[14.5px] font-medium truncate ${done ? "line-through text-muted" : ""}`}>
            {t.title}
          </span>
          <span className="text-[12px] text-muted flex-shrink-0">{statusMeta[t.status].label}</span>
          <span className="text-[11.5px] text-muted bg-card-alt rounded-md px-1.5 py-0.5 truncate max-w-[160px] hidden sm:inline">
            {boardName(t.boardId)}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {t.dueDate && (
            <span className={`mono text-[12px] ${overdue ? "text-red-600" : "text-muted"}`}>
              {overdue ? "Overdue · " : ""}
              {formatDue(t.dueDate)}
            </span>
          )}
          <PriorityDot priority={t.priority} />
          <MemberAvatar userId={t.createdBy} />
        </div>
      </div>
    );
  }

  return (
    <div className="px-10 py-10">
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="text-[32px] font-semibold mb-1">
            <span className={greeting ? "" : "invisible"}>{greeting ?? "Good morning"}</span>
          </h1>
          <div className="text-[14.5px] text-muted">{today}</div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/client-intake"
            className="flex items-center gap-2 bg-btn hover:bg-btn-hover transition-colors px-3.5 py-2 rounded-full text-[13.5px] font-medium"
          >
            <UserPlus size={14} strokeWidth={1.75} /> Client Intake
          </Link>
          <Link
            href="/dashboard/matters"
            className="flex items-center gap-2 bg-btn hover:bg-btn-hover transition-colors px-3.5 py-2 rounded-full text-[13.5px] font-medium"
          >
            <FolderPlus size={14} strokeWidth={1.75} /> Add Matter
          </Link>
          <TaskFilterDropdown />
        </div>
      </div>

      <div className="flex gap-6 mb-8 text-[14px] font-medium text-muted border-b border-line">
        {rangeTabs.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`pb-3 flex items-center gap-1.5 transition-colors ${
              range === r.key
                ? "text-ink border-b-2 border-ink font-semibold"
                : "hover:text-ink"
            }`}
          >
            <Calendar size={15} strokeWidth={range === r.key ? 2 : 1.75} />
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-card-alt rounded-2xl p-6 relative">
          <div className="text-[13.5px] font-medium text-muted mb-4 flex items-center gap-1.5">
            <ListChecks size={15} strokeWidth={1.75} /> {activeRange.due}
          </div>
          <Link
            href={`/dashboard/task-board?due=${range}`}
            className="group/all absolute top-5 right-5 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium text-ink bg-[#E8EFF7] hover:bg-[#DCE4F0] transition-colors"
          >
            View all tasks
            <span className="flex items-center">
              <ArrowUpRight size={12} strokeWidth={2} />
            </span>
          </Link>
          <div className="text-[24px] leading-tight font-display font-semibold mb-1">
            {tasksLoaded ? dueTasks.length : "–"} {dueTasks.length === 1 ? "task" : "tasks"} {activeRange.due.toLowerCase()}
          </div>
          <div className="text-[13px] text-muted">
            {openCount} open in total · {undatedTasks.length} with no due date
          </div>
          {/* Per-board breakdown: each line opens that board, filtered to the same range. */}
          {(() => {
            const counts = new Map<string, number>();
            for (const t of dueTasks) {
              const key = t.boardId ?? "general";
              counts.set(key, (counts.get(key) ?? 0) + 1);
            }
            const rows = [...counts.entries()].sort((x, y) => y[1] - x[1]);
            if (!rows.length) return null;
            return (
              // Three rows show; more scroll inside the box (scrollbar on hover).
              <>
              <div ref={boardsList} className={`mt-4 flex flex-col gap-1.5 ${rows.length > 3 ? "max-h-[120px] scroll-on-hover pr-2" : ""}`}>
                {rows.map(([key, n]) => (
                  <Link
                    key={key}
                    href={`/dashboard/task-board?board=${key}&due=${range}`}
                    className="group/row flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-[13.5px] font-medium bg-[#CCD7EA] hover:bg-[#BFCCE3] transition-colors"
                  >
                    <span className="font-semibold tabular-nums w-5 text-right">{n}</span>
                    <span className="truncate flex-1">{key === "general" ? generalName : boardName(key)}</span>
                    <span className="text-muted group-hover/row:text-ink">→</span>
                  </Link>
                ))}
              </div>
              <ScrollHint list={boardsList} total={rows.length} />
              </>
            );
          })()}
        </div>

        <div className="bg-card-alt rounded-2xl p-6 relative">
          <div className="text-[13.5px] font-medium text-muted mb-4 flex items-center gap-1.5">
            <Flag size={15} strokeWidth={1.75} /> {activeRange.due} by priority
          </div>
          {priorityFilter && (
            <button
              onClick={() => setPriorityFilter(null)}
              className="absolute top-5 right-5 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium text-ink bg-[#E8EFF7] hover:bg-[#DCE4F0] transition-colors"
            >
              Show all
            </button>
          )}
          {(() => {
            const n = (p: string) => dueTasks.filter((t) => t.priority === p).length;
            const high = n("High");
            return (
              <>
                <div className="text-[24px] leading-tight font-display font-semibold mb-1">
                  {tasksLoaded ? dueTasks.length : "–"} {dueTasks.length === 1 ? "task" : "tasks"} by priority
                </div>
                <div className="text-[13px] text-muted">
                  {(() => {
                    const late = high > 0 ? dueTasks.filter((t) => isOverdue(t) && t.priority === "High").length : 0;
                    return late ? `${late} high priority overdue` : "No high priority overdue";
                  })()}
                </div>
                <div className="mt-4 flex flex-col gap-1.5">
                  {PRIORITIES.map((p) => {
                    const count = n(p);
                    const active = priorityFilter === p;
                    return (
                      <button
                        key={p}
                        onClick={() => {
                          setPriorityFilter(active ? null : p);
                          setBottomTab("tasks");
                        }}
                        disabled={!count && !active}
                        style={{ backgroundColor: priorityMeta[p].bg, color: priorityMeta[p].text }}
                        className={`group/row flex items-center gap-2 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-[filter,box-shadow] hover:brightness-95 disabled:opacity-45 disabled:hover:brightness-100 ${
                          active ? "ring-2 ring-offset-1 ring-[#1b191a]/40" : ""
                        }`}
                        title={count ? `Show only ${p.toLowerCase()} priority tasks below` : undefined}
                      >
                        <span className="font-semibold tabular-nums w-5 text-right">{tasksLoaded ? count : "–"}</span>
                        <span className="truncate flex-1 text-left">{p}</span>
                        <span className="opacity-70 group-hover/row:opacity-100">→</span>
                      </button>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>

        <div className="bg-card-alt rounded-2xl p-6 relative">
          <div className="text-[13.5px] font-medium text-muted mb-4 flex items-center gap-1.5">
            <Calendar size={15} strokeWidth={1.75} /> Calendar
          </div>
          <Link
            href="/dashboard/calendar"
            className="group/cal absolute top-5 right-5 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium text-ink bg-[#E8EFF7] hover:bg-[#DCE4F0] transition-colors"
          >
            Open calendar
            <span className="flex items-center">
              <ArrowUpRight size={12} strokeWidth={2} />
            </span>
          </Link>
          <div className="text-[24px] leading-tight font-display font-semibold mb-1">
            {cal.loaded ? cal.events.length : "–"} {cal.events.length === 1 ? "event" : "events"}
          </div>
          <div className="text-[13px] text-muted flex flex-wrap gap-x-1">
            {!cal.loaded ? (
              "Loading your calendar…"
            ) : !cal.connected ? (
              <Link href="/dashboard/calendar" className="underline underline-offset-2 hover:text-ink">
                Connect Outlook or Google Calendar
              </Link>
            ) : (
              (["today", "week", "month"] as const)
                .filter((k) => k !== periodKey)
                .map((k) => {
                  const n = eventsIn(k).length;
                  return (
                    <span key={k} className="after:content-['·'] after:ml-1 last:after:content-none">
                      <span className="text-ink font-medium">{n}</span> {k === "today" ? "today" : `this ${k}`}
                    </span>
                  );
                })
            )}
          </div>
          {/* The events themselves, with their times (click one to open it). */}
          {cal.loaded && cal.connected && cal.events.length > 0 && (
            <>
            <div ref={eventsList} className={`mt-4 flex flex-col gap-1.5 ${cal.events.length > 3 ? "max-h-[120px] scroll-on-hover pr-2" : ""}`}>
              {cal.events.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setOpenEvent(e)}
                  className="flex-shrink-0 w-full text-left flex items-center gap-2 bg-[#CCD7EA] hover:bg-[#BFCCE3] rounded-xl px-3 py-2 text-[13.5px] transition-colors"
                >
                  <span className="mono text-[12px] text-muted w-[54px] flex-shrink-0">{range === "today" ? fmtTime(e) : eventStart(e).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  <span className="font-medium truncate">{e.title}</span>
                </button>
              ))}
            </div>
            <ScrollHint list={eventsList} total={cal.events.length} />
            </>
          )}
        </div>

      </div>

      {/* Tasks / Events on the left, Recent activity on the right (stacked on narrow screens). */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] gap-5 mt-5 items-start">
      <div className="bg-card-alt rounded-2xl p-6 min-w-0">
        <div className="flex gap-6 text-[14px] font-medium text-muted mb-6">
          <button
            onClick={() => setBottomTab("tasks")}
            className={`pb-2 flex items-center gap-1.5 transition-colors ${
              bottomTab === "tasks"
                ? "text-ink border-b-2 border-ink font-semibold"
                : "hover:text-ink"
            }`}
          >
            <ListChecks size={15} strokeWidth={bottomTab === "tasks" ? 2 : 1.75} /> Tasks
          </button>
          <button
            onClick={() => setBottomTab("events")}
            className={`pb-2 flex items-center gap-1.5 transition-colors ${
              bottomTab === "events"
                ? "text-ink border-b-2 border-ink font-semibold"
                : "hover:text-ink"
            }`}
          >
            <Calendar size={15} strokeWidth={bottomTab === "events" ? 2 : 1.75} /> Events
          </button>
        </div>
        {bottomTab === "events" && cal.events.length > 0 ? (
          <div className="bg-cream rounded-xl py-2">
            {(() => {
              const byDay = new Map<string, DashEvent[]>();
              for (const e of cal.events) {
                const key = eventStart(e).toDateString();
                byDay.set(key, [...(byDay.get(key) ?? []), e]);
              }
              return [...byDay.entries()].map(([day, list]) => (
                <div key={day}>
                  <div className="px-5 pt-3 pb-1 mono text-[11px] uppercase tracking-wider text-muted">
                    {new Date(day).toDateString() === new Date().toDateString()
                      ? "Today"
                      : new Date(day).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  </div>
                  <div className="divide-y divide-line">
                    {list.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => setOpenEvent(e)}
                        className="w-full text-left flex items-center gap-4 px-5 py-3 hover:bg-chip/60 transition-colors"
                      >
                        <span className="mono text-[12.5px] text-muted w-16 flex-shrink-0">{fmtTime(e)}</span>
                        <span className="text-[14.5px] font-medium truncate flex-1">{e.title}</span>
                        {e.location && <span className="text-[12.5px] text-muted truncate max-w-[200px] hidden sm:inline">{e.location}</span>}
                        <span className="text-[11.5px] text-muted bg-card-alt rounded-md px-1.5 py-0.5 flex-shrink-0">
                          {e.provider === "microsoft" ? "Outlook" : "Google"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ));
            })()}
            <div className="px-5 pt-4 pb-2">
              <Link href="/dashboard/calendar" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink transition-colors">
                Open calendar <ArrowUpRight size={13} strokeWidth={1.75} />
              </Link>
            </div>
          </div>
        ) : bottomTab === "tasks" && (dueTasks.length > 0 || undatedTasks.length > 0) ? (
          <div className="bg-cream rounded-xl min-h-[520px] py-2">
            {dueTasks.length > 0 && (
              <>
                <div className="px-5 pt-3 pb-1 flex items-center justify-between">
                  <span className="mono text-[11px] uppercase tracking-wider text-muted">{activeRange.due}</span>
                  <Link
                    href={`/dashboard/task-board?due=${range}`}
                    className="text-[12.5px] font-medium text-muted hover:text-ink transition-colors"
                  >
                    View all {dueTasks.length} →
                  </Link>
                </div>
                {priorityFilter && (
                  <div className="px-5 pb-1 flex items-center gap-2 text-[12.5px] text-muted">
                    Showing{" "}
                    <span className="font-medium rounded-md px-1.5 py-0.5" style={{ backgroundColor: priorityMeta[priorityFilter].bg, color: priorityMeta[priorityFilter].text }}>
                      {priorityFilter}
                    </span>{" "}
                    priority only ·
                    <button onClick={() => setPriorityFilter(null)} className="underline underline-offset-2 hover:text-ink">
                      show all
                    </button>
                  </div>
                )}
                <div className="divide-y divide-line">
                  {(priorityFilter ? dueTasks.filter((t) => t.priority === priorityFilter) : dueTasks).map(renderTaskRow)}
                </div>
              </>
            )}
            {dueTasks.length === 0 && (
              <div className="px-5 py-6 text-[14px] text-muted">
                Nothing due {range === "today" ? "today" : range === "week" ? "this week" : "this month"}.
              </div>
            )}
            {undatedTasks.length > 0 && (
              <>
                <div className="px-5 pt-5 pb-1 mono text-[11px] uppercase tracking-wider text-muted">
                  No due date
                </div>
                <div className="divide-y divide-line">
                  {undatedTasks.map(renderTaskRow)}
                </div>
              </>
            )}
            <div className="px-5 pt-5 pb-3">
              <Link
                href="/dashboard/task-board"
                className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink transition-colors"
              >
                Open task board <ArrowUpRight size={13} strokeWidth={1.75} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-cream rounded-xl flex flex-col items-center justify-center min-h-[520px] text-center">
            <div className="w-8 h-8 rounded-md border border-line flex items-center justify-center text-muted mb-3">
              <CalendarCheck size={16} strokeWidth={1.75} />
            </div>
            <div className="text-[15px] font-medium">
              {bottomTab === "tasks" && !tasksLoaded
                ? "Loading tasks…"
                : bottomTab === "events" && !cal.loaded
                  ? "Loading events…"
                : `${bottomTab === "tasks" ? "Nothing due" : "Nothing scheduled"} ${
                    range === "today" ? "today" : range === "week" ? "this week" : "this month"
                  }`}
            </div>
          </div>
        )}
      </div>

      <div className="bg-card-alt rounded-2xl p-6 min-w-0">
        <div className="text-[14px] font-medium text-ink mb-6 flex items-center gap-1.5">
          <Activity size={15} strokeWidth={1.75} /> Recent activity
        </div>
        {recent.length === 0 ? (
          <div className="bg-cream rounded-xl flex flex-col items-center justify-center min-h-[240px] text-center">
            <Activity size={20} strokeWidth={1.5} className="text-muted mb-3" />
            <div className="text-[15px] font-medium text-muted">No activity yet</div>
          </div>
        ) : (
          <div className="bg-cream rounded-xl divide-y divide-line">
            {recent.map((t) => {
              const created =
                !t.updatedAt || !t.createdAt || Math.abs(new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()) < 2000;
              const verb = created ? "Created" : t.status === "done" ? "Completed" : "Updated";
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTask(t)}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 cursor-pointer hover:bg-chip/40 transition-colors"
                >
                  <div className="text-[14px] truncate">
                    <span className="text-muted">{verb} task</span>{" "}
                    <span className="font-medium">{t.title}</span>
                  </div>
                  <span className="flex items-center gap-3 flex-shrink-0">
                    <span className="mono text-[12px] text-muted">{timeAgo((t.updatedAt ?? t.createdAt)!)}</span>
                    <MemberAvatar userId={created ? t.createdBy : t.updatedBy ?? t.createdBy} label={created ? "Created by" : `${verb} by`} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={(updated) => {
            updateTask(updated);
            setSelectedTask(updated);
          }}
        />
      )}
      {openEvent && (
        <EventDetailModal
          event={openEvent}
          onClose={() => setOpenEvent(null)}
          onDeleted={(id) => setCal((c) => ({ ...c, events: c.events.filter((x) => x.id !== id) }))}
          onUpdated={(ev) => setCal((c) => ({ ...c, events: c.events.map((x) => (x.id === ev.id ? { ...x, ...ev } : x)) }))}
        />
      )}
    </div>
  );
}
