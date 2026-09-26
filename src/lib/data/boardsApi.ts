import "server-only";
import { NextResponse } from "next/server";
import { BoardError } from "@/lib/data/boards";
import { NoWorkspaceError } from "@/lib/data/org";

export function boardError(where: string, e: unknown) {
  if (e instanceof BoardError || e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
  const x = e as { code?: string; message?: string };
  if (x?.code === "PGRST205" || x?.code === "42P01" || x?.code === "42703" || /task_boards|board_id/.test(x?.message ?? "")) {
    return NextResponse.json(
      { error: "Sub boards aren't set up yet. Run supabase/migrations/0008_task_boards.sql in the Supabase SQL editor.", code: "setup_required" },
      { status: 503 }
    );
  }
  console.error(`${where} failed: ${x?.code ?? "error"}`);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
