"use client";

import { useState } from "react";
import { Search, Check } from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";

// Assignee choices = the people in this workspace.
export default function AssigneeOptions({ value, onPick }: { value: string | null; onPick: (email: string | null) => void }) {
  const { teamMembers, meEmail } = useWorkspaceData();
  const [q, setQ] = useState("");
  const list = teamMembers.filter((m) => !q.trim() || m.email.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <div className="p-1.5">
        <div className="relative mb-1.5">
          <Search size={13} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people..."
            className="w-full bg-card-alt rounded-lg pl-8 pr-3 py-2 text-[13.5px] outline-none placeholder:text-muted"
          />
        </div>
      </div>
      <button
        onClick={() => onPick(null)}
        className="w-full text-left px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors text-muted"
      >
        Unassigned
      </button>
      <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Members</div>
      {list.map((m) => (
        <button
          key={m.id}
          onClick={() => onPick(m.email)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
        >
          <span className="w-6 h-6 rounded-full bg-dark text-white flex items-center justify-center text-[11px] flex-shrink-0">
            {m.email.charAt(0).toUpperCase()}
          </span>
          <span className="truncate flex-1 text-left">
            {m.email}
            {m.email === meEmail && <span className="text-muted font-normal"> (you)</span>}
          </span>
          {value === m.email && <Check size={14} />}
        </button>
      ))}
      {list.length === 0 && <div className="px-3 py-2 text-[13px] text-muted">No matching people</div>}
    </>
  );
}
