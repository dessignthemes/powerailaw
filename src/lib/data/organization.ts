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
  const { data, error } = await createAdminClient()
    .from("organizations")
    .select("name, url_slug, timezone, logo_url")
    .eq("id", a.orgId)
    .single();
  if (error) throw error;
  return {
    name: realName(data.name),
    urlSlug: data.url_slug ?? "",
    timezone: data.timezone || "America/New_York",
    logoUrl: data.logo_url ?? null,
    canEdit: a.canEdit,
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
  const slugRaw = typeof input.urlSlug === "string" ? input.urlSlug.trim().toLowerCase() : "";
  if (slugRaw && !/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(slugRaw)) {
    throw new OrgError(400, "The URL slug can use lowercase letters, numbers and dashes (for example smith-law).");
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
    if (error.code === "23505") throw new OrgError(409, "That URL slug is already taken. Try another one.");
    throw error;
  }
  return getOrgSettings();
}
