import { NextResponse } from "next/server";
import { requireUserOrg, AccessError } from "@/lib/data/documents";
import { getDetails, saveDetails, DetailsError } from "@/lib/data/matterDetails";
import { getAiCtx } from "@/lib/ai/store";
import { updateLetterAfterDetails } from "@/lib/ai/keyDates";
import { syncDetailsWithContacts } from "@/lib/contacts/detailsSync";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

function fail(where: string, error: unknown) {
  if (error instanceof DetailsError || error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`${where} failed:`, error);
  return NextResponse.json({ error: "The matter details couldn't be saved. Please try again." }, { status: 500 });
}

export async function GET(_r: Request, { params }: P) {
  try {
    const { orgId } = await requireUserOrg();
    const { id } = await params;
    if (!validId(id)) return NextResponse.json({ error: "Matter not found." }, { status: 404 });
    return NextResponse.json({ details: await getDetails(orgId, id) });
  } catch (error) {
    return fail("GET /api/matters/[id]/details", error);
  }
}

// PATCH { values: { price: "$535,000.00", ... } }
export async function PATCH(request: Request, { params }: P) {
  try {
    const { orgId, user } = await requireUserOrg();
    const { id } = await params;
    if (!validId(id)) return NextResponse.json({ error: "Matter not found." }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { values?: unknown };
    if (!body.values || typeof body.values !== "object") return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    let details = await saveDetails(orgId, id, body.values as Record<string, unknown>);
    // A person or company typed in: match it with Contacts (or add it there).
    const changed = Object.keys(body.values as Record<string, unknown>);
    const sync = await syncDetailsWithContacts(orgId, user.id, id, changed).catch((e) => (console.error("Details → Contacts failed:", e), null));
    if (sync?.filled) details = await getDetails(orgId, id);
    // The Contingency Dates Letter uses these details: keep it up to date.
    await updateLetterAfterDetails(await getAiCtx(), id).catch((e) => console.error("Letter update after details failed:", e));
    return NextResponse.json({ details, contacts: sync });
  } catch (error) {
    return fail("PATCH /api/matters/[id]/details", error);
  }
}

// POST { action: "contacts" } → match every person and company in Details with Contacts.
export async function POST(request: Request, { params }: P) {
  try {
    const { orgId, user } = await requireUserOrg();
    const { id } = await params;
    if (!validId(id)) return NextResponse.json({ error: "Matter not found." }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { action?: unknown };
    if (body.action !== "contacts") return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
    const contacts = await syncDetailsWithContacts(orgId, user.id, id);
    if (contacts.filled) await updateLetterAfterDetails(await getAiCtx(), id).catch(() => undefined);
    return NextResponse.json({ details: await getDetails(orgId, id), contacts });
  } catch (error) {
    return fail("POST /api/matters/[id]/details", error);
  }
}
