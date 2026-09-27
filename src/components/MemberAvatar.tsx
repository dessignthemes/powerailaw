"use client";

import { useRouter } from "next/navigation";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import { initialsFor, displayName } from "@/lib/initials";

// Black circle with a workspace member's initials. Hover shows who it is;
// click opens the Task Board filtered to the tasks they created.
export default function MemberAvatar({ userId, size = 26, label = "Created by" }: { userId: string | null | undefined; size?: number; label?: string }) {
  const router = useRouter();
  const { teamMembers } = useWorkspaceData();
  if (!userId) return null;
  const m = teamMembers.find((x) => x.id === userId);
  const initials = m ? initialsFor(m.fullName, m.email) : "?";
  const name = m ? displayName(m.fullName, m.email) : "Former member";

  return (
    <span className="relative group/avatar flex-shrink-0">
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (m) router.push(`/dashboard/task-board?by=${m.id}`);
        }}
        aria-label={`${label} ${name}${m ? `, ${m.email}` : ""}. View their tasks`}
        className={`rounded-full flex items-center justify-center font-semibold tracking-tight transition-transform hover:scale-105 ${
          m ? "bg-dark text-white" : "bg-line text-muted cursor-default"
        }`}
        style={{ width: size, height: size, fontSize: size <= 24 ? 10 : 11 }}
      >
        {initials}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 bottom-[calc(100%+6px)] z-50 hidden group-hover/avatar:block group-focus-within/avatar:block whitespace-nowrap rounded-xl bg-dark text-white px-3 py-2 text-left shadow-lg"
      >
        <span className="block text-[11px] text-white/60">{label}</span>
        <span className="block text-[12.5px] font-semibold">{name}</span>
        {m && m.fullName && <span className="block text-[12px] text-white/80">{m.email}</span>}
        {m && <span className="block text-[11.5px] text-white/60 mt-1">Click to view their tasks →</span>}
      </span>
    </span>
  );
}
