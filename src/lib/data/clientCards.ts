import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { getCurrentOrgId, NoWorkspaceError } from "@/lib/data/org";
import { coreFields, normalizeProfile, type CardType, type Profile } from "@/lib/clients/card";

export const CARDS_MIGRATION = "0018_client_cards.sql";

export class CardError extends Error {
  constructor(public status: 400 | 404 | 503, message: string, public code?: string) {
    super(message);
  }
}

function missingColumn(e: { code?: string; message?: string } | null) {
  return !!e && (e.code === "42703" || e.code === "PGRST204" || /profile|card_type/.test(e.message ?? ""));
}
const setup = () =>
  new CardError(503, `Client cards need a database update. Run supabase/migrations/${CARDS_MIGRATION} in the Supabase SQL editor, then refresh.`, "setup_required");

export type CardSummary = { id: string; name: string; cardType: CardType; email: string | null; phone: string | null; status: string; updatedAt: string };

export async function listCards(): Promise<CardSummary[]> {
  const orgId = await getCurrentOrgId();
  const { data, error } = await createAdminClient()
    .from("clients")
    .select("id, name, card_type, type, email, phone, status, updated_at")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (error) {
    if (missingColumn(error)) throw setup();
    throw error;
  }
  return (data ?? []).map((r) => ({
    id: r.id, name: r.name, cardType: (r.card_type ?? (r.type === "Legal entity" ? "company" : "person")) as CardType,
    email: r.email, phone: r.phone, status: r.status, updatedAt: r.updated_at,
  }));
}

export async function getCard(id: string) {
  const orgId = await getCurrentOrgId();
  const { data, error } = await createAdminClient()
    .from("clients")
    .select("id, name, card_type, type, email, phone, address, status, profile, updated_at")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (missingColumn(error)) throw setup();
    throw error;
  }
  if (!data) throw new CardError(404, "That client wasn't found.");
  const cardType = (data.card_type ?? "person") as CardType;
  let profile = normalizeProfile(data.profile);
  // Clients created elsewhere (Clients page, AI Agent) start with their basics.
  if (!data.profile || Object.keys(data.profile).length === 0) {
    if (cardType === "company") {
      profile.company.name = data.name;
      profile.company.contacts = [{ kind: "Email", value: data.email ?? "" }, { kind: "Phone", value: data.phone ?? "" }, { kind: "Fax", value: "" }, { kind: "Web", value: "" }];
    } else {
      const parts = String(data.name).trim().split(/\s+/);
      profile.people[0] = { ...profile.people[0], first: parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] ?? "", last: parts.length > 1 ? parts[parts.length - 1] : "" };
      profile.people[0].contacts = [{ kind: "Email", value: data.email ?? "" }, { kind: "Phone", value: "" }, { kind: "Cell", value: data.phone ?? "" }, { kind: "Fax", value: "" }, { kind: "Web", value: "" }];
    }
    if (data.address) profile.address.street.street = data.address;
    profile = normalizeProfile(profile);
  }
  return { id: data.id, cardType, status: data.status as string, profile, updatedAt: data.updated_at as string };
}

const MAX_PROFILE_CHARS = 400_000; // includes a small photo

export async function saveCard(id: string | null, body: { cardType?: unknown; profile?: unknown; status?: unknown }) {
  const orgId = await getCurrentOrgId();
  const cardType: CardType = body.cardType === "company" ? "company" : "person";
  const profile: Profile = normalizeProfile(body.profile);
  if (profile.photo && (!/^data:image\/(png|jpeg|webp);base64,/.test(profile.photo) || profile.photo.length > 300_000)) profile.photo = null;
  if (JSON.stringify(profile).length > MAX_PROFILE_CHARS) throw new CardError(400, "This card is too large to save. Shorten the notes.");
  const core = coreFields(cardType, profile);
  if (!core.name) throw new CardError(400, cardType === "company" ? "Enter the company name." : "Enter at least a first or last name.");

  const row = {
    ...core,
    card_type: cardType,
    profile,
    description: profile.notes.slice(0, 2000),
    ...(body.status === "Active" || body.status === "Archived" ? { status: body.status } : {}),
    updated_at: new Date().toISOString(),
  };
  const s = createAdminClient();
  const q = id
    ? s.from("clients").update(row).eq("org_id", orgId).eq("id", id).select("id").maybeSingle()
    : s.from("clients").insert({ ...row, org_id: orgId }).select("id").single();
  const { data, error } = await q;
  if (error) {
    if (missingColumn(error)) throw setup();
    throw error;
  }
  if (!data) throw new CardError(404, "That client wasn't found.");
  return getCard(data.id);
}

export function cardFail(where: string, error: unknown) {
  if (error instanceof CardError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`${where} failed:`, error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
