import { NextResponse } from "next/server";
import { portalHome, portalFail } from "@/lib/portal/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await portalHome(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return portalFail("GET /api/portal/home", e);
  }
}
