import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/data/org";
import { finishConnect } from "@/lib/ringcentral";

export const dynamic = "force-dynamic";

// RingCentral sends people back here after they sign in.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/dashboard?settings=integrations&${q}`, url.origin));
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.redirect(new URL("/login", url.origin));
    const state = (await cookies()).get("rc_state")?.value;
    const code = url.searchParams.get("code");
    if (!code || !state || state !== url.searchParams.get("state")) return back("rc=failed");
    await finishConnect(await getCurrentOrgId(), user.id, code, `${url.origin}/api/ringcentral/callback`);
    const res = back("connected=ringcentral");
    res.cookies.delete("rc_state");
    return res;
  } catch (e) {
    console.error("RingCentral callback failed:", e);
    return back("rc=failed");
  }
}
