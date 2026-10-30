import { NextResponse } from "next/server";
import { getOrgSettings, updateOrgSettings, updatePracticeAreas, OrgError } from "@/lib/data/organization";

export const dynamic = "force-dynamic";

function fail(where: string, error: unknown) {
  if (error instanceof OrgError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`${where} failed:`, error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json({ organization: await getOrgSettings() });
  } catch (error) {
    return fail("GET /api/organization", error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    // { practiceAreas, scopeNotes } saves just the practice areas (their own Save button).
    if (body && typeof body === "object" && "practiceAreas" in body) return NextResponse.json({ organization: await updatePracticeAreas(body) });
    return NextResponse.json({ organization: await updateOrgSettings(body) });
  } catch (error) {
    return fail("PATCH /api/organization", error);
  }
}
