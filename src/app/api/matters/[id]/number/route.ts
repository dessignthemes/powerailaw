import { NextResponse } from "next/server";
import { NoWorkspaceError } from "@/lib/data/org";
import { renumberMatter, MatterInputError } from "@/lib/data/matters";

export const dynamic = "force-dynamic";

// PUT { number: "REP-2026-3709" } — give the matter a different number.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "That matter wasn't found." }, { status: 404 });
    const b = (await request.json().catch(() => ({}))) as { number?: unknown };
    return NextResponse.json({ matter: await renumberMatter(id, b.number) });
  } catch (error) {
    if (error instanceof NoWorkspaceError || error instanceof MatterInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("PUT /api/matters/[id]/number failed:", error);
    return NextResponse.json({ error: "Couldn't change the matter number. Please try again." }, { status: 500 });
  }
}
