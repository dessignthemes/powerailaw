import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCurrentOrgId, NoWorkspaceError } from "@/lib/data/org";
import { InvoiceError } from "@/lib/data/invoices";

// Shared by the invoice routes: who's asking, and turning errors into replies.
export async function who() {
  const user = await getSessionUser();
  if (!user) throw new InvoiceError("Please sign in again.", 401);
  return { userId: user.id, orgId: await getCurrentOrgId() };
}

export function fail(where: string, error: unknown) {
  if (error instanceof InvoiceError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`${where} failed:`, error);
  return NextResponse.json({ error: "Something went wrong with invoices. Please try again." }, { status: 500 });
}

export const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
