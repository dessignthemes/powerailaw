"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

// A month calendar of what's due: key dates, workflow steps not done yet, and
// tasks. One matter (its Calendar tab) or the whole firm (the Dashboard's Firm
// calendar widget, the same for everyone in the firm). Click a day to see
// everything on it; click an item to open its matter.

type Item = {
  id: string;
  date: string;
  kind: "key" | "step" | "task";
  title: string;
  done: boolean;
  matterId: string | null;
  matterNumber: string | null;
  matterTitle: string | null;
  taskId: string | null;
};

const KIND: Record<Item["kind"], { dot: string; label: string }> = {
  key: { dot: "bg-[#B42318]", label: "Key date" },
  step: { dot: "bg-[#D9A23B]", label: "Workflow step" },
  task: { dot: "bg-[#5E7BA6]", label: "Task" },
};
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function DeadlineCalendar({ matterId, compact = false }: { matterId?: string; compact?: boolean }) {
  const router = useRouter();
  const today = ymd(new Date());
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [picked, setPicked] = useState<string>(today);
  const [data, setData] = useState<{ key: string; items: Item[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The weeks shown: Sunday before the 1st to Saturday after the last day.
  const days = useMemo(() => {
    const start = new Date(month);
    start.setDate(1 - start.getDay());
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const out: Date[] = [];
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(new Date(d));
    return out;
  }, [month]);
  const from = ymd(days[0]);
  const to = ymd(days[days.length - 1]);
  const key = `${from}|${to}|${matterId ?? ""}`;

  useEffect(() => {
    let live = true;
    const qs = new URLSearchParams({ from, to, ...(matterId ? { matter: matterId } : {}) });
    fetch(`/api/deadlines?${qs}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "The calendar couldn't be loaded.");
        return (d.items ?? []) as Item[];
      })
      .then((items) => live && (setData({ key, items }), setError(null)))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [key, from, to, matterId]);

  const items = data?.key === key ? data.items : null;
  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items ?? []) m.set(i.date, [...(m.get(i.date) ?? []), i]);
    return m;
  }, [items]);
  const dayItems = byDay.get(picked) ?? [];
  const open = (i: Item) => {
    if (i.matterId) router.push(`/dashboard/matters/${i.matterId}?tab=${i.kind === "key" ? "overview" : "workflow"}`);
    else router.push("/dashboard/task-board");
  };
  const perCell = compact ? 2 : 3;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center gap-2 mb-2">
        <span className={`${compact ? "text-[15px]" : "text-[17px]"} font-semibold`}>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        {!items && !error && <Loader2 size={13} className="animate-spin text-muted" />}
        <span className="ml-auto flex items-center gap-1">
          <button onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Previous month" className="w-7 h-7 rounded-full hover:bg-[#F3F2F0] flex items-center justify-center">
            <ChevronLeft size={15} />
          </button>
          <button
            onClick={() => {
              const d = new Date();
              setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
              setPicked(today);
            }}
            className="px-2.5 py-1 rounded-full text-[12.5px] font-medium bg-[#F3F2F0] hover:bg-[#E7E5E1]"
          >
            Today
          </button>
          <button onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Next month" className="w-7 h-7 rounded-full hover:bg-[#F3F2F0] flex items-center justify-center">
            <ChevronRight size={15} />
          </button>
        </span>
      </div>
      {error && <div className="text-[13px] text-[#B42318] mb-2">{error}</div>}
      <div className="grid grid-cols-7 text-[11px] font-mono uppercase tracking-wider text-muted mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const k = ymd(d);
          const list = byDay.get(k) ?? [];
          const other = d.getMonth() !== month.getMonth();
          return (
            <button
              key={k}
              onClick={() => setPicked(k)}
              className={`flex flex-col items-stretch justify-start text-left rounded-lg border px-1.5 py-1 ${compact ? "min-h-[54px]" : "min-h-[84px]"} transition-colors ${
                k === picked ? "border-[#C4C0B8] bg-[#F3F2F0]" : "border-[#EBEAE7] hover:bg-[#FAFAF9]"
              } ${other ? "opacity-45" : ""}`}
            >
              <span className={`self-start text-[12px] font-medium inline-flex items-center justify-center ${k === today ? "w-5 h-5 rounded-full bg-[#1b191a] text-white" : ""}`}>{d.getDate()}</span>
              <span className="flex flex-col gap-0.5 mt-0.5">
                {list.slice(0, perCell).map((i) => (
                  <span key={i.id} className={`flex items-center gap-1 text-[11px] leading-tight truncate ${i.done ? "line-through text-muted" : ""}`} title={`${KIND[i.kind].label}: ${i.title}${i.matterNumber ? ` · ${i.matterNumber}` : ""}`}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${KIND[i.kind].dot}`} />
                    <span className="truncate">{!matterId && i.matterNumber ? `${i.matterNumber.replace(/-20\d\d-/, "-")} ` : ""}{i.title}</span>
                  </span>
                ))}
                {list.length > perCell && <span className="text-[10.5px] text-muted">+{list.length - perCell} more</span>}
              </span>
            </button>
          );
        })}
      </div>
      {/* The day picked: everything on it. */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        <div className="text-[13px] font-semibold mb-1.5">
          {new Date(`${picked}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          <span className="text-muted font-normal"> · {dayItems.length ? `${dayItems.length} ${dayItems.length === 1 ? "item" : "items"}` : "nothing due"}</span>
        </div>
        <div className="flex flex-col gap-1">
          {dayItems.map((i) => (
            <button key={i.id} onClick={() => open(i)} className="flex items-center gap-2.5 text-left rounded-lg px-2.5 py-1.5 bg-[#FCFCFC] border border-[#EBEAE7] hover:bg-[#F1F0EE]">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${KIND[i.kind].dot}`} />
              <span className="flex-1 min-w-0">
                <span className={`block text-[13px] font-medium truncate ${i.done ? "line-through text-muted" : ""}`}>{i.title}</span>
                <span className="block text-[11.5px] text-muted truncate">
                  {KIND[i.kind].label}
                  {!matterId && i.matterTitle ? ` · ${i.matterNumber ? `${i.matterNumber} · ` : ""}${i.matterTitle}` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-2 text-[11.5px] text-muted">
          {(Object.keys(KIND) as Item["kind"][]).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${KIND[k].dot}`} /> {KIND[k].label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
