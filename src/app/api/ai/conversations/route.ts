import { NextResponse } from "next/server";
import { getAiCtx, listConversations, createConversation } from "@/lib/ai/store";
import { aiError } from "@/lib/ai/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await getAiCtx();
    return NextResponse.json({ conversations: await listConversations(ctx) });
  } catch (e) {
    return aiError("GET /api/ai/conversations", e);
  }
}

// Used when a file is attached before the first message.
export async function POST(request: Request) {
  try {
    const ctx = await getAiCtx();
    const { matterId } = (await request.json().catch(() => ({}))) as { matterId?: string | null };
    const conv = await createConversation(ctx, matterId || null);
    return NextResponse.json({ conversation: { id: conv.id, title: conv.title, matterId: conv.matter_id } }, { status: 201 });
  } catch (e) {
    return aiError("POST /api/ai/conversations", e);
  }
}
