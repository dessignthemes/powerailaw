"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Clock, MapPin, Users, Video, ExternalLink, Trash2, AlertTriangle, CalendarDays } from "lucide-react";

type Provider = "google" | "microsoft";
export type EventRef = { id: string; provider: Provider; title: string; start: string; end: string; allDay: boolean; location: string | null; link: string | null };
type Detail = EventRef & {
  notes: string | null;
  organizer: string | null;
  attendees: { name: string | null; email: string; response: string | null }[];
  joinUrl: string | null;
};

const providerName: Record<Provider, string> = { google: "Google Calendar", microsoft: "Outlook" };

// "m:AAMk…" / "g:abc…" → the calendar's own id
const rawId = (id: string) => id.replace(/^[mg]:/, "");

function whenText(e: EventRef) {
  if (e.allDay) {
    const s = new Date(`${e.start}T00:00:00`);
    const last = new Date(`${e.end}T00:00:00`);
    last.setDate(last.getDate() - 1); // end is exclusive
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    return last > s ? `${fmt(s)} – ${fmt(last)} · All day` : `${fmt(s)} · All day`;
  }
  const s = new Date(e.start);
  const en = new Date(e.end);
  const day = s.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay = s.toDateString() === en.toDateString();
  return sameDay ? `${day} · ${t(s)} – ${t(en)}` : `${day} ${t(s)} – ${en.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${t(en)}`;
}

const responseLabel: Record<string, string> = {
  accepted: "Accepted",
  tentativelyAccepted: "Tentative",
  tentative: "Tentative",
  declined: "Declined",
  needsAction: "No response",
  notResponded: "No response",
  none: "No response",
  organizer: "Organizer",
};

export default function EventDetailModal({ event, onClose, onDeleted }: { event: EventRef; onClose: () => void; onDeleted?: (id: string) => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/calendar/events/${encodeURIComponent(rawId(event.id))}?provider=${event.provider}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "Couldn't load this event.");
        return d.event as Detail;
      })
      .then((d) => !cancelled && setDetail(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [event.id, event.provider]);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function remove() {
    if (!confirm(`Delete "${event.title}"? It's removed from your ${providerName[event.provider]} calendar too.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const r = await fetch(`/api/calendar/events/${encodeURIComponent(rawId(event.id))}?provider=${event.provider}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? "Couldn't delete the event.");
      onDeleted?.(event.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  const e = detail ?? event;
  const link = detail?.link ?? event.link;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8" onClick={onClose}>
      <div onClick={(ev) => ev.stopPropagation()} className="bg-cream rounded-3xl w-full max-w-[720px] max-h-[88vh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-7 pt-6 pb-2">
          <span className="flex items-center gap-2 text-[13px] text-muted font-medium">
            <span className="bg-card-alt px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <CalendarDays size={13} strokeWidth={1.75} /> {providerName[event.provider]}
            </span>
          </span>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-7 pt-2 pb-6 flex-1">
          <h2 className="text-[26px] font-semibold leading-tight mb-5">{e.title}</h2>

          <div className="flex flex-col gap-3 text-[14.5px] mb-6">
            <div className="flex items-start gap-3">
              <Clock size={16} strokeWidth={1.75} className="text-muted mt-0.5 flex-shrink-0" />
              <span>{whenText(e)}</span>
            </div>
            {e.location && (
              <div className="flex items-start gap-3">
                <MapPin size={16} strokeWidth={1.75} className="text-muted mt-0.5 flex-shrink-0" />
                <span>{e.location}</span>
              </div>
            )}
            {detail?.joinUrl && (
              <div className="flex items-start gap-3">
                <Video size={16} strokeWidth={1.75} className="text-muted mt-0.5 flex-shrink-0" />
                <a href={detail.joinUrl} target="_blank" rel="noopener noreferrer" className="bg-dark text-white px-3.5 py-1.5 rounded-full text-[13px] font-medium hover:bg-dark2">
                  Join meeting
                </a>
              </div>
            )}
            {detail && (detail.organizer || detail.attendees.length > 0) && (
              <div className="flex items-start gap-3">
                <Users size={16} strokeWidth={1.75} className="text-muted mt-0.5 flex-shrink-0" />
                <div className="flex flex-col gap-1 min-w-0">
                  {detail.organizer && (
                    <span>
                      <span className="text-muted">Organizer:</span> {detail.organizer}
                    </span>
                  )}
                  {detail.attendees.map((a) => (
                    <span key={a.email} className="text-[13.5px] truncate">
                      {a.name ? `${a.name} ` : ""}
                      <span className="text-muted">{a.name ? `<${a.email}>` : a.email}</span>
                      {a.response && responseLabel[a.response] && <span className="text-muted"> · {responseLabel[a.response]}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700 flex items-center gap-2">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-2">Notes</div>
          {!detail && !error ? (
            <div className="flex items-center gap-2 text-[14px] text-muted py-3">
              <Loader2 size={14} className="animate-spin" /> Loading details…
            </div>
          ) : detail?.notes ? (
            <div className="bg-white border border-line rounded-2xl px-5 py-4 text-[14.5px] leading-relaxed whitespace-pre-wrap break-words max-h-[40vh] overflow-y-auto">
              {detail.notes}
            </div>
          ) : (
            <div className="text-[14px] text-muted py-2">No notes.</div>
          )}
        </div>

        <div className="border-t border-line px-7 py-4 flex items-center justify-between gap-3">
          <button
            onClick={remove}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[13.5px] font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} strokeWidth={1.75} />} Delete event
          </button>
          <div className="flex items-center gap-2">
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13.5px] font-medium text-muted hover:text-ink hover:bg-card-alt"
              >
                <ExternalLink size={13} strokeWidth={1.75} /> Open in {event.provider === "microsoft" ? "Outlook" : "Google"}
              </a>
            )}
            <button onClick={onClose} className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-dark2">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
