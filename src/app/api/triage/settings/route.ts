import { NextResponse } from "next/server";
import { saveTriageFolder } from "@/lib/data/triage";
import { triageError } from "@/lib/data/triageApi";

export const dynamic = "force-dynamic";

// PUT { provider, folderId, folderName } — the folder this person watches
export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ settings: await saveTriageFolder(body) });
  } catch (e) {
    return triageError("PUT /api/triage/settings", e);
  }
}
