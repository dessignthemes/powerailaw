"use client";

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
  CalendarDays,
  Search,
} from "lucide-react";

export type TaskStatus = "todo" | "inprogress" | "waiting" | "done";
export type TaskPriority = "Low" | "Medium" | "High";

export type BoardTask = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string | null;
  dueDate: string | null;
};

export const priorityMeta: Record<TaskPriority, { bg: string; text: string }> = {
  Low: { bg: "#EAE8E0", text: "#6B675F" },
  Medium: { bg: "#F5E3B3", text: "#8A6D1D" },
  High: { bg: "#F6C9C0", text: "#9C3A24" },
};

export const statusMeta: Record<TaskStatus, { label: string; icon: typeof Circle; color: string }> = {
  todo: { label: "To do", icon: Circle, color: "text-muted" },
  inprogress: { label: "In progress", icon: CircleDot, color: "text-amber-500" },
  waiting: { label: "Waiting", icon: Clock, color: "text-blue-500" },
  done: { label: "Done", icon: CheckCircle2, color: "text-green-600" },
};

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
        className="flex items-center gap-1.5 bg-card-alt hover:bg-line/50 transition-colors px-3 py-1.5 rounded-full text-[13px] font-medium"
      >
        {trigger}
        <ChevronDown size={12} strokeWidth={1.75} className="text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
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

export default function NewTaskModal({
  defaultStatus,
  onClose,
  onCreate,
}: {
  defaultStatus: TaskStatus;
  onClose: () => void;
  onCreate: (task: BoardTask) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);

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
      assignee,
      dueDate,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="bg-cream rounded-3xl w-full max-w-[620px] max-h-[90vh] overflow-y-auto">
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
            <div className="p-1.5">
              <div className="relative mb-1.5">
                <Search
                  size={13}
                  strokeWidth={1.75}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  placeholder="Search people..."
                  className="w-full bg-card-alt rounded-lg pl-8 pr-3 py-2 text-[13.5px] outline-none placeholder:text-muted"
                />
              </div>
            </div>
            <button
              onClick={() => {
                setAssignee(null);
                setAssigneeOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors text-muted"
            >
              Unassigned
            </button>
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Members
            </div>
            <button
              onClick={() => {
                setAssignee("marios@dessign.co");
                setAssigneeOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-dark text-white flex items-center justify-center text-[11px]">
                M
              </span>
              marios@dessign.co
            </button>
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
            className="bg-dark text-white px-5 py-2.5 rounded-full text-[14px] font-medium hover:bg-dark2 transition-colors"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
