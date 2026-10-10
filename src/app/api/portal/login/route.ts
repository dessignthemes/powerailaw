import { NextResponse } from "next/server";
import { login, portalFail } from "@/lib/portal/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
    await login(body.email, body.password);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return portalFail("POST /api/portal/login", e);
  }
}
