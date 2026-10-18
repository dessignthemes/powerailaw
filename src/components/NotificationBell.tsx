"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ListChecks, Folder , MessageSquare } from "lucide-react";

type Item = { id: string; kind: "task_assigned" | "matter_assigned" | "task_offered" | "task_accepted" | "portal_message"; refId: string; boardId: string | null; title: string; actorName: string; createdAt: string; read: boolean };

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};
const hrefOf = (n: Item) =>
  n.kind === "portal_message"
    ? n.boardId === n.refId
      ? `/dashboard/client-intake?card=${n.refId}` // a message not tied to a matter: the client's card
      : `/dashboard/matters/${n.refId}?tab=emails`
    : n.kind === "matter_assigned"
      ? `/dashboard/matters/${n.refId}`
      : `/dashboard/task-board?board=${n.boardId ?? "general"}&task=${n.refId}`;

// Top-right bell: turns red when a task or matter is newly assigned to you.
export default function NotificationBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items: Item[]; unread: number } | null) => {
        if (!d) return;
        setItems(d.items);
        setUnread(d.unread);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    const onFocus = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

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

  function toggle() {
    const next = !open;
    setOpen(next);
    // Opening the list counts as seeing the alerts: the bell stops being red.
    if (next && unread > 0) {
      setUnread(0);
      fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read_all" }) }).catch(() => {});
    }
  }

  return (
    <div className="relative" ref={box}>
      <button
        onClick={toggle}
        aria-label={unread ? `${unread} new ${unread === 1 ? "alert" : "alerts"}` : "Alerts"}
        className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-colors ${unread ? "bg-[#FDE8E8] text-[#B42318] hover:bg-[#FBD5D5]" : "bg-chip hover:bg-btn text-ink"}`}
      >
        <Bell size={17} strokeWidth={1.9} className={unread ? "animate-[wiggle_1s_ease-in-out_2]" : ""} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 rounded-full bg-[#E5484D] text-white text-[11px] font-semibold flex items-center justify-center ring-2 ring-page">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[360px] max-w-[calc(100vw-32px)] bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] overflow-hidden">
          <div className="px-4 py-3 border-b border-line text-[14px] font-semibold">Alerts</div>
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-muted">Nothing new. You&apos;ll see tasks and matters assigned to you here.</div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              {items.map((n) => {
                const Icon = n.kind === "portal_message" ? MessageSquare : n.kind === "matter_assigned" ? Folder : ListChecks;
                return (
                  <Link key={n.id} href={hrefOf(n)} onClick={() => setOpen(false)} className={`flex gap-3 px-4 py-3 hover:bg-chip/60 border-b border-line last:border-b-0 ${n.read ? "" : "bg-[#FFF6F6]"}`}>
                    <Icon size={16} strokeWidth={1.75} className="text-muted mt-0.5 flex-shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-muted">
                        {n.kind === "portal_message"
                          ? `${n.actorName} sent a message through the client portal`
                          : n.kind === "task_offered"
                          ? `${n.actorName} offered you a task: accept it to take it`
                          : n.kind === "task_accepted"
                            ? `${n.actorName} accepted your task`
                            : `${n.actorName} assigned you a ${n.kind === "matter_assigned" ? "matter" : "task"}`}
                      </span>
                      <span className="block text-[13.5px] font-medium truncate">{n.title}</span>
                    </span>
                    <span className="text-[11.5px] text-muted flex-shrink-0 flex items-start gap-1.5">
                      {!n.read && <span className="w-2 h-2 rounded-full bg-[#E5484D] mt-1" />}
                      {ago(n.createdAt)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
