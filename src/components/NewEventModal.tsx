"use client";

import { useState } from "react";
import { Calendar as CalendarIcon, X, Folder, Search } from "lucide-react";
import DropdownField from "@/components/DropdownField";
import ColorPicker from "@/components/ColorPicker";
import { TimeDateBox } from "@/components/TimeDateBox";

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  type: string;
  isTask: boolean;
};

const reminderOptions = [
  "No reminders",
  "At event start",
  "5 min before",
  "15 min before",
  "30 min before",
  "1 hour before",
  "2 hours before",
  "1 day before",
];

const repeatOptions = ["Does not repeat", "Daily", "Weekly", "Monthly", "Yearly"];

const typeOptions = ["Meeting", "Hearing", "Filing deadline", "Call", "Other"];

function parseDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(iso: string) {
  return parseDate(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number) {
  const wrapped = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function NewEventModal({
  initialDate,
  onClose,
  onCreate,
}: {
  initialDate: string;
  onClose: () => void;
  onCreate: (event: CalendarEvent) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialDate);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [reminder, setReminder] = useState("No reminders");
  const [repeat, setRepeat] = useState("Does not repeat");
  const [type, setType] = useState("Meeting");
  const [color, setColor] = useState("#3B82F6");
  const [asTask, setAsTask] = useState(false);
  const [attendees, setAttendees] = useState<string[]>(["marios@dessign.co"]);
  const [matter, setMatter] = useState<string | null>(null);
  const [matterOpen, setMatterOpen] = useState(false);
  const [matterSearch, setMatterSearch] = useState("");

  function shiftTime(which: "start" | "end", delta: number) {
    if (which === "start") {
      setStart(minutesToTime(timeToMinutes(start) + delta));
    } else {
      setEnd(minutesToTime(timeToMinutes(end) + delta));
    }
  }

  function shiftDate(which: "start" | "end", delta: number) {
    if (which === "start") {
      const d = parseDate(date);
      d.setDate(d.getDate() + delta);
      setDate(toISODate(d));
    } else {
      const d = parseDate(endDate);
      d.setDate(d.getDate() + delta);
      setEndDate(toISODate(d));
    }
  }

  function handleCreate() {
    onCreate({
      id: crypto.randomUUID(),
      title: title || "Untitled event",
      date,
      start,
      end,
      type,
      isTask: asTask,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="bg-cream rounded-3xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-7 pt-6 pb-2">
          <div className="flex items-center gap-2 text-[13.5px] text-muted font-medium">
            <CalendarIcon size={14} strokeWidth={1.75} /> Calendar
            <span className="text-muted">›</span>
            <span className="text-ink font-semibold">New event</span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-7 pt-3 pb-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event title"
            maxLength={150}
            className="w-full bg-transparent outline-none text-[22px] font-medium placeholder:text-muted mb-2"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description..."
            rows={2}
            className="w-full bg-transparent outline-none text-[14px] placeholder:text-muted resize-none"
          />
        </div>

        <div className="px-7 py-5 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <TimeDateBox
              timeLabel={start}
              dateLabel={formatDateLabel(date)}
              onTimePrev={() => shiftTime("start", -30)}
              onTimeNext={() => shiftTime("start", 30)}
              onDatePrev={() => shiftDate("start", -1)}
              onDateNext={() => shiftDate("start", 1)}
            />
            <span className="text-muted">–</span>
            <TimeDateBox
              timeLabel={end}
              dateLabel={formatDateLabel(endDate)}
              onTimePrev={() => shiftTime("end", -30)}
              onTimeNext={() => shiftTime("end", 30)}
              onDatePrev={() => shiftDate("end", -1)}
              onDateNext={() => shiftDate("end", 1)}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium">All day</span>
            <button
              onClick={() => setAllDay((a) => !a)}
              className={`w-10 h-6 rounded-full transition-colors relative ${
                allDay ? "bg-dark" : "bg-line"
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                  allDay ? "left-[18px]" : "left-0.5"
                }`}
              />
            </button>
          </div>

          <div className="border-t border-line" />

          <div className="flex items-center justify-between gap-4">
            <span className="text-[14px] font-medium text-muted flex-shrink-0">Notify</span>
            <DropdownField value={reminder} options={reminderOptions} onChange={setReminder} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[14px] font-medium text-muted flex-shrink-0">Repeats</span>
            <DropdownField value={repeat} options={repeatOptions} onChange={setRepeat} />
          </div>

          <div className="border-t border-line" />

          <div className="flex items-center justify-between gap-4">
            <span className="text-[14px] font-medium text-muted flex-shrink-0">Type</span>
            <div className="flex items-center gap-2 flex-1">
              <DropdownField value={type} options={typeOptions} onChange={setType} />
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 relative">
            <span className="text-[14px] font-medium text-muted flex-shrink-0">Matter</span>
            <div className="flex-1 relative">
              <button
                onClick={() => setMatterOpen((o) => !o)}
                className="w-full flex items-center gap-2 border border-line rounded-xl px-3.5 py-2.5 text-[13.5px] bg-card-alt hover:bg-line/50 transition-colors text-left"
              >
                <Folder size={13} strokeWidth={1.75} className="text-muted flex-shrink-0" />
                <span className={matter ? "text-ink" : "text-muted"}>{matter ?? "Matter"}</span>
              </button>
              {matterOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMatterOpen(false)} />
                  <div className="absolute left-0 top-[calc(100%+6px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-2.5 w-full min-w-[260px]">
                    <div className="relative mb-2">
                      <Search
                        size={13}
                        strokeWidth={1.75}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                      />
                      <input
                        autoFocus
                        value={matterSearch}
                        onChange={(e) => setMatterSearch(e.target.value)}
                        placeholder="Search matter, client, email..."
                        className="w-full bg-card-alt rounded-lg pl-8 pr-3 py-2 text-[13.5px] outline-none placeholder:text-muted"
                      />
                    </div>
                    <button
                      onClick={() => {
                        setMatter(null);
                        setMatterOpen(false);
                        setMatterSearch("");
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors text-muted"
                    >
                      <Folder size={14} strokeWidth={1.75} /> No matter
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div>
            <span className="text-[14px] font-medium text-muted block mb-2">Attendees</span>
            <div className="relative mb-2">
              <Search
                size={14}
                strokeWidth={1.75}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                placeholder="Search your firm, clients, or type an email"
                className="w-full border border-line rounded-xl pl-9 pr-3.5 py-2.5 text-[14px] bg-white outline-none placeholder:text-muted"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {attendees.map((a) => (
                <div
                  key={a}
                  className="flex items-center gap-1.5 bg-card-alt rounded-full pl-1 pr-2.5 py-1 text-[13px] font-medium"
                >
                  <span className="w-5 h-5 rounded-full bg-dark text-white flex items-center justify-center text-[10px]">
                    {a[0].toUpperCase()}
                  </span>
                  {a}
                  <button
                    onClick={() => setAttendees((ats) => ats.filter((x) => x !== a))}
                    className="text-muted hover:text-ink"
                  >
                    <X size={11} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <span className="text-[14px] font-medium text-muted block mb-2">Location</span>
            <input
              placeholder="Office, address, or call link"
              className="w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none placeholder:text-muted"
            />
          </div>

          <div className="border-t border-line" />

          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium">Create as task instead of event</span>
            <button
              onClick={() => setAsTask((t) => !t)}
              className={`w-10 h-6 rounded-full transition-colors relative ${
                asTask ? "bg-dark" : "bg-line"
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                  asTask ? "left-[18px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-7 py-5 border-t border-line">
          <button
            onClick={onClose}
            className="text-[14px] font-medium text-muted hover:text-ink transition-colors px-2"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="bg-dark text-white px-5 py-2.5 rounded-full text-[14px] font-medium hover:bg-dark2 transition-colors"
          >
            {asTask ? "Create task" : "Create event"}
          </button>
        </div>
      </div>
    </div>
  );
}
