import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentPortalUser, logEvent, firmName, PortalError } from "@/lib/portal/server";
import { normalizeProfile, coreFields, portalIntakeOf, mergePortalIntake, peopleFromName, type CardType } from "@/lib/clients/card";

// "Complete intake sheet" in the client portal: the client sees their own details
// from the client card and can fill in or correct them; saving updates the card.

const db = () => createAdminClient();

async function loadClient() {
  const u = await currentPortalUser();
  if (u.kind === "party" || !u.client_id) throw new PortalError(403, "The intake sheet is for clients.");
  const { data, error } = await db().from("clients").select("*").eq("id", u.client_id).eq("org_id", u.org_id).maybeSingle();
  if (error) throw error;
  if (!data) throw new PortalError(404, "We couldn't find your details. Please contact your law firm.");
  const c = data as { id: string; name: string; email?: string | null; phone?: string | null; card_type?: string | null; profile?: unknown };
  const type: CardType = c.card_type === "company" ? "company" : "person";
  const profile = normalizeProfile(c.profile ?? {});
  // A client the firm added before client cards existed: start from their name/email/phone.
  if (!c.profile && type === "person") {
    const people = peopleFromName(c.name ?? "");
    if (people.length) profile.people = people;
    profile.people[0].contacts = profile.people[0].contacts.map((l) =>
      l.kind === "Email" && c.email ? { ...l, value: c.email } : l.kind === "Phone" && c.phone ? { ...l, value: c.phone } : l
    );
  }
  return { u, client: c, type, profile };
}

export async function getPortalIntake() {
  const { u, type, profile } = await loadClient();
  const { data: last } = await db()
    .from("client_portal_events")
    .select("at")
    .eq("portal_user_id", u.id)
    .eq("type", "intake_updated")
    .order("at", { ascending: false })
    .limit(1);
  return { firm: await firmName(u.org_id), intake: portalIntakeOf(type, profile), lastSavedAt: (last?.[0]?.at as string | undefined) ?? null };
}

export async function savePortalIntake(raw: unknown) {
  const { u, client, type, profile } = await loadClient();
  const next = mergePortalIntake(type, profile, raw);
  const core = coreFields(type, next);
  if (!core.name) throw new PortalError(400, type === "company" ? "Please enter the company name." : "Please enter at least your first or last name.");
  const { error } = await db()
    .from("clients")
    .update({ ...core, card_type: type, profile: next, updated_at: new Date().toISOString() })
    .eq("id", client.id)
    .eq("org_id", u.org_id);
  if (error) throw error;
  await logEvent(u, "intake_updated").catch(() => null); // before 0034: not recorded, still saved
  return getPortalIntake();
}
