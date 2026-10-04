import "server-only";
import { NextResponse } from "next/server";
import { AcctError } from "@/lib/data/accounting";
import { NoWorkspaceError } from "@/lib/data/org";

export function acctFail(where: string, error: unknown) {
  if (error instanceof AcctError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`${where} failed:`, error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
