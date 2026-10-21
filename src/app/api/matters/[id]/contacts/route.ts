import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCurrentOrgId, NoWorkspaceError } from "@/lib/data/org";
import { listMatterContacts, addMatterContact, updateMatterContact, removeMatterContact, MatterContactError } from "@/lib/data/matterContacts";

export const dynamic = "force-dynamic";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

function fail(where: string, e: unknown) {
  if (e instanceof MatterContactError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`${where} failed:`, e);
  return NextResponse.json({ error: "Something went wrong with the matter's contacts. Please try again." }, { status: 500 });
}

async function ctx(params: Promise<{ id: string }>) {
  const user = await getSessionUser();
  if (!user) throw new MatterContactError("Please sign in again.", 401);
  const { id } = await params;
  if (!isId(id)) throw new MatterContactError("That matter wasn't found.", 404);
  return { userId: user.id, orgId: await getCurrentOrgId(), matterId: id };
}

// GET → the matter's contacts. POST { contactId | clientId | newContact, role } → add one.
// PATCH { linkId, role?, portalAccess? } → change a role, or whether a linked client sees it in their portal. DELETE ?linkId= → take someone off the matter.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { orgId, matterId } = await ctx(params);
    return NextResponse.json({ contacts: await listMatterContacts(orgId, matterId) });
  } catch (e) {
    return fail("GET /api/matters/[id]/contacts", e);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { orgId, userId, matterId } = await ctx(params);
    return NextResponse.json({ contact: await addMatterContact(orgId, userId, matterId, await request.json().catch(() => ({}))) }, { status: 201 });
  } catch (e) {
    return fail("POST /api/matters/[id]/contacts", e);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { orgId } = await ctx(params);
    const b = (await request.json().catch(() => ({}))) as { linkId?: unknown; role?: unknown; portalAccess?: unknown };
    if (!isId(b.linkId)) throw new MatterContactError("Nothing to change.");
    await updateMatterContact(orgId, b.linkId, { role: b.role, portalAccess: b.portalAccess });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail("PATCH /api/matters/[id]/contacts", e);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { orgId } = await ctx(params);
    const linkId = new URL(request.url).searchParams.get("linkId");
    if (!isId(linkId)) throw new MatterContactError("Nothing to remove.");
    await removeMatterContact(orgId, linkId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail("DELETE /api/matters/[id]/contacts", e);
  }
}
