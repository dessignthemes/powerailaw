import { NextResponse } from "next/server";
import { disconnect } from "@/lib/dropbox/client";
import { requireUser, dropboxErrorResponse } from "@/lib/dropbox/api";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireUser();
    await disconnect(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return dropboxErrorResponse("POST /api/dropbox/disconnect", error);
  }
}
