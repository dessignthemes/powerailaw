"use client";

import { useState } from "react";
import {
  X,
  Maximize2,
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
  Search,
  Play,
  Plus,
  ArrowUp,
} from "lucide-react";
import {
  BoardTask,
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
  const [timerRunning, setTimerRunning] = useState(false);

  const StatusIcon = statusMeta[status].icon;

  function commit(patch: Partial<BoardTask>) {
    onUpdate({ ...task, title, description, status, priority, assignee, dueDate, ...patch });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8">
      <div className="bg-cream rounded-3xl w-full max-w-[860px] max-h-[92vh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-7 pt-6 pb-2">
          <div className="flex items-center gap-2 text-[13.5px] text-muted font-medium">
            <span className="bg-card-alt px-2.5 py-1 rounded-full">Task board</span>
            <span>›</span>
            <span className="text-ink font-semibold truncate max-w-[240px]">{title}</span>
          </div>
          <div className="flex items-center gap-3 text-muted">
            <button className="hover:text-ink transition-colors">
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
            rows={3}
            className="w-full bg-transparent outline-none text-[14.5px] placeholder:text-muted resize-none mb-6"
          />

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
                  commit({ assignee: null });
                  setAssigneeOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors text-muted"
              >
                Unassigned
              </button>
              <button
                onClick={() => {
                  setAssignee("marios@dessign.co");
                  commit({ assignee: "marios@dessign.co" });
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

          <div className="min-h-[140px] mb-4">
            {tab === "Comments" && (
              <div className="text-[14px] text-muted text-center py-6">
                No comments yet — start the conversation.
              </div>
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
                placeholder="Write a comment..."
                className="flex-1 outline-none text-[14px] placeholder:text-muted bg-transparent"
              />
              <button className="w-8 h-8 rounded-full bg-card-alt flex items-center justify-center text-muted hover:text-ink transition-colors">
                <ArrowUp size={14} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-7 py-4 border-t border-line">
          <button
            onClick={() => setTimerRunning((r) => !r)}
            className="flex items-center gap-1.5 text-[13.5px] font-medium text-muted hover:text-ink transition-colors"
          >
            <Play size={14} strokeWidth={1.75} fill={timerRunning ? "currentColor" : "none"} />
            {timerRunning ? "Timer running" : "Start timer"}
          </button>
          <span className="text-[13px] text-muted mono">0m</span>
        </div>
      </div>
    </div>
  );
}
