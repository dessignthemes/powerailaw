import { NoWorkspaceError } from "@/lib/data/org";
import { NextResponse, after } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/data/org";
import { runForClient } from "@/lib/conflicts/check";
import { listClients, createClientRow, deleteClientRows } from "@/lib/data/clients";
import type { Client } from "@/components/NewClientModal";

export const dynamic = "force-dynamic";
export const maxDuration = 90; // the new client's conflict check runs after the reply

export async function GET() {
  try {
    const clients = await listClients();
    return NextResponse.json({ clients });
  } catch (error) {
    if (error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("GET /api/clients failed:", error);
    return NextResponse.json({ error: "Failed to load clients" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const client = (await request.json()) as Client;
    const created = await createClientRow(client);
    // A new client: check them against every matter (in the background).
    const [user, orgId] = await Promise.all([getSessionUser(), getCurrentOrgId()]);
    after(() => runForClient(orgId, user?.id ?? null, user?.email ?? null, created.id).catch((e) => console.error("Conflict check for new client failed:", e)));
    return NextResponse.json({ client: created }, { status: 201 });
  } catch (error) {
    if (error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("POST /api/clients failed:", error);
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { ids } = (await request.json()) as { ids: string[] };
    await deleteClientRows(ids);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("DELETE /api/clients failed:", error);
    return NextResponse.json({ error: "Failed to delete clients" }, { status: 500 });
  }
}
