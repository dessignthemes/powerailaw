import "server-only";
import { NextResponse } from "next/server";
import { TriageError } from "@/lib/data/triage";

export function triageError(where: string, e: unknown) {
  if (e instanceof TriageError) return NextResponse.json({ error: e.message }, { status: e.status });
  const x = e as { code?: string; message?: string };
  if (x?.code === "PGRST205" || x?.code === "42P01" || x?.code === "42703" || /triage/.test(x?.message ?? "")) {
    return NextResponse.json(
      { error: "Triage isn't set up yet. Run supabase/migrations/0011_triage.sql in the Supabase SQL editor.", code: "setup_required" },
      { status: 503 }
    );
  }
  console.error(`${where} failed: ${x?.code ?? "error"}`);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
