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
        await saveOAuthConnection({
          provider,
          accessToken: session.provider_token,
          refreshToken: session.provider_refresh_token ?? null,
          expiresAt: session.expires_at
            ? new Date(session.expires_at * 1000).toISOString()
            : null,
          scopes: [], // Supabase doesn't return granted scopes directly; recorded for future use
          connectedBy: user.id,
        });
      }
    }
  } catch (err) {
    // Don't block login if the profile/connection bookkeeping fails —
    // log it and let the user in; this can be reconciled later.
    console.error("Post-login bookkeeping failed:", err);
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
