import { NextResponse } from "next/server";
import { logout, portalFail } from "@/lib/portal/server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await logout();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return portalFail("POST /api/portal/logout", e);
  }
}
