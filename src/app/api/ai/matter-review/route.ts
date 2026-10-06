import { NextResponse } from "next/server";
import { getAiCtx, usageToday } from "@/lib/ai/store";
import { aiConfig } from "@/lib/ai/provider";
import { reviewMatter } from "@/lib/ai/matterReview";
import { AccessError } from "@/lib/data/documents";
import { NoWorkspaceError } from "@/lib/data/org";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { matterId, ai?: boolean } — automatic checks, plus an AI summary
// unless ai is false or today's AI limit is reached.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { matterId?: unknown; ai?: unknown };
    if (typeof body.matterId !== "string") return NextResponse.json({ error: "Choose a matter." }, { status: 400 });
    const ctx = await getAiCtx();
    let useAi = body.ai !== false;
    let limitNote: string | null = null;
    if (useAi) {
      const cfg = aiConfig();
      const u = await usageToday(ctx);
      if (u.requests >= cfg.dailyRequestLimit || u.tokens >= cfg.dailyTokenLimit) {
        useAi = false;
        limitNote = "You've reached today's AI usage limit, so only the automatic checks ran. It resets at midnight UTC.";
      }
    }
    const result = await reviewMatter(ctx, body.matterId, useAi);
    return NextResponse.json({ review: limitNote ? { ...result, aiError: limitNote } : result });
  } catch (error) {
    if (error instanceof AccessError || error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("POST /api/ai/matter-review failed:", error);
    return NextResponse.json({ error: "The review couldn't be prepared. Please try again." }, { status: 500 });
  }
}
