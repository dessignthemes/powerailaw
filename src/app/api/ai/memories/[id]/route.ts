import { NextResponse } from "next/server";
import { getAiCtx, updateMemory, deleteMemory } from "@/lib/ai/store";
import { aiError } from "@/lib/ai/api";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: P) {
  try {
    const { id } = await params;
    const ctx = await getAiCtx();
    const body = (await request.json()) as { content?: string; enabled?: boolean };
    return NextResponse.json({ memory: await updateMemory(ctx, id, body) });
  } catch (e) {
    return aiError("PATCH /api/ai/memories/[id]", e);
  }
}

export async function DELETE(_r: Request, { params }: P) {
  try {
    const { id } = await params;
    const ctx = await getAiCtx();
    await deleteMemory(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return aiError("DELETE /api/ai/memories/[id]", e);
  }
}
