"use client";

import { useEffect, useMemo, useState } from "react";
import PriorityDot from "@/components/PriorityDot";
import WidgetBoard, { AddWidgetModal } from "@/components/dashboard/widgets/WidgetBoard";
import { useDashboardLayout } from "@/components/dashboard/widgets/useDashboardLayout";
import type { DashData, DashEvent } from "@/components/dashboard/widgets/types";
import TaskFilterDropdown, { scopeLabel, type TaskScope } from "@/components/TaskFilterDropdown";
import TaskDetailModal from "@/components/TaskDetailModal";
import { BoardTask, statusMeta } from "@/components/NewTaskModal";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import MemberAvatar from "@/components/MemberAvatar";
import EventDetailModal from "@/components/EventDetailModal";
import { isDueIn, ymd } from "@/lib/taskDates";
import { Circle, CheckCircle2, LayoutGrid, Plus, RotateCcw } from "lucide-react";

const rangeTabs = [
  { key: "today", label: "Today", due: "Due today" },
  { key: "week", label: "Week", due: "Due this week" },
  { key: "month", label: "Month", due: "Due this month" },
] as const;

type RangeKey = (typeof rangeTabs)[number]["key"];


const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
const PRIORITIES = ["High", "Medium", "Low"] as const;
void PRIORITIES;

