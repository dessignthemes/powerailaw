// Potential leads (shared by the browser and the server).

export const LEAD_STATUSES = ["invited", "new", "contacted", "converted", "declined"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  invited: "Link sent",
  new: "New",
  contacted: "Contacted",
  converted: "Client",
  declined: "Declined",
};

// What the firm helps with (the form's "What do you need help with?").
export const MATTER_TYPES = [
  "Buying a home or property",
  "Selling a home or property",
  "Refinance",
  "Wills, trusts & estate planning",
  "Probate / estate administration",
  "Immigration",
  "Business law",
  "Landlord / tenant",
  "Other",
];

export const CONTACT_WAYS = ["Phone call", "Text message", "Email"];

// What a prospective client fills in.
export type LeadForm = {
  title: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  matterType: string;
  description: string;
  otherParties: string;
  preferredContact: string;
  bestTime: string;
  referredBy: string;
};

export type Lead = LeadForm & {
  id: string;
  status: LeadStatus;
  source: "website" | "link" | "manual";
  notes: string;
  clientId: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Consultation (booked by the firm, or by the prospect online).
  appointmentAt: string | null;
  appointmentEnd: string | null;
  appointmentWith: string | null; // profile id
  appointmentLocation: string;
  followupsSent: number;
  lastFollowupAt: string | null;
  reminderSentAt: string | null;
};

// ── Automation settings (Potential Leads → Automation) ──────────────────────
export type LeadSettings = {
  booking: {
    enabled: boolean; // prospects pick a consultation time after the intake form
    staffId: string | null; // whose calendar the consultations go in
    minutes: number;
    days: number[]; // 0 = Sunday … 6 = Saturday
    start: string; // "09:00", firm time zone
    end: string; // "17:00"
    location: string; // e.g. "445 Brick Blvd, Suite 205, Brick, NJ" or "Phone call"
    noticeHours: number; // earliest booking: this many hours from now
    horizonDays: number; // how far ahead people can book
  };
  followup: { enabled: boolean; afterDays: number; maxCount: number; message: string };
  reminder: { enabled: boolean; hoursBefore: number };
};

export const DEFAULT_LEAD_SETTINGS: LeadSettings = {
  booking: { enabled: false, staffId: null, minutes: 30, days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00", location: "", noticeHours: 24, horizonDays: 14 },
  followup: {
    enabled: false,
    afterDays: 2,
    maxCount: 2,
    message: "Thank you again for reaching out to our office. We'd be glad to help and wanted to follow up on your request.",
  },
  reminder: { enabled: false, hoursBefore: 24 },
};

const num = (v: unknown, min: number, max: number, def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const hhmm = (v: unknown, def: string) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : def);

export function cleanLeadSettings(raw: unknown): LeadSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as { booking?: Record<string, unknown>; followup?: Record<string, unknown>; reminder?: Record<string, unknown> };
  const b = r.booking ?? {};
  const f = r.followup ?? {};
  const m = r.reminder ?? {};
  const d = DEFAULT_LEAD_SETTINGS;
  const days = Array.isArray(b.days) ? [...new Set(b.days.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort() : d.booking.days;
  const start = hhmm(b.start, d.booking.start);
  const end = hhmm(b.end, d.booking.end);
  return {
    booking: {
      enabled: b.enabled === true,
      staffId: typeof b.staffId === "string" && /^[0-9a-f-]{36}$/i.test(b.staffId) ? b.staffId : null,
      minutes: num(b.minutes, 15, 180, d.booking.minutes),
      days: days.length ? days : d.booking.days,
      start,
      end: end > start ? end : d.booking.end,
      location: String(b.location ?? "").trim().slice(0, 200),
      noticeHours: num(b.noticeHours, 0, 336, d.booking.noticeHours),
      horizonDays: num(b.horizonDays, 1, 60, d.booking.horizonDays),
    },
    followup: {
      enabled: f.enabled === true,
      afterDays: num(f.afterDays, 1, 30, d.followup.afterDays),
      maxCount: num(f.maxCount, 1, 5, d.followup.maxCount),
      message: String(f.message ?? d.followup.message).trim().slice(0, 2000) || d.followup.message,
    },
    reminder: { enabled: m.enabled === true, hoursBefore: num(m.hoursBefore, 1, 72, d.reminder.hoursBefore) },
  };
}

export const leadName = (l: Pick<Lead, "title" | "firstName" | "lastName" | "company" | "email">) =>
  [l.firstName, l.lastName].filter(Boolean).join(" ") || l.company || l.email || "Unnamed";
