import "server-only";
import { NextResponse } from "next/server";
import { AccessError } from "@/lib/data/documents";
import { ProviderError } from "@/lib/ai/provider/types";

export function isSetupError(e: unknown) {
  const err = e as { code?: string; message?: string } | null;
  return (
    err?.code === "PGRST205" ||
    err?.code === "42P01" ||
    err?.code === "PGRST202" ||
    /could not find the (table|function)|relation .* does not exist|bucket not found/i.test(err?.message ?? "")
  );
}

// Errors are logged by type/code only: never prompts, messages or document text.
export function aiError(where: string, e: unknown) {
  if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ProviderError) {
    const status = e.code === "not_configured" ? 503 : e.code === "rate_limited" ? 429 : 502;
    return NextResponse.json({ error: e.message, code: e.code }, { status });
  }
  if (isSetupError(e)) {
    return NextResponse.json(
      { error: "The AI Agent isn't set up in the database yet. Run supabase/migrations/0005_ai_agent.sql in the Supabase SQL editor.", code: "setup_required" },
      { status: 503 }
    );
  }
  const err = e as { code?: string; name?: string } | null;
  console.error(`${where} failed: ${err?.name ?? "Error"} ${err?.code ?? ""}`.trim());
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
