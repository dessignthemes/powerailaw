import { NextResponse } from "next/server";
import { requireUserOrg } from "@/lib/data/documents";
import { listComms, logCall, sendInternal, filedMessages, CommError } from "@/lib/data/communications";

export const dynamic = "force-dynamic";

function fail(where: string, e: unknown) {
  if (e instanceof CommError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  console.error(`${where} failed:`, e);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

// GET ?view=calls|internal|emails|texts[&matterId=]
// POST { kind: "call", ... } → log a call (and a call-back task); { kind: "internal", ... } → message colleagues.
export async function GET(request: Request) {
  try {
    const { user, orgId } = await requireUserOrg();
    const u = new URL(request.url).searchParams;
    const view = u.get("view");
    if (view === "emails" || view === "texts") return NextResponse.json({ messages: await filedMessages(orgId, view === "emails" ? "email" : "sms") });
    return NextResponse.json({ items: await listComms(orgId, user.id, view === "internal" ? "internal" : "call", { matterId: u.get("matterId") }) });
  } catch (e) {
    return fail("GET /api/communications", e);
  }
}

export async function POST(request: Request) {
  try {
    const { user, orgId } = await requireUserOrg();
    const b = (await request.json().catch(() => ({}))) as { kind?: string };
    const item = b.kind === "internal" ? await sendInternal(orgId, user.id, b as Parameters<typeof sendInternal>[2]) : await logCall(orgId, user.id, b as Parameters<typeof logCall>[2]);
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    return fail("POST /api/communications", e);
  }
}
