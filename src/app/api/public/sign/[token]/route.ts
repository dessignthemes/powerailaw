import { NextResponse } from "next/server";
import { publicView, submitSignature, declineSignature, SignError } from "@/lib/esign/server";

// Public: reachable without signing in. Every call needs the secret from the
// signing link; only its SHA-256 hash is stored.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fail(error: unknown) {
  if (error instanceof SignError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("/api/public/sign failed:", error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    return NextResponse.json(await publicView(token), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return fail(error);
  }
}

// POST { action: "sign", values, consent } or { action: "decline", reason }
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = (await request.json().catch(() => ({}))) as { action?: string; values?: Record<string, unknown>; consent?: boolean; reason?: string };
    if (body.action === "decline") return NextResponse.json(await declineSignature(token, String(body.reason ?? "")));
    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "";
    return NextResponse.json(await submitSignature(token, body, { ip, userAgent: request.headers.get("user-agent") ?? "" }));
  } catch (error) {
    return fail(error);
  }
}
