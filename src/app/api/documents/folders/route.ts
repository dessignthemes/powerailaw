import { NextResponse } from "next/server";
import { requireUserOrg } from "@/lib/data/documents";
import { listFolders, createFolder, FolderError } from "@/lib/data/documentFolders";

export const dynamic = "force-dynamic";
const fail = (where: string, e: unknown) => {
  if (e instanceof FolderError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`${where} failed:`, e);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
};

// GET ?matter=<id> → the matter's document folders.
export async function GET(request: Request) {
  try {
    const { orgId } = await requireUserOrg();
    const matter = new URL(request.url).searchParams.get("matter") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(matter)) return NextResponse.json({ folders: [] });
    return NextResponse.json(await listFolders(orgId, matter));
  } catch (e) {
    return fail("GET /api/documents/folders", e);
  }
}

// POST { matterId, parentId?, name } → a new folder.
export async function POST(request: Request) {
  try {
    const { orgId, user } = await requireUserOrg();
    const b = (await request.json().catch(() => ({}))) as { matterId?: string; parentId?: string | null; name?: string };
    if (!b.matterId) return NextResponse.json({ error: "Choose a matter." }, { status: 400 });
    return NextResponse.json({ folder: await createFolder(orgId, user.id, b.matterId, b.parentId ?? null, b.name) }, { status: 201 });
  } catch (e) {
    return fail("POST /api/documents/folders", e);
  }
}
