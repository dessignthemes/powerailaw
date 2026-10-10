import { NextResponse } from "next/server";
import { publicAction, shareFail } from "@/lib/shares/server";

export const dynamic = "force-dynamic";

// The only way in is the secret link (plus its password, if one was set).
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const res = NextResponse.json(await publicAction(token, body));
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("X-Robots-Tag", "noindex");
    return res;
  } catch (e) {
    return shareFail("POST /api/public/share", e);
  }
}
