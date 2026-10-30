import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCurrentOrgId, NoWorkspaceError } from "@/lib/data/org";
import { ConflictError, decideCheck } from "@/lib/conflicts/check";

export const dynamic = "force-dynamic";

// PATCH { decision?: "cleared" | "conflict" | null, note?, archived? }
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const orgId = await getCurrentOrgId();
    const check = await decideCheck(orgId, user.id, id, await request.json().catch(() => ({})));
    return NextResponse.json({ check });
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    if (e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PATCH /api/conflicts/[id] failed:", e);
    return NextResponse.json({ error: "Couldn't save. Please try again." }, { status: 500 });
  }
}
