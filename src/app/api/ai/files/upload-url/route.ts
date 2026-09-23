import { NextResponse } from "next/server";
import { getAiCtx, createAttachmentUpload } from "@/lib/ai/store";
import { aiError } from "@/lib/ai/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await getAiCtx();
    const { conversationId, size, name } = (await request.json()) as { conversationId: string; size: number; name?: string };
    if (name && !/\.(pdf|docx|txt)$/i.test(name)) {
      return NextResponse.json({ error: "Only PDF, Word (.docx) and plain-text (.txt) files are supported." }, { status: 422 });
    }
    return NextResponse.json(await createAttachmentUpload(ctx, conversationId, Number(size)));
  } catch (e) {
    return aiError("POST /api/ai/files/upload-url", e);
  }
}
