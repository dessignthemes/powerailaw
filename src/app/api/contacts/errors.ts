import { NextResponse } from "next/server";
import { NoWorkspaceError } from "@/lib/data/org";
import { ContactInputError, ContactsSetupError } from "@/lib/data/contacts";

export function contactError(where: string, error: unknown) {
  if (error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ContactInputError) return NextResponse.json({ error: error.message }, { status: 422 });
  if (error instanceof ContactsSetupError) return NextResponse.json({ error: error.message, code: "setup_required" }, { status: 503 });
  console.error(`${where} failed:`, error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
