"use client";

import { useState } from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  type: string;
  isTask: boolean;
};

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
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [type, setType] = useState("Meeting");
  const [asTask, setAsTask] = useState(false);
  const [attendees, setAttendees] = useState<string[]>(["marios@dessign.co"]);

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
      <div className="bg-cream rounded-3xl w-full max-w-[540px] max-h-[90vh] overflow-y-auto">
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
            <div className="flex-1 border border-line rounded-xl bg-white px-3.5 py-2.5">
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full outline-none text-[14px] bg-transparent"
              />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full outline-none text-[13px] bg-transparent text-muted mt-1"
              />
            </div>
            <span className="text-muted">–</span>
            <div className="flex-1 border border-line rounded-xl bg-white px-3.5 py-2.5">
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full outline-none text-[14px] bg-transparent"
              />
              <input
                type="date"
                value={date}
                disabled
                className="w-full outline-none text-[13px] bg-transparent text-muted mt-1"
              />
            </div>
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

          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium text-muted">Notify</span>
            <div className="border border-line rounded-xl px-3.5 py-2 text-[13.5px] bg-white">
              No reminders
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium text-muted">Repeats</span>
            <div className="border border-line rounded-xl px-3.5 py-2 text-[13.5px] bg-white">
              Does not repeat
            </div>
          </div>

          <div className="border-t border-line" />

          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] font-medium text-muted">Type</span>
            <div className="flex items-center gap-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="border border-line rounded-xl px-3.5 py-2 text-[13.5px] bg-white outline-none"
              >
                <option>Meeting</option>
                <option>Deadline</option>
                <option>Hearing</option>
                <option>Call</option>
              </select>
              <span className="w-5 h-5 rounded-full bg-blue-400 inline-block" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium text-muted">Matter</span>
            <div className="border border-line rounded-xl px-3.5 py-2 text-[13.5px] bg-white text-muted">
              Matter
            </div>
          </div>

          <div>
            <span className="text-[14px] font-medium text-muted block mb-2">Attendees</span>
            <input
              placeholder="Search your firm, clients, or type an email"
              className="w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none placeholder:text-muted mb-2"
            />
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
