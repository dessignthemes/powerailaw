import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCurrentOrgId, NoWorkspaceError } from "@/lib/data/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { IntegrationError, listOrgIntegrations, removeOrgIntegration, saveOrgIntegration, verifyDropboxSignKey, type OrgProvider } from "@/lib/integrations/store";
import { getStatus as dropboxStatus } from "@/lib/dropbox/client";

export const dynamic = "force-dynamic";

function fail(where: string, e: unknown) {
  if (e instanceof IntegrationError || e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`${where} failed:`, e);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
async function canManage(orgId: string, userId: string) {
  const { data } = await createAdminClient().from("profiles").select("role").eq("org_id", orgId).eq("id", userId).maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  return role === "owner" || role === "admin";
}

// GET → { items (firm-wide keys: provider, account), ready, dropbox (this person's Dropbox), quickbooksConfigured, canManage }
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const orgId = await getCurrentOrgId();
    const [list, dropbox, manage] = await Promise.all([listOrgIntegrations(orgId), dropboxStatus(user.id).catch(() => ({ configured: false as const })), canManage(orgId, user.id)]);
    return NextResponse.json({ ...list, dropbox, quickbooksConfigured: !!(process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET), canManage: manage });
  } catch (e) {
    return fail("GET /api/integrations", e);
  }
}

// POST { provider: "dropbox_sign" | "dropbox_fax", apiKey } — connect with an API key (owner / admin).
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const orgId = await getCurrentOrgId();
    if (!(await canManage(orgId, user.id))) throw new IntegrationError(403, "Only the workspace owner or an admin can connect firm-wide services.");
    const b = (await request.json().catch(() => ({}))) as { provider?: string; apiKey?: string };
    const provider = b.provider as OrgProvider;
    if (provider !== "dropbox_sign" && provider !== "dropbox_fax") throw new IntegrationError(400, "That service can't be connected with a key.");
    const apiKey = String(b.apiKey ?? "").trim();
    if (!/^[A-Za-z0-9]{20,128}$/.test(apiKey)) throw new IntegrationError(400, "That doesn't look like a Dropbox Sign API key.");
    const acct = await verifyDropboxSignKey(apiKey);
    await saveOrgIntegration(orgId, user.id, provider, apiKey, { email: acct.email, accountId: acct.accountId });
    return NextResponse.json({ ok: true, email: acct.email });
  } catch (e) {
    return fail("POST /api/integrations", e);
  }
}

// DELETE ?provider= — disconnect (owner / admin). The key is deleted.
export async function DELETE(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const orgId = await getCurrentOrgId();
    if (!(await canManage(orgId, user.id))) throw new IntegrationError(403, "Only the workspace owner or an admin can disconnect firm-wide services.");
    const provider = new URL(request.url).searchParams.get("provider") as OrgProvider;
    if (!["dropbox_sign", "dropbox_fax", "quickbooks", "remarkable"].includes(provider)) throw new IntegrationError(400, "Unknown service.");
    await removeOrgIntegration(orgId, provider);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail("DELETE /api/integrations", e);
  }
}
