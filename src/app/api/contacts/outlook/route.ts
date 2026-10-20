import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCurrentOrgId, NoWorkspaceError } from "@/lib/data/org";
import { outlookContactsStatus, syncOutlookContacts, setOutlookSync, ContactImportError } from "@/lib/data/contactImport";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fail(where: string, error: unknown) {
  if (error instanceof ContactImportError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`${where} failed:`, error);
  return NextResponse.json({ error: "Something went wrong with Outlook contacts. Please try again." }, { status: 500 });
}

// GET → whether Outlook is connected with the Contacts permission, and whether it's kept in step.
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    return NextResponse.json(await outlookContactsStatus(user.id));
  } catch (error) {
    return fail("GET /api/contacts/outlook", error);
  }
}

// POST { keepSyncing: boolean } → import now (and keep in step if asked).
// POST { auto: true } → quick catch-up when Contacts is opened (only if kept in
// step, and not more than every 5 minutes).
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const orgId = await getCurrentOrgId();
    const body = (await request.json().catch(() => ({}))) as { keepSyncing?: unknown; auto?: unknown };
    if (body.auto === true) {
      const st = await outlookContactsStatus(user.id);
      const recent = st.lastSyncedAt && Date.now() - new Date(st.lastSyncedAt).getTime() < 5 * 60_000;
      if (!st.syncing || !st.permission || recent) return NextResponse.json({ skipped: true, added: 0 });
      return NextResponse.json(await syncOutlookContacts(orgId, user.id));
    }
    return NextResponse.json(await syncOutlookContacts(orgId, user.id, { keepSyncing: body.keepSyncing === true }));
  } catch (error) {
    return fail("POST /api/contacts/outlook", error);
  }
}

// PATCH { enabled: boolean } → turn "keep in step with Outlook" on or off.
export async function PATCH(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { enabled?: unknown };
    await setOutlookSync(await getCurrentOrgId(), user.id, body.enabled === true);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail("PATCH /api/contacts/outlook", error);
  }
}
