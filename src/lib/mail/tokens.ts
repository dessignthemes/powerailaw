import "server-only";
import { getUserConnections, updateConnectionTokens, type ConnectionRow } from "@/lib/data/oauth";
import type { MailProvider } from "@/lib/mail/types";
import { scopesFromMicrosoftToken } from "@/lib/mail/microsoftScopes";

export class MailError extends Error {
  constructor(
    public code: "not_connected" | "reconnect" | "missing_scope" | "provider_error",
    message: string
  ) {
    super(message);
  }
}

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.modify"];
const GMAIL_MODIFY = "https://www.googleapis.com/auth/gmail.modify";

// Can LawPower change read / unread in this mailbox? (Reconnected with the newer permission.)
// Allowed to send email from this mailbox (Outlook Mail.Send / Gmail gmail.send).
export function canSend(conn: Pick<ConnectionRow, "provider" | "scopes">) {
  return conn.provider === "google"
    ? conn.scopes.some((s) => /gmail\.send$|gmail\.compose$|^https:\/\/mail\.google\.com\/?$/.test(s))
    : conn.scopes.some((s) => /(^|\/)Mail\.Send$/i.test(s));
}

export function canSyncRead(conn: Pick<ConnectionRow, "provider" | "scopes">) {
  return conn.provider === "google"
    ? conn.scopes.includes(GMAIL_MODIFY)
    : conn.scopes.some((s) => /(^|\/)Mail\.ReadWrite$/i.test(s));
}
const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.events.readonly",
];

export type AccessNeed = "mail" | "calendar";

export function hasGoogleScope(scopes: string[], need: AccessNeed) {
  if (scopes.length === 0) return true; // unknown (older connection): let the API decide
  return need === "mail" ? scopes.some((s) => GMAIL_SCOPES.includes(s)) : scopes.some((s) => GOOGLE_CALENDAR_SCOPES.includes(s));
}

export function canRefresh(provider: MailProvider) {
  return provider === "google"
    ? !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    : !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

async function refresh(conn: ConnectionRow): Promise<string> {
  if (!conn.refresh_token || !canRefresh(conn.provider)) {
    throw new MailError("reconnect", "Your mailbox connection has expired. Reconnect to keep reading mail.");
  }

  const body =
    conn.provider === "google"
      ? new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: conn.refresh_token,
          grant_type: "refresh_token",
        })
      : new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID!,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
          refresh_token: conn.refresh_token,
          grant_type: "refresh_token",
          // Ask for what this connection was granted, or the renewal fails / loses access.
          // Mail.ReadWrite only once the person reconnected and approved it.
          scope: `offline_access User.Read ${canSyncRead(conn) ? "Mail.ReadWrite" : "Mail.Read"} Calendars.ReadWrite Files.Read${
            conn.scopes.some((x) => /(^|\/)Contacts\.Read$/i.test(x)) ? " Contacts.Read" : ""
          }${canSend(conn) ? " Mail.Send" : ""}`,
        });

  const url =
    conn.provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || "common"}/oauth2/v2.0/token`;

  const res = await fetch(url, { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    console.error(`Token refresh failed for ${conn.provider}:`, data?.error, data?.error_description);
    throw new MailError("reconnect", "Your mailbox connection has expired. Reconnect to keep reading mail.");
  }

  const expiresAt = new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000 - 60_000).toISOString();
  await updateConnectionTokens(conn.id, {
    access_token: data.access_token,
    expires_at: expiresAt,
    ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
    // Outlook: record what the renewed token allows (fixes connections saved without it).
    ...(conn.provider === "microsoft" && scopesFromMicrosoftToken(data.access_token).length
      ? { scopes: scopesFromMicrosoftToken(data.access_token) }
      : {}),
  });
  return data.access_token as string;
}

// Returns a usable access token for this user's mailbox, refreshing it if needed.
export async function getAccessToken(
  userId: string,
  provider: MailProvider,
  need: AccessNeed = "mail"
): Promise<{ token: string; email: string | null; canSync: boolean }> {
  const conn = (await getUserConnections(userId)).find((c) => c.provider === provider);
  if (!conn) throw new MailError("not_connected", "No account connected yet.");

  if (provider === "google" && !hasGoogleScope(conn.scopes, need)) {
    throw new MailError(
      "missing_scope",
      need === "mail"
        ? "Gmail access wasn't granted. Reconnect and keep the Gmail box ticked on Google's consent screen."
        : "Google Calendar access wasn't granted. Reconnect and keep the Google Calendar box ticked on Google's consent screen."
    );
  }

  const fresh = conn.expires_at && new Date(conn.expires_at).getTime() > Date.now() + 60_000;
  const token = fresh ? conn.access_token : await refresh(conn);
  return { token, email: conn.account_email, canSync: canSyncRead(conn) };
}

export async function connectionStatus(userId: string) {
  const conns = await getUserConnections(userId);
  return conns.map((c) => {
    const fresh = !!c.expires_at && new Date(c.expires_at).getTime() > Date.now() + 60_000;
    let status: "ok" | "reconnect" | "missing_scope" = "ok";
    if (c.provider === "google" && !hasGoogleScope(c.scopes, "mail")) status = "missing_scope";
    else if (!fresh && !(c.refresh_token && canRefresh(c.provider))) status = "reconnect";
    return {
      provider: c.provider,
      email: c.account_email,
      status,
      autoRefresh: !!c.refresh_token && canRefresh(c.provider),
      syncsRead: canSyncRead(c), // read / unread kept in step with Outlook / Gmail
      canSend: canSend(c), // can send email from LawPower through this mailbox
    };
  });
}
