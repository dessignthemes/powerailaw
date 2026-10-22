import "server-only";
import { NextResponse } from "next/server";
import { DocTemplateError } from "@/lib/data/docTemplates";
import { AccessError } from "@/lib/data/documents";
import { NoWorkspaceError } from "@/lib/data/org";

// Turns errors from the AI Templates routes into replies.
export function failTemplate(where: string, e: unknown) {
  if (e instanceof DocTemplateError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof AccessError || e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`${where} failed:`, e);
  return NextResponse.json({ error: "Something went wrong with the template. Please try again." }, { status: 500 });
}
