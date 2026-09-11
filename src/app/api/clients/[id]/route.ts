import { NextResponse } from "next/server";
import { updateClientRow } from "@/lib/data/clients";
import type { Client } from "@/components/NewClientModal";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const client = (await request.json()) as Client;
    const updated = await updateClientRow(id, client);
    return NextResponse.json({ client: updated });
  } catch (error) {
    console.error("PATCH /api/clients/[id] failed:", error);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}
