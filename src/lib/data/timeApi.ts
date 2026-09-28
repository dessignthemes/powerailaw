import "server-only";
import { NextResponse } from "next/server";
import { TimeError } from "@/lib/data/timeEntries";

export function timeError(where: string, e: unknown) {
  if (e instanceof TimeError) return NextResponse.json({ error: e.message }, { status: e.status });
  const x = e as { code?: string; message?: string };
  if (x?.code === "PGRST205" || x?.code === "42P01" || /time_entries/.test(x?.message ?? "")) {
    return NextResponse.json(
      { error: "Time tracking isn't set up yet. Run supabase/migrations/0012_time_entries.sql in the Supabase SQL editor.", code: "setup_required" },
      { status: 503 }
    );
  }
  console.error(`${where} failed: ${x?.code ?? "error"}`);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
