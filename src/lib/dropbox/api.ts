import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { DropboxError } from "@/lib/dropbox/client";
import { AccessError, FileRejectedError, MigrationRequiredError, PdfRejectedError } from "@/lib/data/documents";

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new DropboxError("not_connected", "Please sign in again.", 401);
  return user;
}

// Paths come from the browser; Dropbox itself limits access to the person's
// own account, so this only rejects malformed values.
export function cleanPath(v: string | null | undefined, allowRoot = true) {
  const p = (v ?? "").trim() || "/";
  if (!p.startsWith("/") || p.length > 1000 || /[\u0000-\u001f]/.test(p) || (!allowRoot && p === "/")) {
    throw new DropboxError("not_found", "That file or folder path isn't valid.", 400);
  }
  return p;
}

export function dropboxErrorResponse(where: string, error: unknown) {
  if (error instanceof DropboxError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof PdfRejectedError || error instanceof FileRejectedError) {
    return NextResponse.json({ error: error.message, code: error.problem }, { status: 422 });
  }
  if (error instanceof MigrationRequiredError) {
    return NextResponse.json({ error: error.message, code: "setup_required" }, { status: 503 });
  }
  console.error(`${where} failed:`, error);
  return NextResponse.json({ error: "Something went wrong with Dropbox. Please try again." }, { status: 500 });
}
