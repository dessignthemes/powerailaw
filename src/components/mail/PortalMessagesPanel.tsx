"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, ChevronDown, ChevronUp } from "lucide-react";

type Msg = { id: string; from: string; clientId: string; matterId: string | null; matter: string | null; preview: string; unread: boolean; at: string };

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

// Top of the Inbox: messages clients sent through the client portal (last 30 days).
export default function PortalMessagesPanel() {
  const [data, setData] = useState<{ messages: Msg[]; unread: number } | null>(null);
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch("/api/portal-messages/recent")
        .then((r) => r.json())
        .then((d) => Array.isArray(d.messages) && setData(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  if (!data || data.messages.length === 0) return null;
  const list = all ? data.messages : data.messages.slice(0, 4);

  return (
    <div className="mb-4 border border-line rounded-2xl bg-page overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-chip/50">
        <span className="flex items-center gap-2 text-[13.5px] font-semibold">
          <MessageSquare size={15} strokeWidth={1.75} />
          Client portal messages
          {data.unread > 0 && <span className="bg-[#E5484D] text-white text-[11px] font-semibold rounded-full px-1.5 py-0.5">{data.unread} new</span>}
        </span>
        {open ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
      </button>
      {open && (
        <div className="border-t border-line">
          {list.map((m) => (
            <Link
              key={m.id}
              href={m.matterId ? `/dashboard/matters/${m.matterId}?tab=emails` : `/dashboard/client-intake?card=${m.clientId}`}
              className={`flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-b-0 hover:bg-chip/50 ${m.unread ? "bg-[#F3F7FD]" : ""}`}
            >
              {m.unread ? <span className="w-2 h-2 rounded-full bg-[#3B82F6] flex-shrink-0" aria-label="New" /> : <span className="w-2 flex-shrink-0" />}
              <span className={`text-[13.5px] w-[180px] flex-shrink-0 truncate ${m.unread ? "font-semibold" : ""}`}>{m.from}</span>
              {m.matter && <span className="text-[11.5px] font-semibold bg-chip rounded-md px-1.5 py-0.5 flex-shrink-0">{m.matter}</span>}
              <span className="text-[13px] text-muted truncate flex-1">{m.preview}</span>
              <span className="text-[12px] text-muted flex-shrink-0">{when(m.at)}</span>
            </Link>
          ))}
          {data.messages.length > 4 && (
            <button onClick={() => setAll((a) => !a)} className="w-full px-4 py-2 text-[12.5px] text-muted hover:text-ink text-left">
              {all ? "Show fewer" : `Show all ${data.messages.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
