"use client";

import ClickAway from "@/components/ClickAway";
import type { WaitingOn } from "@/lib/tasks/waitingOn";

import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import MatterChip from "@/components/tasks/MatterChip";
import { boardForMatter } from "@/lib/matters/boards";
import { useState } from "react";
import {
  X,
  ChevronDown,
  Check,
  Circle,
  CircleDot,
  Clock,
  CheckCircle2,
  Flag,
  User,
  Folder,
  CalendarDays, Lock, LockOpen, LayoutGrid } from "lucide-react";

export type TaskStatus = "todo" | "inprogress" | "waiting" | "done";
export type TaskPriority = "Low" | "Medium" | "High";

export type BoardTask = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string | null; // the person doing it (the one who accepted, when it was offered)
  // Offered to several people: the first to accept becomes the assignee and it leaves the others' lists.
  offeredTo?: string[];
  instructions?: string; // what the assigner expects ("Call the lender and confirm…")
  assignedBy?: string | null; // email of the person who assigned / offered it
  isPrivate?: boolean; // only the creator and the assignee see it
  dueDate: string | null;
  comments?: TaskComment[];
  boardId?: string | null; // null/undefined = main Task Board
  matterId?: string | null; // the matter this task belongs to, if any
  waitingOn?: WaitingOn | null; // who we're waiting on (client, lender, title company, seller, buyer)
  columnId?: string | null; // a custom column on the board, if any
  position?: number | null; // manual order inside its column (null = order added)
  checklist?: import("@/lib/checklist").TaskChecklist | null; // ticked-off items from applied templates
  createdBy?: string | null; // profile id of the person who created it
  updatedBy?: string | null; // profile id of the person who last changed it
  createdAt?: string;
  updatedAt?: string;
  keyDatesSynced?: boolean; // (from the server) the matter's key dates and its other tasks were updated too
};

export type TaskComment = {
  id: string;
  body: string;
  createdAt: string;
};

// Today's date in the user's local timezone as "YYYY-MM-DD" (the format
// <input type="date"> uses). New tasks default to this unless a date is picked.
export function todayYmd() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// Priority chips: soft colors with black text (far more readable than white).
export const priorityMeta: Record<TaskPriority, { bg: string; text: string }> = {
  // Dark text on all three reads best on these colours.
  Low: { bg: "#00C271", text: "#1B191A" },
  Medium: { bg: "#FFB341", text: "#1B191A" },
  High: { bg: "#FB5D67", text: "#1B191A" },
};

export const statusMeta: Record<TaskStatus, { label: string; icon: typeof Circle; color: string }> = {
  todo: { label: "To do", icon: Circle, color: "text-muted" },
  inprogress: { label: "In progress", icon: CircleDot, color: "text-amber-500" },
  waiting: { label: "Waiting", icon: Clock, color: "text-blue-500" },
  done: { label: "Done", icon: CheckCircle2, color: "text-green-600" },
};

