import "server-only";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserConnections } from "@/lib/data/oauth";
import { createSyncedEvent, deleteSyncedEvent, syncedEvents } from "@/lib/calendar/events";
import { sendFromMailbox } from "@/lib/mail/sendMail";
import { getSignature, signatureForSending } from "@/lib/mail/signature";
import { firmTimezone } from "@/lib/ai/workspaceTools";
import { intakeLink, toLead, LeadError, setupError } from "@/lib/data/leads";
import { cleanLeadSettings, leadName, type Lead, type LeadSettings } from "@/lib/leads";
import type { MailProvider } from "@/lib/mail/types";

// Lead automation: consultations booked online (or by the firm), follow-up
// emails to leads who haven't booked, and a reminder email before the meeting.
// Emails go from the consultation person's own mailbox; bookings go in their
// own Outlook / Google calendar, which sends the prospect the invitation.

const db = () => createAdminClient();
const missing = (e: { message?: string; code?: string } | null) => !!e && (e.code === "42703" || e.code === "PGRST204" || /lead_settings|appointment_|booking_token|followups_sent/.test(e.message ?? ""));

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getLeadSettings(orgId: string): Promise<LeadSettings> {
  const { data, error } = await db().from("organizations").select("lead_settings").eq("id", orgId).maybeSingle();
  if (error) {
    if (missing(error)) throw new LeadError(503, "Lead automation needs a database update first (migration 0059).", "setup");
    throw error;
  }
  return cleanLeadSettings((data as { lead_settings?: unknown } | null)?.lead_settings);
}

export async function saveLeadSettings(orgId: string, raw: unknown): Promise<LeadSettings> {
  const settings = cleanLeadSettings(raw);
  if (settings.booking.staffId) {
    const { data } = await db().from("profiles").select("id").eq("org_id", orgId).eq("id", settings.booking.staffId).maybeSingle();
    if (!data) settings.booking.staffId = null;
  }
  if (settings.booking.enabled && !settings.booking.staffId) throw new LeadError(400, "Choose who takes the consultations.");
  const { error } = await db().from("organizations").update({ lead_settings: settings }).eq("id", orgId);
  if (error) {
    if (missing(error)) throw new LeadError(503, "Lead automation needs a database update first (migration 0059).", "setup");
    throw error;
  }
  return settings;
}

// ── Time zones (the firm's office hours are in its own time zone) ────────────

