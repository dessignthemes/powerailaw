import "server-only";
import { NextResponse } from "next/server";
import { BoardError } from "@/lib/data/boards";
import { NoWorkspaceError } from "@/lib/data/org";

export function boardError(where: string, e: unknown) {
  if (e instanceof BoardError || e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
  const x = e as { code?: string; message?: string };
  if (x?.code === "PGRST205" || x?.code === "42P01" || x?.code === "42703" || /task_boards|board_id|board_columns|column_id/.test(x?.message ?? "")) {
    return NextResponse.json(
      { error: "This board feature isn’t set up yet. Run the newest files in supabase/migrations (0008 and 0010) in the Supabase SQL editor.", code: "setup_required" },
      { status: 503 }
    );
  }
  console.error(`${where} failed: ${x?.code ?? "error"}`);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
