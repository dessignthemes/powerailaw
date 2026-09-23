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

  // Setup problems get a specific message instead of a generic failure.
  const e = error as { code?: string; message?: string; statusCode?: string | number } | null;
  const msg = e?.message ?? "";
  if (e?.code === "PGRST205" || e?.code === "42P01" || /could not find the table|does not exist/i.test(msg)) {
    return NextResponse.json(
      {
        error:
          "Power PDF isn't set up in the database yet. Run supabase/migrations/0003_documents.sql in the Supabase SQL editor, then refresh.",
        code: "setup_required",
      },
      { status: 503 }
    );
  }
  if (/bucket not found/i.test(msg)) {
    return NextResponse.json(
      {
        error:
          "The PDF storage bucket is missing. Run supabase/migrations/0003_documents.sql in the Supabase SQL editor, then try again.",
        code: "setup_required",
      },
      { status: 503 }
    );
  }
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
