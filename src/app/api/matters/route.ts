import { NextResponse } from "next/server";
import { listMatters, createMatterRow, deleteMatterRows } from "@/lib/data/matters";
import type { Matter } from "@/components/NewMatterModal";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const matters = await listMatters();
    return NextResponse.json({ matters });
  } catch (error) {
    console.error("GET /api/matters failed:", error);
    return NextResponse.json({ error: "Failed to load matters" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const matter = (await request.json()) as Matter;
    const created = await createMatterRow(matter);
    return NextResponse.json({ matter: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/matters failed:", error);
    return NextResponse.json({ error: "Failed to create matter" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { ids } = (await request.json()) as { ids: string[] };
    await deleteMatterRows(ids);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/matters failed:", error);
    return NextResponse.json({ error: "Failed to delete matters" }, { status: 500 });
  }
}
