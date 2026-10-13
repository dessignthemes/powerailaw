import { NextResponse } from "next/server";
import { getAiCtx } from "@/lib/ai/store";
import { getKeyDates, refreshKeyDates, saveManualDates, createLetterNow, resetKeyDates, matterFields, saveMatterFields, fieldLibrary, forgetLibraryField, KeyDatesError } from "@/lib/ai/keyDates";
import type { AiCtx } from "@/lib/ai/store";

// Every answer also carries the fields this matter shows.
async function withFields<T extends object>(ctx: AiCtx, id: string, r: T) {
  const [fields, library] = await Promise.all([matterFields(ctx, id), fieldLibrary(ctx)]);
  return { ...r, fields, library };
}
import { AccessError } from "@/lib/data/documents";
import { NoWorkspaceError } from "@/lib/data/org";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // scanned contracts are read page by page

type P = { params: Promise<{ id: string }> };
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

function fail(where: string, error: unknown) {
  if (error instanceof KeyDatesError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof AccessError || error instanceof NoWorkspaceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(`${where} failed:`, error);
  return NextResponse.json({ error: "Something went wrong with the key dates. Please try again." }, { status: 500 });
}

// GET ?auto=1 → saved key dates; with auto, documents are read again if they changed.
export async function GET(request: Request, { params }: P) {
  try {
    const { id } = await params;
    if (!validId(id)) return NextResponse.json({ error: "Matter not found." }, { status: 404 });
    const auto = new URL(request.url).searchParams.get("auto") === "1";
    const ctx = await getAiCtx();
    return NextResponse.json(await withFields(ctx, id, await getKeyDates(ctx, id, auto)));
  } catch (error) {
    return fail("GET /api/matters/[id]/key-dates", error);
  }
}

// POST { action: "refresh" } read the documents again
//      { action: "save", dates: { closing: "2026-11-20", ... } } dates entered by hand
//      { action: "letter" } create the Contingency Dates Letter now
//      { action: "reset" } back to the dates read from the documents
export async function POST(request: Request, { params }: P) {
  try {
    const { id } = await params;
    if (!validId(id)) return NextResponse.json({ error: "Matter not found." }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { action?: unknown; dates?: unknown };
    const ctx = await getAiCtx();
    if (body.action === "refresh") return NextResponse.json(await withFields(ctx, id, await refreshKeyDates(ctx, id)));
    if (body.action === "letter") return NextResponse.json(await withFields(ctx, id, await createLetterNow(ctx, id)));
    if (body.action === "reset") return NextResponse.json(await withFields(ctx, id, await resetKeyDates(ctx, id)));
    if (body.action === "save" && body.dates && typeof body.dates === "object") {
      return NextResponse.json(await withFields(ctx, id, await saveManualDates(ctx, id, body.dates as Record<string, unknown>)));
    }
    // { action: "fields", fields: [{ key, label }] | null } → this matter type's field list
    // { action: "forget", key } → take a field off the reusable list
    if (body.action === "forget" && typeof (body as { key?: unknown }).key === "string") {
      await forgetLibraryField(ctx, (body as { key: string }).key);
      return NextResponse.json(await withFields(ctx, id, await getKeyDates(ctx, id, false)));
    }
    if (body.action === "fields") {
      await saveMatterFields(ctx, id, (body as { fields?: unknown }).fields ?? null);
      return NextResponse.json(await withFields(ctx, id, await getKeyDates(ctx, id, false)));
    }
    return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
  } catch (error) {
    return fail("POST /api/matters/[id]/key-dates", error);
  }
}
