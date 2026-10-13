import { NextResponse } from "next/server";
import { requireUserOrg, AccessError } from "@/lib/data/documents";
import { getDetails, saveDetails, DetailsError } from "@/lib/data/matterDetails";
import { getAiCtx } from "@/lib/ai/store";
import { updateLetterAfterDetails } from "@/lib/ai/keyDates";

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
    const { orgId } = await requireUserOrg();
    const { id } = await params;
    if (!validId(id)) return NextResponse.json({ error: "Matter not found." }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { values?: unknown };
    if (!body.values || typeof body.values !== "object") return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    const details = await saveDetails(orgId, id, body.values as Record<string, unknown>);
    // The Contingency Dates Letter uses these details: keep it up to date.
    await updateLetterAfterDetails(await getAiCtx(), id).catch((e) => console.error("Letter update after details failed:", e));
    return NextResponse.json({ details });
  } catch (error) {
    return fail("PATCH /api/matters/[id]/details", error);
  }
}
