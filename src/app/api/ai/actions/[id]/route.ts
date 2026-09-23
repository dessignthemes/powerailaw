import { NextResponse } from "next/server";
import { getAiCtx } from "@/lib/ai/store";
import { decideAction } from "@/lib/ai/decide";
import { aiError } from "@/lib/ai/api";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

// POST { decision: "confirm" | "cancel" }
export async function POST(request: Request, { params }: P) {
  try {
    const { id } = await params;
    const ctx = await getAiCtx();
    const { decision } = (await request.json().catch(() => ({}))) as { decision?: string };
    const d = await decideAction(ctx, id, String(decision ?? ""));
    if (d.status === "executed") return NextResponse.json(d);
    if (d.status === "cancelled") return NextResponse.json(d);
    return NextResponse.json({ error: d.error, status: d.status }, { status: d.status === "failed" ? 422 : 409 });
  } catch (e) {
    return aiError("POST /api/ai/actions/[id]", e);
  }
}
