import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ensureProfile } from "@/lib/data/profile";
import { saveOAuthConnection } from "@/lib/data/oauth";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", requestUrl.origin));
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session || !data.user) {
    console.error("OAuth callback failed:", error);
    return NextResponse.redirect(new URL("/login?error=auth_failed", requestUrl.origin));
  }

  const { session, user } = data;

  try {
    await ensureProfile(user.id, user.email ?? "");

    // provider_token / provider_refresh_token are only present right after
    // the OAuth handshake — capture them now so mail/calendar sync has
    // something to work with later.
    if (session.provider_token) {
      const rawProvider = user.app_metadata?.provider;
      const provider: "google" | "microsoft" | null =
        rawProvider === "google" ? "google" : rawProvider === "azure" ? "microsoft" : null;

      if (provider) {
        // Provider access tokens last about an hour. For Google, ask the
        // token itself for its real expiry and the scopes actually granted
        // (the person can untick Gmail on the consent screen).
        let expiresAt = new Date(Date.now() + 55 * 60 * 1000).toISOString();
        let scopes: string[] = [];
        if (provider === "google") {
          try {
            const info = await fetch(
              `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(session.provider_token)}`
            ).then((r) => (r.ok ? r.json() : null));
            if (info?.expires_in) expiresAt = new Date(Date.now() + Number(info.expires_in) * 1000).toISOString();
            if (typeof info?.scope === "string") scopes = info.scope.split(" ");
          } catch {
            // Non-fatal: keep the defaults.
          }
        }

        await saveOAuthConnection({
          provider,
          accessToken: session.provider_token,
          refreshToken: session.provider_refresh_token ?? null,
          expiresAt,
          scopes,
          connectedBy: user.id,
          accountEmail: user.email ?? null,
        });
      }
    }
  } catch (err) {
    // Don't block login if the profile/connection bookkeeping fails —
    // log it and let the user in; this can be reconciled later.
    console.error("Post-login bookkeeping failed:", err);
  }

  // Pages like the Inbox set a short-lived cookie so people land back where
  // they started. Only same-site paths are accepted.
  const fromCookie = cookieStore.get("post_auth_next")?.value;
  const target = [fromCookie ? decodeURIComponent(fromCookie) : null, next].find(
    (p): p is string => !!p && p.startsWith("/") && !p.startsWith("//")
  ) ?? "/dashboard";
  const response = NextResponse.redirect(new URL(target, requestUrl.origin));
  if (fromCookie) response.cookies.delete("post_auth_next");
  return response;
}