export default function DashboardHome() {
  const [range, setRange] = useState<RangeKey>("today");
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
  const periodKey = range;
  // Events for the selected tab (used by the card and the Events list).
  const cal = { ...calAll, events: eventsIn(periodKey) };
  const [openEvent, setOpenEvent] = useState<DashEvent | null>(null);

  const eventStart = (e: DashEvent) => (e.allDay ? new Date(`${e.start}T00:00:00`) : new Date(e.start));
  const fmtTime = (e: DashEvent) =>
    e.allDay ? "All day" : eventStart(e).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase();

  const { tasks: allTasks, tasksLoaded, updateTask, boards, generalName, teamMembers, meEmail, acceptTask } = useWorkspaceData();
  const [acceptNote, setAcceptNote] = useState<string | null>(null);
  const offeredToMe = (t: BoardTask) => !t.assignee && !!meEmail && (t.offeredTo ?? []).some((e) => e.toLowerCase() === meEmail.toLowerCase());
  // Whose tasks: yours by default (assigned to you), everyone's, or one team member's.
  const [scope, setScope] = useState<TaskScope>("me");
  // The pinned view (My tasks, everyone's, or one person's): the Dashboard opens with it. Remembered on this computer, per person.
  const PIN_KEY = `lawpower.dashboard.pinnedView.${(meEmail ?? "").toLowerCase()}`;
  const [pinned, setPinned] = useState<TaskScope>("me");
  useEffect(() => {
    if (!meEmail) return;
    const t = setTimeout(() => {
      try {
        const v = localStorage.getItem(PIN_KEY);
        if (v) {
          setPinned(v);
          setScope(v);
        }
      } catch {
        /* private mode */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [meEmail, PIN_KEY]);
  const pin = (v: TaskScope) => {
    setPinned(v);
    setScope(v);
    try {
      if (v === "me") localStorage.removeItem(PIN_KEY);
      else localStorage.setItem(PIN_KEY, v);
    } catch {
      /* private mode */
    }
  };
  // "Good morning, Piotr"
  const myFirstName = (teamMembers.find((m) => m.email.toLowerCase() === (meEmail ?? "").toLowerCase())?.fullName ?? "").trim().split(/\s+/)[0] ?? "";
  const tasks = useMemo(() => {
    if (scope === "all") return allTasks;
    const who = (scope === "me" ? meEmail ?? "" : scope).toLowerCase();
    // Theirs, plus tasks offered to them that nobody has accepted yet.
    return who
      ? allTasks.filter(
          (t) => (t.assignee ?? "").toLowerCase() === who || (!t.assignee && (t.offeredTo ?? []).some((e) => e.toLowerCase() === who))
        )
      : [];
  }, [allTasks, scope, meEmail]);
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
          {!t.assignee && (t.offeredTo ?? []).length > 0 && (
            <span className="text-[11.5px] font-medium bg-[#FFF1DE] text-[#8A4B14] rounded-md px-1.5 py-0.5 flex-shrink-0">
              {offeredToMe(t) ? "Offered to you" : `Offered to ${(t.offeredTo ?? []).length}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {offeredToMe(t) && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await acceptTask(t.id);
                  setAcceptNote(`You accepted "${t.title}". It's yours now.`);
                } catch (err) {
                  setAcceptNote((err as Error).message);
                }
              }}
              className="bg-btn hover:bg-btn-hover px-3 py-1 rounded-full text-[12.5px] font-medium"
            >
              Accept
            </button>
          )}
          <PriorityDot priority={t.priority} />
          <MemberAvatar userId={t.createdBy} />
        </div>
      </div>
    );
  }

  // ── Widgets ───────────────────────────────────────────────────────────────
  const { layout, setLayout, resetLayout } = useDashboardLayout(meEmail);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const { matters, clients } = useWorkspaceData();
  const d: DashData = {
    range,
    dueLabel: activeRange.due,
    rangeWord: range === "today" ? "today" : range === "week" ? "this week" : "this month",
    tasks,
    allTasks,
    tasksLoaded,
    dueTasks,
    undatedTasks,
    openCount,
    recent,
    todayStr,
    cal,
    eventsIn,
    allEvents: calAll.events,
    matters,
    clients,
    teamMembers,
    meEmail,
    boardName,
    generalName,
    openTask: setSelectedTask,
    openEvent: setOpenEvent,
    toggleDone,
    renderTaskRow,
    priorityFilter,
    setPriorityFilter,
    setScope,
    fmtTime,
    eventStart,
  };

  return (
    <div className="px-10 py-10 pb-28">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <h1 className="text-[32px] font-semibold mb-1">
            <span className={greeting ? "" : "invisible"}>
              {greeting ?? "Good morning"}
              {myFirstName ? `, ${myFirstName}` : ""}
            </span>
          </h1>
          <div className="text-[14.5px] text-muted">
            {today} · <span className="text-ink font-medium">Showing {scopeLabel(scope, teamMembers).replace(/^My tasks$/, "your tasks").replace(/^Everyone's tasks$/, "everyone's tasks")}</span>
            {scope !== "me" && (
              <button onClick={() => setScope("me")} className="ml-2 underline underline-offset-2 hover:text-ink">
                back to mine
              </button>
            )}
          </div>
          {acceptNote && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#EEF3FB] px-3 py-1.5 text-[13px]">
              {acceptNote}
              <button onClick={() => setAcceptNote(null)} aria-label="Dismiss" className="text-muted hover:text-ink">
                ×
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {editing ? (
            <>
              <button
                onClick={() => confirm("Go back to the standard Dashboard layout?") && resetLayout()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13.5px] font-medium text-muted hover:text-ink hover:bg-chip"
              >
                <RotateCcw size={14} /> Reset
              </button>
              <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13.5px] font-medium bg-chip hover:bg-btn">
                <Plus size={14} /> Add widget
              </button>
              <button onClick={() => setEditing(false)} className="px-5 py-2 rounded-full text-[13.5px] font-semibold bg-btn hover:bg-btn-hover">
                Done
              </button>
            </>
          ) : (
            <>
              {/* Today / Week / Month: what "due" and the calendar widgets cover. */}
              <div className="inline-flex items-center bg-chip rounded-full p-1" role="tablist" aria-label="Period">
                {rangeTabs.map((r) => (
                  <button
                    key={r.key}
                    role="tab"
                    aria-selected={range === r.key}
                    onClick={() => setRange(r.key)}
                    className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${range === r.key ? "bg-white shadow-sm text-ink" : "text-muted hover:text-ink"}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13.5px] font-semibold bg-white border border-line hover:bg-chip shadow-[0_1px_2px_rgba(27,25,26,0.06)] transition-colors">
                <Plus size={15} strokeWidth={2} /> Add widget
              </button>
              <button onClick={() => setEditing(true)} title="Move, resize and remove widgets" className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13.5px] font-semibold bg-white border border-line hover:bg-chip shadow-[0_1px_2px_rgba(27,25,26,0.06)] transition-colors">
                <LayoutGrid size={15} strokeWidth={1.75} /> Edit
              </button>
              <TaskFilterDropdown value={scope} onChange={setScope} members={teamMembers} meEmail={meEmail} pinned={pinned} onPin={pin} />
            </>
          )}
        </div>
      </div>

      <WidgetBoard layout={layout} onChange={setLayout} editing={editing} d={d} />

      {editing && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 bg-white border border-line rounded-full pl-5 pr-2 py-2 shadow-[0_12px_32px_-12px_rgba(27,25,26,0.35)]">
          <span className="text-[13px] text-muted">Drag to move. Pick a size under each widget. − removes it.</span>
          <button onClick={() => setAdding(true)} className="text-[13px] font-medium hover:underline underline-offset-2">
            Add widget
          </button>
          <button onClick={() => setEditing(false)} className="px-4 py-1.5 rounded-full text-[13px] font-semibold bg-btn hover:bg-btn-hover">
            Done
          </button>
        </div>
      )}
      {adding && (
        <AddWidgetModal
          layout={layout}
          d={d}
          onClose={() => setAdding(false)}
          onAdd={(id, size) => {
            setLayout([...layout.filter((x) => x.id !== id), { id, size }]);
          }}
          onRemove={(id) => setLayout(layout.filter((x) => x.id !== id))}
        />
      )}

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
