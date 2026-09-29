import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { DropboxError, exchangeCode, saveConnection } from "@/lib/dropbox/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const back = (q: string) => {
    const res = NextResponse.redirect(`${origin}/dashboard/dropbox?${q}`);
    res.cookies.set("lp_dropbox_state", "", { path: "/api/dropbox", maxAge: 0 });
    return res;
  };

  if (url.searchParams.get("error")) return back("error=denied");
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const [state, userId] = (request.cookies.get("lp_dropbox_state")?.value ?? "").split(".");
  const code = url.searchParams.get("code");
  if (!code || !state || state !== url.searchParams.get("state") || userId !== user.id) return back("error=expired");

  try {
    const tokens = await exchangeCode(code, origin);
    await saveConnection(user.id, tokens);
    return back("connected=1");
  } catch (error) {
    if (error instanceof DropboxError && error.code === "setup_required") return back("error=setup_required");
    console.error("Dropbox callback failed:", error);
    return back("error=failed");
  }
}
