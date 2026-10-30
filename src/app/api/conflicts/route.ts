import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCurrentOrgId, NoWorkspaceError } from "@/lib/data/org";
import { ConflictError, listChecks, runConflictCheck, runForClient } from "@/lib/conflicts/check";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

function fail(where: string, e: unknown) {
  if (e instanceof ConflictError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`${where} failed:`, e);
  return NextResponse.json({ error: "The conflict check couldn't be run. Please try again." }, { status: 500 });
}

// GET ?clientId= → { checks } (the firm's checks, or one client's)
export async function GET(request: Request) {
  try {
    const orgId = await getCurrentOrgId();
    const clientId = new URL(request.url).searchParams.get("clientId");
    return NextResponse.json({ checks: await listChecks(orgId, { clientId: clientId && /^[0-9a-f-]{36}$/i.test(clientId) ? clientId : null }) });
  } catch (e) {
    return fail("GET /api/conflicts", e);
  }
}

// POST { clientId } → check that client; or { names, companies, emails, phones, notes? } → check a prospect.
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const orgId = await getCurrentOrgId();
    const b = (await request.json().catch(() => ({}))) as { clientId?: string; names?: unknown; companies?: unknown; emails?: unknown; phones?: unknown; notes?: unknown };
    const check =
      b.clientId && /^[0-9a-f-]{36}$/i.test(b.clientId)
        ? await runForClient(orgId, user?.id ?? null, user?.email ?? null, b.clientId)
        : await runConflictCheck({ orgId, userId: user?.id ?? null, email: user?.email ?? null, searched: { names: b.names as string[], companies: b.companies as string[], emails: b.emails as string[], phones: b.phones as string[] }, notes: typeof b.notes === "string" ? b.notes : "" });
    return NextResponse.json({ check }, { status: 201 });
  } catch (e) {
    return fail("POST /api/conflicts", e);
  }
}
