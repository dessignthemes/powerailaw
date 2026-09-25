import "server-only";
import { NextResponse } from "next/server";
import { TeamError } from "@/lib/data/team";

export function teamError(where: string, e: unknown) {
  if (e instanceof TeamError) return NextResponse.json({ error: e.message }, { status: e.status });
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === "PGRST205" || err?.code === "42P01" || /workspace_invites/.test(err?.message ?? "")) {
    return NextResponse.json(
      { error: "Team invites aren't set up in the database yet. Run supabase/migrations/0007_workspace_invites.sql in the Supabase SQL editor.", code: "setup_required" },
      { status: 503 }
    );
  }
  console.error(`${where} failed: ${err?.code ?? "error"}`);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
