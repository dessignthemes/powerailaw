import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { DROPBOX_SCOPES, dropboxConfigured, redirectUri } from "@/lib/dropbox/client";

export const dynamic = "force-dynamic";

// Starts Dropbox sign-in. A random state in a short-lived cookie is checked
// in the callback so nobody can attach their Dropbox to someone else's login.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);
  if (!dropboxConfigured()) return NextResponse.redirect(`${origin}/dashboard/dropbox?error=not_configured`);

  const state = crypto.randomUUID();
  const url = new URL("https://www.dropbox.com/oauth2/authorize");
  url.searchParams.set("client_id", process.env.DROPBOX_CLIENT_ID!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("token_access_type", "offline");
  url.searchParams.set("redirect_uri", redirectUri(origin));
  url.searchParams.set("scope", DROPBOX_SCOPES.join(" "));
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString());
  res.cookies.set("lp_dropbox_state", `${state}.${user.id}`, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/api/dropbox",
    maxAge: 600,
  });
  return res;
}
