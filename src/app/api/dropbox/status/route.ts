import { NextResponse } from "next/server";
import { getStatus } from "@/lib/dropbox/client";
import { requireUser, dropboxErrorResponse } from "@/lib/dropbox/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await getStatus(user.id));
  } catch (error) {
    return dropboxErrorResponse("GET /api/dropbox/status", error);
  }
}
