import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { authorizeUrl, rcConfigured } from "@/lib/ringcentral";

export const dynamic = "force-dynamic";

// GET → RingCentral's sign-in; it comes back to /api/ringcentral/callback.
export async function GET(request: Request) {
  const user = await getSessionUser();
  const origin = new URL(request.url).origin;
  if (!user) return NextResponse.redirect(new URL("/login", origin));
  if (!rcConfigured()) return NextResponse.redirect(new URL("/dashboard?settings=integrations", origin));
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(`${origin}/api/ringcentral/callback`, state));
  res.cookies.set("rc_state", state, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 600, path: "/" });
  return res;
}
