"use client";

import { useEffect, useRef, useState } from "react";
import { Users, Check, ChevronDown } from "lucide-react";

// Whose tasks the dashboard shows: "me" (default), "all", or a team member's email.
export type TaskScope = "me" | "all" | string;

export function scopeLabel(scope: TaskScope, members: { email: string; fullName?: string | null }[]) {
  if (scope === "me") return "My tasks";
  if (scope === "all") return "Everyone's tasks";
  const m = members.find((x) => x.email.toLowerCase() === scope.toLowerCase());
  return `${m?.fullName || m?.email || scope}'s tasks`;
}

export default function TaskFilterDropdown({
  value,
  onChange,
  members,
  meEmail,
}: {
  value: TaskScope;
  onChange: (s: TaskScope) => void;
  members: { email: string; fullName?: string | null }[];
  meEmail: string | null;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const others = members.filter((m) => m.email.toLowerCase() !== (meEmail ?? "").toLowerCase());
  const item = (key: TaskScope, label: string) => (
    <button
      key={key}
      onClick={() => {
        onChange(key);
        setOpen(false);
      }}
      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium text-left transition-colors ${
        value === key ? "bg-chip" : "hover:bg-chip"
      }`}
    >
      <span className="truncate">{label}</span>
      {value === key && <Check size={14} strokeWidth={2} className="flex-shrink-0" />}
    </button>
  );

  return (
    <div className="relative inline-block" ref={box}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 bg-btn hover:bg-btn-hover transition-colors px-3.5 py-2 rounded-full text-[13.5px] font-medium"
      >
        <Users size={14} strokeWidth={1.75} />
        View Team Tasks
        <ChevronDown size={13} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[260px] max-h-[420px] overflow-y-auto flex flex-col gap-[3px]">
          {item("me", "My tasks")}
          {item("all", "View all tasks")}
          {others.length > 0 && <div className="px-3 pt-2.5 pb-1 text-[11.5px] font-semibold text-muted border-t border-line mt-1">Team members</div>}
          {others.map((m) => item(m.email, m.fullName || m.email))}
        </div>
      )}
    </div>
  );
}
