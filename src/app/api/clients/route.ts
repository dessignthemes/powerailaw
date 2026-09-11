import { NextResponse } from "next/server";
import { listClients, createClientRow, deleteClientRows } from "@/lib/data/clients";
import type { Client } from "@/components/NewClientModal";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const clients = await listClients();
    return NextResponse.json({ clients });
  } catch (error) {
    console.error("GET /api/clients failed:", error);
    return NextResponse.json({ error: "Failed to load clients" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const client = (await request.json()) as Client;
    const created = await createClientRow(client);
    return NextResponse.json({ client: created }, { status: 201 });
  } catch (error) {
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
    console.error("DELETE /api/clients failed:", error);
    return NextResponse.json({ error: "Failed to delete clients" }, { status: 500 });
  }
}
