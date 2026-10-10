import { NextResponse } from "next/server";
import { listShares, createShare, shareFail } from "@/lib/shares/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ shares: await listShares() });
  } catch (e) {
    return shareFail("GET /api/shares", e);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(await createShare(body), { status: 201 });
  } catch (e) {
    return shareFail("POST /api/shares", e);
  }
}
