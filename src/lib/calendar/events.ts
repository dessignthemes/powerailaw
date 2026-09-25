import "server-only";
import { MailError, getAccessToken, hasGoogleScope } from "@/lib/mail/tokens";
import { getUserConnections } from "@/lib/data/oauth";
import type { MailProvider } from "@/lib/mail/types";

export type SyncedEvent = {
  id: string;
  provider: MailProvider;
  title: string;
  start: string; // ISO datetime, or YYYY-MM-DD for all-day
  end: string; // ISO datetime, or YYYY-MM-DD (exclusive) for all-day
  allDay: boolean;
  location: string | null;
  link: string | null;
};

const MAX = 250;

async function getJson<T>(url: string, token: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, ...headers }, cache: "no-store" });
  if (res.status === 401) throw new MailError("reconnect", "Your calendar connection has expired. Reconnect to keep syncing.");
  if (res.status === 403) throw new MailError("missing_scope", "Calendar access wasn't granted. Reconnect and allow calendar access.");
  if (!res.ok) {
    console.error("Calendar API error", res.status);
    throw new MailError("provider_error", "The calendar service didn't respond as expected. Please try again.");
  }
  return res.json() as Promise<T>;
}

type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

export async function googleEvents(token: string, from: string, to: string): Promise<SyncedEvent[]> {
  const params = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: "true", orderBy: "startTime", maxResults: String(MAX) });
  const d = await getJson<{ items?: GEvent[] }>(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, token);
  return (d.items ?? [])
    .filter((e) => e.status !== "cancelled" && (e.start?.date || e.start?.dateTime))
    .map((e) => {
      const allDay = !!e.start?.date;
      return {
        id: `g:${e.id}`,
        provider: "google" as const,
        title: e.summary?.trim() || "(no title)",
        start: allDay ? e.start!.date! : e.start!.dateTime!,
        end: allDay ? e.end?.date ?? e.start!.date! : e.end?.dateTime ?? e.start!.dateTime!,
        allDay,
        location: e.location ?? null,
        link: e.htmlLink ?? null,
      };
    });
}

type MEvent = {
  id: string;
  subject?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  webLink?: string;
  location?: { displayName?: string };
  start?: { dateTime?: string };
  end?: { dateTime?: string };
};

export async function outlookEvents(token: string, from: string, to: string): Promise<SyncedEvent[]> {
  const params = new URLSearchParams({
    startDateTime: from,
    endDateTime: to,
    $top: String(MAX),
    $orderby: "start/dateTime",
    $select: "id,subject,isAllDay,isCancelled,webLink,location,start,end",
  });
  // Ask Graph for UTC so times convert correctly in the browser.
  const d = await getJson<{ value?: MEvent[] }>(`https://graph.microsoft.com/v1.0/me/calendarView?${params}`, token, {
    Prefer: 'outlook.timezone="UTC"',
  });
  return (d.value ?? [])
    .filter((e) => !e.isCancelled && e.start?.dateTime)
    .map((e) => {
      const allDay = !!e.isAllDay;
      const s = e.start!.dateTime!;
      const en = e.end?.dateTime ?? s;
      return {
        id: `m:${e.id}`,
        provider: "microsoft" as const,
        title: e.subject?.trim() || "(no title)",
        start: allDay ? s.slice(0, 10) : `${s.replace(/\.\d+$/, "")}Z`,
        end: allDay ? en.slice(0, 10) : `${en.replace(/\.\d+$/, "")}Z`,
        allDay,
        location: e.location?.displayName || null,
        link: e.webLink ?? null,
      };
    });
}

export type CalendarSource = {
  provider: MailProvider;
  email: string | null;
  status: "ok" | "reconnect" | "missing_scope" | "error";
  message?: string;
};

// Events from every calendar this user has connected, for [from, to).
export async function syncedEvents(userId: string, from: string, to: string) {
  const conns = await getUserConnections(userId);
  const sources: CalendarSource[] = [];
  const events: SyncedEvent[] = [];
  await Promise.all(
    conns.map(async (c) => {
      if (c.provider === "google" && !hasGoogleScope(c.scopes, "calendar")) {
        sources.push({ provider: c.provider, email: c.account_email, status: "missing_scope", message: "Google Calendar access wasn't granted." });
        return;
      }
      try {
        const { token } = await getAccessToken(userId, c.provider, "calendar");
        const list = c.provider === "google" ? await googleEvents(token, from, to) : await outlookEvents(token, from, to);
        events.push(...list);
        sources.push({ provider: c.provider, email: c.account_email, status: "ok" });
      } catch (e) {
        const code = e instanceof MailError ? e.code : "provider_error";
        sources.push({
          provider: c.provider,
          email: c.account_email,
          status: code === "reconnect" ? "reconnect" : code === "missing_scope" ? "missing_scope" : "error",
          message: e instanceof MailError ? e.message : "Couldn't load this calendar.",
        });
      }
    })
  );
  events.sort((a, b) => (a.start < b.start ? -1 : 1));
  return { events, sources };
}
