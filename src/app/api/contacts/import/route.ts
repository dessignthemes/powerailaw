import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCurrentOrgId, NoWorkspaceError } from "@/lib/data/org";
import { importContactFile, ContactImportError } from "@/lib/data/contactImport";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { source: "vcard" | "csv", contacts: [...] } — contacts read from a file
// in the browser (iPhone / iCloud vCard, RingCentral or any CSV).
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { source?: string; contacts?: unknown };
    const source = body.source === "vcard" ? "vcard" : "csv";
    const result = await importContactFile(await getCurrentOrgId(), user.id, source, body.contacts);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ContactImportError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("POST /api/contacts/import failed:", error);
    return NextResponse.json({ error: "The contacts couldn't be imported. Please try again." }, { status: 500 });
  }
}
