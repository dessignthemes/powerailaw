import "server-only";
import { NextResponse } from "next/server";
import { AccessError, PdfRejectedError } from "@/lib/data/documents";

export function errorResponse(where: string, error: unknown) {
  if (error instanceof AccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof PdfRejectedError) {
    return NextResponse.json({ error: error.message, code: error.problem }, { status: 422 });
  }
  console.error(`${where} failed:`, error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
