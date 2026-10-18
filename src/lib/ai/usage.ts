import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Every AI request is recorded with the feature it was for, so the firm can see
// where its AI allowance went (Administration > AI usage).
export type AiFeature = "chat" | "documents" | "matter_review" | "accounting" | "other";

export async function recordAiUsage(row: {
  orgId: string;
  userId: string;
  feature: AiFeature;
  model: string;
  inputTokens: number;
  outputTokens: number;
  conversationId?: string | null;
}) {
  const base = {
    org_id: row.orgId,
    user_id: row.userId,
    conversation_id: row.conversationId ?? null,
    model: row.model,
    input_tokens: Math.max(0, Math.round(row.inputTokens || 0)),
    output_tokens: Math.max(0, Math.round(row.outputTokens || 0)),
  };
  const db = createAdminClient();
  let { error } = await db.from("ai_usage").insert({ ...base, feature: row.feature });
  // Before migration 0041 there is no feature column: still record the tokens.
  if (error && /feature/.test(error.message ?? "")) ({ error } = await db.from("ai_usage").insert(base));
  if (error) console.error("Recording AI usage failed:", error);
}
