import { NextResponse } from "next/server";
import { getAiCtx, finalizeAttachment } from "@/lib/ai/store";
import { aiError } from "@/lib/ai/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Finalize: validate the uploaded bytes, extract text, index it.
export async function POST(request: Request) {
  try {
    const ctx = await getAiCtx();
    const { conversationId, path, name } = (await request.json()) as { conversationId: string; path: string; name: string };
    const file = await finalizeAttachment(ctx, conversationId, path, name);
    return NextResponse.json({ file }, { status: 201 });
  } catch (e) {
    return aiError("POST /api/ai/files", e);
  }
}
