import { NextResponse } from "next/server";
import { updateMatterRow } from "@/lib/data/matters";
import type { Matter } from "@/components/NewMatterModal";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const matter = (await request.json()) as Matter;
    const updated = await updateMatterRow(id, matter);
    return NextResponse.json({ matter: updated });
  } catch (error) {
    console.error("PATCH /api/matters/[id] failed:", error);
    return NextResponse.json({ error: "Failed to update matter" }, { status: 500 });
  }
}
