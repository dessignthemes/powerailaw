import { NextResponse } from "next/server";
import { aiConfig } from "@/lib/ai/provider";
import { getAiCtx, usageToday } from "@/lib/ai/store";
import { aiError } from "@/lib/ai/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await getAiCtx();
    const cfg = aiConfig();
    const usage = await usageToday(ctx);
    return NextResponse.json({
      configured: cfg.configured,
      provider: cfg.provider,
      providerLabel: cfg.providerLabel,
      keyName: cfg.keyName,
      model: cfg.model,
      usage: { ...usage, tokenLimit: cfg.dailyTokenLimit, requestLimit: cfg.dailyRequestLimit },
    });
  } catch (e) {
    return aiError("GET /api/ai/status", e);
  }
}
