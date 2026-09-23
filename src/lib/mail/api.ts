import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { MailError } from "@/lib/mail/tokens";
import type { MailProvider } from "@/lib/mail/types";

export async function requireUserId() {
  const user = await getSessionUser();
  return user?.id ?? null;
}

export function parseProvider(v: string | null): MailProvider | null {
  return v === "google" || v === "microsoft" ? v : null;
}

export function mailErrorResponse(where: string, error: unknown) {
  if (error instanceof MailError) {
    const status = error.code === "not_connected" ? 404 : error.code === "provider_error" ? 502 : 409;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === "42P10" || /no unique or exclusion constraint|account_email|updated_at/i.test(e?.message ?? "")) {
    return NextResponse.json(
      {
        error:
          "The Inbox isn't set up in the database yet. Run supabase/migrations/0004_personal_mail_connections.sql in the Supabase SQL editor, then reconnect your mailbox.",
        code: "setup_required",
      },
      { status: 503 }
    );
  }
  console.error(`${where} failed:`, error);
  return NextResponse.json({ error: "Something went wrong loading your mail. Please try again." }, { status: 500 });
}
