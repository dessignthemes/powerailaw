"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Search,
  SlidersHorizontal,
  RotateCw,
  Plus,
} from "lucide-react";
import NewEventModal, { CalendarEvent } from "@/components/NewEventModal";
import IntegrationsModal from "@/components/IntegrationsModal";

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-start
  const gridStart = new Date(year, month, 1 - startOffset);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

export default function CalendarPage() {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);

  const days = useMemo(
    () => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()),
    [cursor]
  );

  const monthLabel = cursor.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const todayISO = toISODate(today);

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  return (
    <div className="px-10 py-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-card-alt rounded-full px-2 py-1.5">
            <button
              onClick={() => shiftMonth(-1)}
              className="w-6 h-6 flex items-center justify-center text-muted hover:text-ink transition-colors"
            >
              <ChevronLeft size={15} strokeWidth={1.75} />
            </button>
            <span className="text-[13.5px] font-medium px-1">{monthLabel}</span>
            <button
              onClick={() => shiftMonth(1)}
              className="w-6 h-6 flex items-center justify-center text-muted hover:text-ink transition-colors"
            >
              <ChevronRight size={15} strokeWidth={1.75} />
            </button>
          </div>
          <div className="flex items-center gap-2 bg-card-alt rounded-full px-3.5 py-2 text-[13.5px] font-medium">
            <CalendarIcon size={14} strokeWidth={1.75} /> Month
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="w-9 h-9 rounded-full bg-card-alt hover:bg-line/60 transition-colors flex items-center justify-center">
            <Search size={15} strokeWidth={1.75} />
          </button>
          <button className="w-9 h-9 rounded-full bg-card-alt hover:bg-line/60 transition-colors flex items-center justify-center">
            <SlidersHorizontal size={15} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="w-9 h-9 rounded-full bg-card-alt hover:bg-line/60 transition-colors flex items-center justify-center"
          >
            <RotateCw size={15} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="bg-card-alt px-3.5 py-2 rounded-full text-[13.5px] font-medium hover:bg-line/60 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setModalDate(todayISO)}
            className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-dark2 transition-colors"
          >
            <Plus size={14} strokeWidth={2} /> Add
          </button>
        </div>
      </div>

      <div className="bg-card-alt border border-line rounded-xl px-5 py-3 flex items-center justify-between mb-6 flex-wrap gap-3">
        <span className="text-[13.5px] text-muted">
          Sync from Outlook Calendar to see your events here.
        </span>
        <button
          onClick={() => setIntegrationsOpen(true)}
          className="text-[13.5px] font-medium text-ink underline"
        >
          Connect a calendar
        </button>
      </div>

      <div className="border border-line rounded-2xl overflow-hidden">
        <div className="grid grid-cols-7 bg-card-alt border-b border-line">
          {weekDays.map((d) => (
            <div key={d} className="text-[12.5px] font-medium text-muted px-3 py-2.5 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const iso = toISODate(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = iso === todayISO;
            const dayEvents = events.filter((e) => e.date === iso);
            return (
              <button
                key={i}
                onClick={() => setModalDate(iso)}
                className={`min-h-[140px] border-r border-b border-line px-2.5 py-2 text-left hover:bg-card-alt/60 transition-colors ${
                  !inMonth ? "text-muted/40" : ""
                } ${(i + 1) % 7 === 0 ? "border-r-0" : ""}`}
              >
                <span
                  className={`inline-flex items-center justify-center text-[13px] w-6 h-6 rounded-full ${
                    isToday ? "bg-red-500 text-white font-semibold" : ""
                  }`}
                >
                  {d.getDate()}
                </span>
                <div className="flex flex-col gap-1 mt-1.5">
                  {dayEvents.slice(0, 3).map((e) => (
                    <div
                      key={e.id}
                      className="text-[11px] font-medium bg-white border border-line rounded-md px-1.5 py-0.5 truncate"
                    >
                      {e.start} {e.title}
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {modalDate && (
        <NewEventModal
          initialDate={modalDate}
          onClose={() => setModalDate(null)}
          onCreate={(event) => {
            setEvents((evs) => [...evs, event]);
            setModalDate(null);
          }}
        />
      )}

      {integrationsOpen && <IntegrationsModal onClose={() => setIntegrationsOpen(false)} />}
    </div>
  );
}
