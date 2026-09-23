import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAiCtx,
  getConversation,
  listMessages,
  listConversationFiles,
  renameConversation,
  deleteConversation,
  assertMatter,
} from "@/lib/ai/store";
import { aiError } from "@/lib/ai/api";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

export async function GET(_r: Request, { params }: P) {
  try {
    const { id } = await params;
    const ctx = await getAiCtx();
    const conv = await getConversation(ctx, id);
    const [messages, files, matter, actions] = await Promise.all([
      listMessages(ctx, id),
      listConversationFiles(ctx, id),
      conv.matter_id ? assertMatter(ctx, conv.matter_id) : Promise.resolve(null),
      createAdminClient()
        .from("ai_pending_actions")
        .select("id, status, result, error")
        .eq("conversation_id", id)
        .eq("user_id", ctx.userId),
    ]);
    return NextResponse.json({
      conversation: { id: conv.id, title: conv.title, matterId: conv.matter_id, matterTitle: matter?.title ?? null },
      messages,
      files,
      actions: actions.data ?? [],
    });
  } catch (e) {
    return aiError("GET /api/ai/conversations/[id]", e);
  }
}

export async function PATCH(request: Request, { params }: P) {
  try {
    const { id } = await params;
    const ctx = await getAiCtx();
    const { title } = (await request.json()) as { title?: string };
    return NextResponse.json({ title: await renameConversation(ctx, id, String(title ?? "")) });
  } catch (e) {
    return aiError("PATCH /api/ai/conversations/[id]", e);
  }
}

export async function DELETE(_r: Request, { params }: P) {
  try {
    const { id } = await params;
    const ctx = await getAiCtx();
    await deleteConversation(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return aiError("DELETE /api/ai/conversations/[id]", e);
  }
}
