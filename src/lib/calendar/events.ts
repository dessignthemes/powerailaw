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

export type NewEvent = {
  title: string;
  allDay: boolean;
  start: string; // ISO datetime (timed) or YYYY-MM-DD (all-day)
  end: string; // ISO datetime (timed) or YYYY-MM-DD, exclusive (all-day)
  location?: string | null;
  notes?: string | null;
};

async function postJson<T>(url: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 401) throw new MailError("reconnect", "Your calendar connection has expired. Reconnect, then try again.");
  if (res.status === 403)
    throw new MailError("missing_scope", "LawPower isn't allowed to add events to this calendar. Reconnect and allow calendar access, then try again.");
  if (!res.ok) {
    console.error("Calendar create error", res.status);
    throw new MailError("provider_error", "The calendar service couldn't save the event. Please try again.");
  }
  return res.json() as Promise<T>;
}

// Creates the event in the person's own Outlook or Google calendar.
export async function createSyncedEvent(userId: string, provider: MailProvider, e: NewEvent): Promise<SyncedEvent> {
  const { token } = await getAccessToken(userId, provider, "calendar");
  if (provider === "google") {
    const created = await postJson<GEvent>("https://www.googleapis.com/calendar/v3/calendars/primary/events", token, {
      summary: e.title,
      location: e.location || undefined,
      description: e.notes || undefined,
      start: e.allDay ? { date: e.start } : { dateTime: e.start, timeZone: "UTC" },
      end: e.allDay ? { date: e.end } : { dateTime: e.end, timeZone: "UTC" },
    });
    return {
      id: `g:${created.id}`,
      provider,
      title: created.summary?.trim() || e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      location: created.location ?? e.location ?? null,
      link: created.htmlLink ?? null,
    };
  }
  const iso = (v: string) => v.replace(/Z$/, "").replace(/\.\d+$/, "");
  const created = await postJson<MEvent>("https://graph.microsoft.com/v1.0/me/events", token, {
    subject: e.title,
    isAllDay: e.allDay,
    start: { dateTime: e.allDay ? `${e.start}T00:00:00` : iso(e.start), timeZone: "UTC" },
    end: { dateTime: e.allDay ? `${e.end}T00:00:00` : iso(e.end), timeZone: "UTC" },
    ...(e.location ? { location: { displayName: e.location } } : {}),
    ...(e.notes ? { body: { contentType: "text", content: e.notes } } : {}),
  });
  return {
    id: `m:${created.id}`,
    provider,
    title: created.subject?.trim() || e.title,
    start: e.start,
    end: e.end,
    allDay: e.allDay,
    location: created.location?.displayName || e.location || null,
    link: created.webLink ?? null,
  };
}

export type EventDetail = SyncedEvent & {
  notes: string | null; // plain text
  organizer: string | null;
  attendees: { name: string | null; email: string; response: string | null }[];
  joinUrl: string | null;
};

const EVENT_ID = /^[A-Za-z0-9=_+/-]{1,1024}$/;

function stripHtml(html: string) {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function calFetch(url: string, token: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }, cache: "no-store" });
  if (res.status === 401) throw new MailError("reconnect", "Your calendar connection has expired. Reconnect, then try again.");
  if (res.status === 403) throw new MailError("missing_scope", "LawPower isn't allowed to do that on this calendar. Reconnect and allow calendar access.");
  if (res.status === 404 || res.status === 410) throw new MailError("provider_error", "This event no longer exists in the calendar.");
  if (!res.ok) {
    console.error("Calendar API error", res.status);
    throw new MailError("provider_error", "The calendar service didn't respond as expected. Please try again.");
  }
  return res;
}

