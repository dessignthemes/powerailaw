"use client";

import { useRouter } from "next/navigation";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import { initialsFor, displayName } from "@/lib/initials";

// Black circle with a workspace member's initials. Hover shows who it is;
// click opens the Task Board filtered to the tasks they created.
export default function MemberAvatar({
  userId,
  size = 26,
  label = "Created by",
  light = false,
}: {
  userId: string | null | undefined;
  size?: number;
  label?: string;
  light?: boolean; // quiet beige circle (task cards) instead of black
}) {
  const router = useRouter();
  const { teamMembers } = useWorkspaceData();
  if (!userId) return null;
  const m = teamMembers.find((x) => x.id === userId);
  const initials = m ? initialsFor(m.fullName, m.email) : "?";
  const name = m ? displayName(m.fullName, m.email) : "Former member";

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (m) router.push(`/dashboard/task-board?by=${m.id}`);
  };

  return (
    <span className="relative group/avatar flex-shrink-0">
      <button
        onClick={open}
        aria-label={`${label} ${name}${m ? `, ${m.email}` : ""}. View their tasks`}
        className={`rounded-full flex items-center justify-center font-semibold tracking-tight transition-transform hover:scale-105 ${
          light ? "bg-card-alt border border-line text-muted hover:text-ink" : m ? "bg-dark text-white" : "bg-line text-muted cursor-default"
        }`}
        style={{ width: size, height: size, fontSize: size <= 24 ? 10 : 11 }}
      >
        {initials}
      </button>
      {/* The transparent bottom padding bridges the gap to the circle, so the
          card stays open while the pointer moves up into it. */}
      <span className="absolute right-0 bottom-full z-50 hidden group-hover/avatar:block group-focus-within/avatar:block pb-1.5">
        <span
          role={m ? "link" : "tooltip"}
          tabIndex={-1}
          onClick={open}
          className={`block whitespace-nowrap rounded-xl bg-btn text-ink px-3 py-2 text-left shadow-lg ${m ? "cursor-pointer hover:bg-btn-hover" : ""}`}
        >
          <span className="block text-[11px] text-ink/60">{label}</span>
          <span className="block text-[12.5px] font-semibold">{name}</span>
          {m && m.fullName && <span className="block text-[12px] text-ink/80">{m.email}</span>}
          {m && <span className="block text-[11.5px] text-ink/60 mt-1 group-hover/avatar:text-ink/80">Click to view their tasks →</span>}
        </span>
      </span>
    </span>
  );
}