// Private: only the person who creates the task and the person it's assigned to see it.
export function PrivateToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      title={on ? "Private: only you and the assignee can see this task. Click to show it to the whole firm." : "Visible to the whole firm. Click to make it private (only you and the assignee)."}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${on ? "bg-[#1B191A] text-white" : "bg-chip hover:bg-btn text-muted"}`}
    >
      {on ? <Lock size={13} strokeWidth={2} /> : <LockOpen size={13} strokeWidth={1.75} />} Private
    </button>
  );
}

export function GenericDropdown({
  trigger,
  children,
  open,
  setOpen,
  align = "left",
  direction = "down",
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open: boolean;
  setOpen: (v: boolean) => void;
  align?: "left" | "right";
  direction?: "down" | "up";
}) {
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 bg-chip hover:bg-btn transition-colors px-3 py-1.5 rounded-full text-[13px] font-medium"
      >
        {trigger}
        <ChevronDown size={12} strokeWidth={1.75} className="text-muted" />
      </button>
      {open && (
        <>
          <ClickAway onClose={() => setOpen(false)} />
          <div
            className={`absolute ${
              direction === "up" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"
            } ${
              align === "left" ? "left-0" : "right-0"
            } z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 min-w-[180px]`}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}

// matterId + lockMatter: made from a matter's Tasks tab (the matter is fixed).
// initialBoardId: which board it goes on (shown as a choice); picking a matter
// that has its own board (REP, RES…) moves it there unless a board was chosen.
export default function NewTaskModal({
  defaultStatus,
  onClose,
  onCreate,
  matterId: initialMatterId = null,
  lockMatter = false,
  initialBoardId,
}: {
  defaultStatus: TaskStatus;
  onClose: () => void;
  onCreate: (task: BoardTask) => void;
  matterId?: string | null;
  lockMatter?: boolean;
  initialBoardId?: string | null;
}) {
  const { boards, generalName, matters } = useWorkspaceData();
  const [matterId, setMatterId] = useState<string | null>(initialMatterId);
  const [boardId, setBoardId] = useState<string | null>(initialBoardId ?? null);
  const [boardTouched, setBoardTouched] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [isPrivate, setIsPrivate] = useState(false); // only the creator and the assignee see it
  // One person: assigned now. Several: offered to all, the first to accept takes it.
  const [assignees, setAssignees] = useState<string[]>([]);
  const { teamMembers, meEmail } = useWorkspaceData();
  const memberName = (email: string) => {
    const m = teamMembers.find((x) => x.email.toLowerCase() === email.toLowerCase());
    return m?.fullName || email;
  };
  const [dueDate, setDueDate] = useState<string | null>(() => todayYmd());

  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const StatusIcon = statusMeta[status].icon;

  function handleCreate() {
    if (!title.trim()) return;
    onCreate({
      id: crypto.randomUUID(),
      title,
      description,
      status,
      priority,
      assignee: assignees.length === 1 ? assignees[0] : null,
      offeredTo: assignees.length > 1 ? assignees : [],
      assignedBy: assignees.length ? meEmail : null,
      dueDate,
      isPrivate,
      matterId,
      ...(initialBoardId !== undefined ? { boardId } : {}),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-cream rounded-3xl w-full max-w-[620px] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-7 pt-6 pb-2">
          <div className="flex items-center gap-2 text-[13.5px] text-muted font-medium">
            <span className="bg-card-alt px-2.5 py-1 rounded-full">Tasks</span>
            <span>›</span>
            <span className="text-ink font-semibold">New task</span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-7 pt-3 pb-5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            className="w-full bg-transparent outline-none text-[22px] font-medium placeholder:text-muted mb-2"
            autoFocus
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description..."
            rows={2}
            className="w-full bg-transparent outline-none text-[14px] placeholder:text-muted resize-none"
          />
        </div>

        <div className="px-7 pb-6 flex flex-wrap items-center gap-2">
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
            open={assigneeOpen}
            setOpen={setAssigneeOpen}
            trigger={
              <>
                <User size={13} strokeWidth={1.75} />
                {assignees.length === 0 ? "Assignee" : assignees.length === 1 ? memberName(assignees[0]) : `Offer to ${assignees.length} people`}
              </>
            }
          >
            <div className="px-3 pt-1 pb-1.5 text-[11.5px] text-muted max-w-[240px]">Tick one person, or several to offer it: the first to accept takes it.</div>
            <div className="flex flex-col gap-[3px]">
              {teamMembers.map((m) => {
                const on = assignees.includes(m.email);
                return (
                  <button
                    key={m.id}
                    onClick={() => setAssignees((a) => (on ? a.filter((x) => x !== m.email) : [...a, m.email]))}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[14px] text-left ${on ? "bg-chip" : "hover:bg-chip"}`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${on ? "bg-ink border-ink text-white" : "border-line bg-white"}`}>
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="truncate">{m.fullName || m.email}</span>
                  </button>
                );
              })}
            </div>
          </GenericDropdown>
          <MatterChip
            value={matterId}
            locked={lockMatter}
            onChange={(id) => {
              setMatterId(id);
              const m = id ? matters.find((x) => x.id === id) : null;
              const own = m ? boardForMatter(boards, m) : null;
              if (own && !boardTouched) setBoardId(own);
            }}
          />
          {initialBoardId !== undefined && (
            <GenericDropdown
              open={boardOpen}
              setOpen={setBoardOpen}
              trigger={
                <>
                  <LayoutGrid size={13} strokeWidth={1.75} /># {boardId ? boards.find((b) => b.id === boardId)?.name ?? "Board" : generalName}
                </>
              }
            >
              <div className="px-3 pt-1 pb-1.5 text-[11.5px] text-muted">Put it on</div>
              {[{ id: null as string | null, name: generalName }, ...boards.map((b) => ({ id: b.id as string | null, name: b.name }))].map((b) => (
                <button
                  key={b.id ?? "general"}
                  onClick={() => {
                    setBoardId(b.id);
                    setBoardTouched(true);
                    setBoardOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-[14px] font-medium text-left ${b.id === boardId ? "bg-chip" : "hover:bg-chip"}`}
                >
                  # {b.name}
                </button>
              ))}
            </GenericDropdown>
          )}
          <PrivateToggle on={isPrivate} onChange={setIsPrivate} />
          {isPrivate && <span className="text-[12.5px] text-muted">Only you and the assignee can see this task</span>}

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
                  setDueDate(e.target.value || null);
                }}
                className="w-full bg-card-alt rounded-lg px-3 py-2 text-[13.5px] outline-none"
              />
            </div>
          </GenericDropdown>
        </div>

        <div className="flex items-center justify-end px-7 py-5 border-t border-line">
          <button
            onClick={handleCreate}
            className="bg-btn text-ink px-5 py-2.5 rounded-full text-[14px] font-medium hover:bg-btn-hover transition-colors"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
