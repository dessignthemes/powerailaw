import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth";

// The signed-in person's workspace details (Settings → General).

export class OrgError extends Error {
  constructor(public status: 400 | 401 | 403 | 409, message: string) {
    super(message);
  }
}

export type OrgSettings = {
  name: string; // empty until the firm sets it
  urlSlug: string;
  timezone: string;
  logoUrl: string | null;
  canEdit: boolean;
  practiceAreas: Record<string, "handle" | "decline">; // areas not listed are "Not set"
  scopeNotes: string;
  practiceReady: boolean; // false until migration 0060 is run
};

const MAX_LOGO_CHARS = 300_000; // a resized logo as a data URL is far smaller

// New workspaces are created with the person's email (or a stock name) as a
// placeholder. Those aren't real firm names, so the form shows them empty.
function realName(name: string | null | undefined) {
  const n = (name ?? "").trim();
  if (!n || n.includes("@") || /^my (workspace|firm)$/i.test(n)) return "";
  return n;
}

async function actor() {
  const user = await getSessionUser();
  if (!user) throw new OrgError(401, "Please sign in again.");
  const { data } = await createAdminClient().from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!data) throw new OrgError(403, "Your account isn't set up yet. Please sign out and sign in again.");
  return { orgId: data.org_id as string, canEdit: data.role === "owner" || data.role === "admin" };
}

export async function getOrgSettings(): Promise<OrgSettings> {
  const a = await actor();
  const s = createAdminClient();
  const { data, error } = await s.from("organizations").select("name, url_slug, timezone, logo_url").eq("id", a.orgId).single();
  if (error) throw error;
  // Practice areas (migration 0060): read separately so the rest works without it.
  const pa = await s.from("organizations").select("practice_areas").eq("id", a.orgId).single();
  const raw = (pa.error ? null : (pa.data as { practice_areas?: { areas?: Record<string, string>; notes?: string } | null }).practice_areas) ?? {};
  const practiceAreas: Record<string, "handle" | "decline"> = {};
  for (const [k, v] of Object.entries(raw.areas ?? {})) if (v === "handle" || v === "decline") practiceAreas[k] = v;
  return {
    name: realName(data.name),
    urlSlug: data.url_slug ?? "",
    timezone: data.timezone || "America/New_York",
    logoUrl: data.logo_url ?? null,
    canEdit: a.canEdit,
    practiceAreas,
    scopeNotes: typeof raw.notes === "string" ? raw.notes : "",
    practiceReady: !pa.error,
  };
}

function validTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function updateOrgSettings(input: { name?: unknown; urlSlug?: unknown; timezone?: unknown; logoUrl?: unknown }) {
  const a = await actor();
  if (!a.canEdit) throw new OrgError(403, "Only the workspace owner or an admin can change the firm details.");

  const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
  // The firm's website (kept in the url_slug column), e.g. www.rapciewiczlaw.com.
  const slugRaw = typeof input.urlSlug === "string" ? input.urlSlug.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "") : "";
  const website = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(\/[^\s]*)?$/;
  const oldSlug = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/; // values saved before this became "Firm website"
  if (slugRaw && (slugRaw.length > 120 || !(website.test(slugRaw) || oldSlug.test(slugRaw)))) {
    throw new OrgError(400, "Enter the firm's website address, for example www.rapciewiczlaw.com.");
  }
  const timezone = typeof input.timezone === "string" && validTimezone(input.timezone) ? input.timezone : null;
  if (!timezone) throw new OrgError(400, "Choose a valid time zone.");

  let logo: string | null | undefined;
  if (input.logoUrl === null) logo = null;
  else if (typeof input.logoUrl === "string") {
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.logoUrl) || input.logoUrl.length > MAX_LOGO_CHARS) {
      throw new OrgError(400, "The logo couldn't be saved. Use a PNG, JPEG or WebP image up to 2 MB.");
    }
    logo = input.logoUrl;
  }

  const update: Record<string, unknown> = { name, url_slug: slugRaw || null, timezone };
  if (logo !== undefined) update.logo_url = logo;
  const { error } = await createAdminClient().from("organizations").update(update).eq("id", a.orgId);
  if (error) {
    if (error.code === "23505") throw new OrgError(409, "Another LawPower workspace already uses that website address.");
    throw error;
  }
  return getOrgSettings();
}

// Practice areas and scope notes (Settings → General): owner or admin.
export async function updatePracticeAreas(input: { practiceAreas?: unknown; scopeNotes?: unknown }) {
  const a = await actor();
  if (!a.canEdit) throw new OrgError(403, "Only the workspace owner or an admin can change the practice areas.");
  const areas: Record<string, "handle" | "decline"> = {};
  if (input.practiceAreas && typeof input.practiceAreas === "object") {
    for (const [k, v] of Object.entries(input.practiceAreas as Record<string, unknown>).slice(0, 60)) {
      const name = k.trim().slice(0, 60);
      if (name && (v === "handle" || v === "decline")) areas[name] = v;
    }
  }
  const notes = typeof input.scopeNotes === "string" ? input.scopeNotes.trim().slice(0, 2000) : "";
  const { error } = await createAdminClient().from("organizations").update({ practice_areas: { areas, notes } }).eq("id", a.orgId);
  if (error) {
    if (/practice_areas/.test(error.message ?? "") || error.code === "42703" || error.code === "PGRST204") {
      throw new OrgError(400, "Practice areas need a database update first (migration 0060).");
    }
    throw error;
  }
  return getOrgSettings();
}