// One event's full details from the person's own Outlook / Google calendar.
export async function getEventDetail(userId: string, provider: MailProvider, rawId: string): Promise<EventDetail> {
  if (!EVENT_ID.test(rawId)) throw new MailError("provider_error", "This event no longer exists in the calendar.");
  const { token } = await getAccessToken(userId, provider, "calendar");
  const id = encodeURIComponent(rawId);
  if (provider === "google") {
    const e = (await (await calFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}`, token)).json()) as GEvent & {
      description?: string;
      hangoutLink?: string;
      organizer?: { email?: string; displayName?: string };
      attendees?: { email: string; displayName?: string; responseStatus?: string }[];
      conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
    };
    const allDay = !!e.start?.date;
    return {
      id: `g:${e.id}`,
      provider,
      title: e.summary?.trim() || "(no title)",
      start: allDay ? e.start!.date! : e.start!.dateTime!,
      end: allDay ? e.end?.date ?? e.start!.date! : e.end?.dateTime ?? e.start!.dateTime!,
      allDay,
      location: e.location ?? null,
      link: e.htmlLink ?? null,
      notes: e.description ? stripHtml(e.description) : null,
      organizer: e.organizer?.displayName || e.organizer?.email || null,
      attendees: (e.attendees ?? []).map((a) => ({ name: a.displayName ?? null, email: a.email, response: a.responseStatus ?? null })),
      joinUrl: e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null,
    };
  }
  const e = (await (
    await calFetch(
      `https://graph.microsoft.com/v1.0/me/events/${id}?$select=id,subject,isAllDay,start,end,location,webLink,body,organizer,attendees,onlineMeeting`,
      token,
      { headers: { Prefer: 'outlook.timezone="UTC", outlook.body-content-type="text"' } }
    )
  ).json()) as MEvent & {
    body?: { content?: string };
    organizer?: { emailAddress?: { name?: string; address?: string } };
    attendees?: { emailAddress?: { name?: string; address?: string }; status?: { response?: string } }[];
    onlineMeeting?: { joinUrl?: string } | null;
  };
  const s = e.start?.dateTime ?? "";
  const en = e.end?.dateTime ?? s;
  const allDay = !!e.isAllDay;
  return {
    id: `m:${e.id}`,
    provider,
    title: e.subject?.trim() || "(no title)",
    start: allDay ? s.slice(0, 10) : `${s.replace(/\.\d+$/, "")}Z`,
    end: allDay ? en.slice(0, 10) : `${en.replace(/\.\d+$/, "")}Z`,
    allDay,
    location: e.location?.displayName || null,
    link: e.webLink ?? null,
    notes: e.body?.content?.trim() ? e.body.content.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : null,
    organizer: e.organizer?.emailAddress?.name || e.organizer?.emailAddress?.address || null,
    attendees: (e.attendees ?? [])
      .filter((a) => a.emailAddress?.address)
      .map((a) => ({ name: a.emailAddress?.name ?? null, email: a.emailAddress!.address!, response: a.status?.response ?? null })),
    joinUrl: e.onlineMeeting?.joinUrl ?? null,
  };
}

// Deletes the event from the person's own Outlook / Google calendar.
export async function deleteSyncedEvent(userId: string, provider: MailProvider, rawId: string): Promise<void> {
  if (!EVENT_ID.test(rawId)) throw new MailError("provider_error", "This event no longer exists in the calendar.");
  const { token } = await getAccessToken(userId, provider, "calendar");
  const id = encodeURIComponent(rawId);
  const url =
    provider === "google" ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}` : `https://graph.microsoft.com/v1.0/me/events/${id}`;
  await calFetch(url, token, { method: "DELETE" });
}

export type EventChanges = {
  title: string;
  allDay: boolean;
  start: string; // ISO (timed) or YYYY-MM-DD (all-day)
  end: string; // ISO (timed) or YYYY-MM-DD exclusive (all-day)
  location: string | null;
  notes?: string | null; // only sent when changed, so formatted notes aren't flattened
};

// Saves changes to an event in the person's own Outlook / Google calendar.
export async function updateSyncedEvent(userId: string, provider: MailProvider, rawId: string, c: EventChanges): Promise<EventDetail> {
  if (!EVENT_ID.test(rawId)) throw new MailError("provider_error", "This event no longer exists in the calendar.");
  const { token } = await getAccessToken(userId, provider, "calendar");
  const id = encodeURIComponent(rawId);
  const json = { "Content-Type": "application/json" };
  if (provider === "google") {
    await calFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}`, token, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({
        summary: c.title,
        location: c.location ?? "",
        ...(c.notes !== undefined ? { description: c.notes ?? "" } : {}),
        start: c.allDay ? { date: c.start, dateTime: null } : { dateTime: c.start, timeZone: "UTC", date: null },
        end: c.allDay ? { date: c.end, dateTime: null } : { dateTime: c.end, timeZone: "UTC", date: null },
      }),
    });
  } else {
    const iso = (v: string) => v.replace(/Z$/, "").replace(/\.\d+$/, "");
    await calFetch(`https://graph.microsoft.com/v1.0/me/events/${id}`, token, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({
        subject: c.title,
        isAllDay: c.allDay,
        start: { dateTime: c.allDay ? `${c.start}T00:00:00` : iso(c.start), timeZone: "UTC" },
        end: { dateTime: c.allDay ? `${c.end}T00:00:00` : iso(c.end), timeZone: "UTC" },
        location: { displayName: c.location ?? "" },
        ...(c.notes !== undefined ? { body: { contentType: "text", content: c.notes ?? "" } } : {}),
      }),
    });
  }
  return getEventDetail(userId, provider, rawId);
}
