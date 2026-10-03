"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import { initialsFor, displayName } from "@/lib/initials";

// Grey circle with a workspace member's initials. Hover shows who it is; click
// opens the Task Board filtered to the tasks they created.
//
// The hover card is drawn at the top of the page (a portal, fixed position),
// so scrolling boards and columns can't cut it off.
export default function MemberAvatar({
  userId,
  size = 26,
  label = "Created by",
}: {
  userId: string | null | undefined;
  size?: number;
  label?: string;
  light?: boolean; // kept for older call sites; every avatar is now the same grey
}) {
  const router = useRouter();
  const { teamMembers } = useWorkspaceData();
  const btnRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  // Close if the page scrolls (the card would otherwise float away).
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  if (!userId) return null;
  const m = teamMembers.find((x) => x.id === userId);
  const initials = m ? initialsFor(m.fullName, m.email) : "?";
  const name = m ? displayName(m.fullName, m.email) : "Former member";

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPos(null);
    if (m) router.push(`/dashboard/task-board?by=${m.id}`);
  };

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const cardW = 260;
    const above = r.top > 120; // not enough room above → open below
    const left = Math.max(8, Math.min(r.left, window.innerWidth - cardW - 8));
    setPos({ left, top: above ? r.top - 6 : r.bottom + 6, above });
  };
  const hideSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPos(null), 150);
  };

  return (
    <span className="relative flex-shrink-0" onMouseEnter={show} onMouseLeave={hideSoon}>
      <button
        ref={btnRef}
        onClick={open}
        onFocus={show}
        onBlur={hideSoon}
        aria-label={`${label} ${name}${m ? `, ${m.email}` : ""}. View their tasks`}
        className={`rounded-full flex items-center justify-center font-semibold tracking-tight transition-transform hover:scale-105 ${
          m ? "bg-card-alt border border-line text-muted hover:text-ink" : "bg-card-alt border border-line text-muted/60 cursor-default"
        }`}
        style={{ width: size, height: size, fontSize: size <= 24 ? 10 : 11 }}
      >
        {initials}
      </button>
      {pos &&
        createPortal(
          <span
            role={m ? "link" : "tooltip"}
            tabIndex={-1}
            onClick={open}
            onMouseEnter={show}
            onMouseLeave={hideSoon}
            style={{ left: pos.left, top: pos.top, transform: pos.above ? "translateY(-100%)" : undefined }}
            className={`fixed z-[100] block whitespace-nowrap rounded-xl bg-white border border-line text-ink px-3 py-2 text-left shadow-[0_12px_32px_-12px_rgba(20,24,33,0.35)] ${
              m ? "cursor-pointer hover:bg-card-alt" : ""
            }`}
          >
            <span className="block text-[11px] text-muted">{label}</span>
            <span className="block text-[12.5px] font-semibold">{name}</span>
            {m && m.fullName && <span className="block text-[12px] text-muted">{m.email}</span>}
            {m && <span className="block text-[11.5px] text-muted mt-1">Click to view their tasks →</span>}
          </span>,
          document.body
        )}
    </span>
  );
}
