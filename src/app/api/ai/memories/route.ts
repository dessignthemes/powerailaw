import { NextResponse } from "next/server";
import { getAiCtx, listMemories, createMemory, type MemoryScope } from "@/lib/ai/store";
import { aiError } from "@/lib/ai/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await getAiCtx();
    const matterId = new URL(request.url).searchParams.get("matterId");
    return NextResponse.json(await listMemories(ctx, matterId || null));
  } catch (e) {
    return aiError("GET /api/ai/memories", e);
  }
}

// Manual add, or approval of a suggestion made in a conversation.
export async function POST(request: Request) {
  try {
    const ctx = await getAiCtx();
    const body = (await request.json()) as { scope: MemoryScope; content: string; matterId?: string | null; conversationId?: string | null };
    if (!["personal", "firm", "matter"].includes(body.scope)) return NextResponse.json({ error: "Unknown memory type." }, { status: 400 });
    const memory = await createMemory(ctx, {
      scope: body.scope,
      content: String(body.content ?? ""),
      matterId: body.matterId ?? null,
      conversationId: body.conversationId ?? null,
      source: body.conversationId ? "suggested" : "manual",
    });
    return NextResponse.json({ memory }, { status: 201 });
  } catch (e) {
    return aiError("POST /api/ai/memories", e);
  }
}