function offsetMs(at: Date, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((x) => [x.type, x.value])
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at.getTime();
}
// "2026-11-03" + "09:30" in the firm's zone → the real moment.
export function zoned(ymd: string, hm: string, tz: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz);
  return new Date(t);
}
const ymdIn = (at: Date, tz: string) => at.toLocaleDateString("en-CA", { timeZone: tz });
const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const weekday = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
export const whenText = (iso: string, tz: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

// ── Free times ───────────────────────────────────────────────────────────────

async function calendarProvider(userId: string): Promise<MailProvider | null> {
  const conns = await getUserConnections(userId);
  return (conns.find((c) => c.provider === "microsoft") ?? conns.find((c) => c.provider === "google"))?.provider ?? null;
}

export type Slot = { start: string; end: string };

export async function availableSlots(orgId: string, s?: LeadSettings): Promise<{ slots: Slot[]; tz: string; settings: LeadSettings }> {
  const settings = s ?? (await getLeadSettings(orgId));
  const tz = await firmTimezone(orgId);
  const b = settings.booking;
  if (!b.enabled || !b.staffId) return { slots: [], tz, settings };
  const now = Date.now();
  const earliest = now + b.noticeHours * 3600_000;
  const today = ymdIn(new Date(now), tz);
  const lastDay = addDays(today, b.horizonDays);
  const from = zoned(today, "00:00", tz);
  const to = zoned(addDays(lastDay, 1), "00:00", tz);

  // Busy: everything in that person's calendar (all-day events block the whole day), and consultations already booked.
  const busy: [number, number][] = [];
  try {
    const { events } = await syncedEvents(b.staffId, from.toISOString(), to.toISOString());
    for (const e of events) {
      if (e.allDay) busy.push([zoned(e.start, "00:00", tz).getTime(), zoned(e.end, "00:00", tz).getTime()]);
      else busy.push([Date.parse(e.start), Date.parse(e.end)]);
    }
  } catch (e) {
    console.error("Reading the calendar for booking failed:", e);
    return { slots: [], tz, settings }; // never offer times we couldn't check
  }
  const { data: booked } = await db().from("leads").select("appointment_at, appointment_end").eq("org_id", orgId).eq("appointment_with", b.staffId).gte("appointment_at", from.toISOString());
  for (const r of (booked ?? []) as { appointment_at: string; appointment_end: string | null }[]) {
    const st = Date.parse(r.appointment_at);
    busy.push([st, r.appointment_end ? Date.parse(r.appointment_end) : st + b.minutes * 60_000]);
  }

  const len = b.minutes * 60_000;
  const step = Math.min(30, b.minutes) * 60_000;
  const slots: Slot[] = [];
  for (let day = today; day <= lastDay && slots.length < 300; day = addDays(day, 1)) {
    if (!b.days.includes(weekday(day))) continue;
    const open = zoned(day, b.start, tz).getTime();
    const close = zoned(day, b.end, tz).getTime();
    for (let t = open; t + len <= close; t += step) {
      if (t < earliest) continue;
      if (busy.some(([s0, e0]) => t < e0 && t + len > s0)) continue;
      slots.push({ start: new Date(t).toISOString(), end: new Date(t + len).toISOString() });
    }
  }
  return { slots, tz, settings };
}

// ── Booking ──────────────────────────────────────────────────────────────────

async function loadLead(orgId: string, id: string) {
  const { data, error } = await db().from("leads").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (error) {
    if (missing(error)) throw setupError();
    throw error;
  }
  if (!data) throw new LeadError(404, "That lead wasn't found.");
  return { row: data as Record<string, unknown>, lead: toLead(data) };
}

// A link the prospect uses to pick (or change) their consultation time.
export async function bookingUrl(orgId: string, leadId: string): Promise<string> {
  const { data } = await db().from("leads").select("booking_token").eq("org_id", orgId).eq("id", leadId).maybeSingle();
  let token = (data as { booking_token?: string | null } | null)?.booking_token ?? null;
  if (!token) {
    token = randomBytes(18).toString("base64url");
    await db().from("leads").update({ booking_token: token }).eq("org_id", orgId).eq("id", leadId);
  }
  return `${(await intakeLink(orgId)).url}/book?t=${token}`;
}

export async function leadByBookingToken(orgId: string, token: string | null): Promise<Lead | null> {
  if (!token || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data } = await db().from("leads").select("*").eq("org_id", orgId).eq("booking_token", token).maybeSingle();
  return data ? toLead(data) : null;
}

export async function bookConsultation(
  orgId: string,
  leadId: string,
  opts: { start: string; minutes?: number; staffId?: string | null; location?: string | null; byProspect?: boolean }
): Promise<Lead> {
  const settings = await getLeadSettings(orgId);
  const { lead } = await loadLead(orgId, leadId);
  const staffId = opts.byProspect ? settings.booking.staffId : opts.staffId || settings.booking.staffId;
  if (!staffId) throw new LeadError(400, "Choose who the consultation is with.");
  const minutes = Math.min(240, Math.max(10, Math.round(opts.minutes ?? settings.booking.minutes)));
  const start = new Date(opts.start);
  if (isNaN(start.getTime()) || start.getTime() < Date.now() - 5 * 60_000) throw new LeadError(400, "Choose a time in the future.");
  if (opts.byProspect) {
    const { slots } = await availableSlots(orgId, settings);
    if (!slots.some((s) => s.start === start.toISOString())) throw new LeadError(400, "That time was just taken. Please pick another one.");
  }
  const end = new Date(start.getTime() + minutes * 60_000);
  const provider = await calendarProvider(staffId);
  if (!provider) throw new LeadError(400, "The person taking the consultation hasn't connected Outlook or Google Calendar.");
  const location = (opts.location ?? settings.booking.location ?? "").trim().slice(0, 200);
  const name = leadName(lead);

  // A new time replaces the old event.
  if (lead.appointmentAt) await cancelEvent(orgId, leadId).catch(() => undefined);

  const notes = [
    `Consultation with a prospective client (Potential Leads in LawPower).`,
    lead.matterType && `Needs help with: ${lead.matterType}`,
    lead.description && `Their situation: ${lead.description}`,
    lead.otherParties && `Others involved: ${lead.otherParties}`,
    [lead.email, lead.phone].filter(Boolean).join(" · "),
  ]
    .filter(Boolean)
    .join("\n\n");
  const event = await createSyncedEvent(staffId, provider, {
    title: `Consultation: ${name}${lead.matterType ? ` (${lead.matterType})` : ""}`,
    allDay: false,
    start: start.toISOString(),
    end: end.toISOString(),
    location: location || null,
    notes,
    attendees: lead.email ? [{ email: lead.email, name }] : [],
    reminderMinutes: 15,
  });
  const { data, error } = await db()
    .from("leads")
    .update({
      appointment_at: start.toISOString(),
      appointment_end: end.toISOString(),
      appointment_with: staffId,
      appointment_location: location,
      appointment_event_id: event.id,
      reminder_sent_at: null,
      ...(lead.status === "new" || lead.status === "invited" ? { status: "contacted" } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .eq("id", leadId)
    .select("*")
    .single();
  if (error) throw error;
  return toLead(data);
}

async function cancelEvent(orgId: string, leadId: string) {
  const { row } = await loadLead(orgId, leadId);
  const eventId = row.appointment_event_id as string | null;
  const staffId = row.appointment_with as string | null;
  if (!eventId || !staffId) return;
  const provider: MailProvider = eventId.startsWith("g:") ? "google" : "microsoft";
  await deleteSyncedEvent(staffId, provider, eventId.slice(2));
}

export async function cancelConsultation(orgId: string, leadId: string): Promise<Lead> {
  await cancelEvent(orgId, leadId).catch((e) => console.error("Removing the consultation from the calendar failed:", e));
  const { data, error } = await db()
    .from("leads")
    .update({ appointment_at: null, appointment_end: null, appointment_event_id: null, reminder_sent_at: null, updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", leadId)
    .select("*")
    .single();
  if (error) throw error;
  return toLead(data);
}

// ── Follow-ups and reminders (the hourly job) ────────────────────────────────

async function sendAs(orgId: string, userId: string, to: string, subject: string, text: string, kind: string) {
  const sig = (await getSignature(userId)).on ? await signatureForSending(userId) : null;
  await sendFromMailbox(orgId, userId, { to: [to], subject, text, ...(sig ? { signature: sig } : {}) }, { kind });
}

async function senderFor(orgId: string, settings: LeadSettings): Promise<string | null> {
  if (settings.booking.staffId) return settings.booking.staffId;
  const { data } = await db().from("profiles").select("id").eq("org_id", orgId).eq("role", "owner").limit(1).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function runLeadAutomation(): Promise<{ followups: number; reminders: number; errors: number }> {
  const out = { followups: 0, reminders: 0, errors: 0 };
  const { data: orgs, error } = await db().from("organizations").select("id, name, lead_settings");
  if (error) {
    if (missing(error)) return out;
    throw error;
  }
  for (const o of (orgs ?? []) as { id: string; name: string | null; lead_settings: unknown }[]) {
    const settings = cleanLeadSettings(o.lead_settings);
    if (!settings.followup.enabled && !settings.reminder.enabled) continue;
    const tz = await firmTimezone(o.id);
    const firm = o.name || "our office";
    const sender = await senderFor(o.id, settings);
    if (!sender) continue;
    const now = Date.now();

    // Reminders: consultations starting within the chosen hours.
    if (settings.reminder.enabled) {
      const { data } = await db()
        .from("leads")
        .select("*")
        .eq("org_id", o.id)
        .is("reminder_sent_at", null)
        .gt("appointment_at", new Date(now).toISOString())
        .lte("appointment_at", new Date(now + settings.reminder.hoursBefore * 3600_000).toISOString())
        .limit(50);
      for (const r of data ?? []) {
        const l = toLead(r);
        if (!l.email || !l.appointmentAt) continue;
        try {
          const text = [
            `Dear ${l.firstName || leadName(l)},`,
            "",
            `This is a reminder of your consultation with ${firm} on ${whenText(l.appointmentAt, tz)}.`,
            l.appointmentLocation ? `Where: ${l.appointmentLocation}` : "",
            "",
            "If you need to change the time, please reply to this email or call our office.",
          ]
            .filter((x, i, a) => x !== "" || a[i - 1] !== "")
            .join("\n");
          await sendAs(o.id, l.appointmentWith ?? sender, l.email, `Reminder: your consultation with ${firm}`, text, "lead_reminder");
          out.reminders++;
        } catch (e) {
          out.errors++;
          console.error("Lead reminder failed:", e);
        }
        await db().from("leads").update({ reminder_sent_at: new Date().toISOString() }).eq("id", l.id);
      }
    }

    // Follow-ups: forms received (or links sent) with no consultation booked yet.
    if (settings.followup.enabled) {
      const cutoff = now - settings.followup.afterDays * 86400_000;
      const { data } = await db()
        .from("leads")
        .select("*")
        .eq("org_id", o.id)
        .in("status", ["new", "invited"])
        .is("appointment_at", null)
        .lt("followups_sent", settings.followup.maxCount)
        .neq("email", "")
        .limit(50);
      for (const r of data ?? []) {
        const l = toLead(r);
        const since = Date.parse(l.lastFollowupAt ?? l.submittedAt ?? l.createdAt);
        if (!(since < cutoff)) continue;
        try {
          const invited = l.status === "invited" && !l.submittedAt;
          const link = invited ? await inviteLinkFor(o.id, l.id) : settings.booking.enabled && settings.booking.staffId ? await bookingUrl(o.id, l.id) : null;
          const text = [
            `Dear ${l.firstName || leadName(l)},`,
            "",
            settings.followup.message,
            "",
            invited
              ? `If you'd still like our help, please fill in our short intake form:\n${link}`
              : link
                ? `You can pick a time for your consultation here:\n${link}`
                : "Please reply to this email or call our office and we'll set up a time to talk.",
          ].join("\n");
          await sendAs(o.id, sender, l.email, invited ? `Your intake form for ${firm}` : `Following up from ${firm}`, text, "lead_followup");
          await db().from("leads").update({ followups_sent: l.followupsSent + 1, last_followup_at: new Date().toISOString() }).eq("id", l.id);
          out.followups++;
        } catch (e) {
          out.errors++;
          console.error("Lead follow-up failed:", e);
          await db().from("leads").update({ last_followup_at: new Date().toISOString() }).eq("id", l.id); // try again after the wait, not every hour
        }
      }
    }
  }
  return out;
}

async function inviteLinkFor(orgId: string, leadId: string) {
  const { inviteUrl } = await import("@/lib/data/leads");
  return inviteUrl(orgId, leadId);
}
