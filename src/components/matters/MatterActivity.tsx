"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ListChecks, FileText, Clock, Mail, Flag, FolderOpen, CalendarClock, CheckCircle2 } from "lucide-react";
import MemberAvatar from "@/components/MemberAvatar";
import { frameOuter, frameInner, frameTitle } from "@/lib/ui";

// A matter's Activities tab: what everyone in the firm did on it, newest first.
// The same items as the Dashboard's Recent activity widget: clicking one there
// opens it here (highlighted).

export type ActivityItem = {
  id: string;
  at: string;
  kind: "task" | "step" | "document" | "time" | "email" | "status" | "matter" | "keydates";
  verb: string;
  subject: string;
  actorId: string | null;
  actorEmail: string | null;
  matterId: string | null;
  matterNumber: string | null;
  matterTitle: string | null;
  taskId: string | null;
  documentId: string | null;
};

export const ACTIVITY_ICON = { task: ListChecks, step: CheckCircle2, document: FileText, time: Clock, email: Mail, status: Flag, matter: FolderOpen, keydates: CalendarClock };
export const whenText = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric", hour: "numeric", minute: "2-digit" });

export default function MatterActivity({ matterId, highlight, onOpen }: { matterId: string; highlight?: string | null; onOpen?: (i: ActivityItem) => void }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const marked = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/activity?matter=${matterId}&limit=200`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "The activity couldn't be loaded.");
        return (d.items ?? []) as ActivityItem[];
      })
      .then((x) => live && setItems(x))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [matterId]);
  useEffect(() => {
    if (items && highlight) marked.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [items, highlight]);

  return (
    <div className={frameOuter}>
      <div className="px-3 pt-2.5 pb-2.5">
        <span className={frameTitle}>Activities{items ? ` · ${items.length}` : ""}</span>
      </div>
      <div className={`${frameInner} p-2`}>
        {error ? (
          <div className="p-6 text-center text-[13.5px] text-[#B42318]">{error}</div>
        ) : !items ? (
          <div className="p-8 text-center text-[13.5px] text-muted flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading activity…
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-[13.5px] text-muted">Nothing has happened on this matter yet.</div>
        ) : (
          <div className="flex flex-col">
            {items.map((i) => {
              const Icon = ACTIVITY_ICON[i.kind];
              const on = i.id === highlight;
              return (
                <div
                  key={i.id}
                  ref={on ? marked : undefined}
                  onClick={() => onOpen?.(i)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl ${onOpen ? "cursor-pointer" : ""} ${on ? "bg-[#FFF4E5] ring-1 ring-[#F6D4A6]" : "hover:bg-[#F3F2F0]"}`}
                >
                  <span className="w-7 h-7 rounded-full bg-[#F3F2F0] flex items-center justify-center flex-shrink-0">
                    <Icon size={14} strokeWidth={1.75} className="text-muted" />
                  </span>
                  <span className="flex-1 min-w-0 text-[13.5px] truncate">
                    <span className="text-muted">{i.verb}</span> {i.subject && <span className="font-medium">{i.subject}</span>}
                  </span>
                  <span className="text-[12px] text-muted flex-shrink-0">{whenText(i.at)}</span>
                  {i.actorId ? <MemberAvatar userId={i.actorId} label="By" /> : <span className="w-6" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
