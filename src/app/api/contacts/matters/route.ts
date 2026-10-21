import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCurrentOrgId, NoWorkspaceError } from "@/lib/data/org";
import { mattersOfContact, MatterContactError } from "@/lib/data/matterContacts";

export const dynamic = "force-dynamic";

// GET ?contactId= or ?clientId= → the matters they're on as a contact, with their role.
export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const u = new URL(request.url).searchParams;
    return NextResponse.json({ matters: await mattersOfContact(await getCurrentOrgId(), { contactId: u.get("contactId"), clientId: u.get("clientId") }) });
  } catch (e) {
    if (e instanceof MatterContactError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    if (e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/contacts/matters failed:", e);
    return NextResponse.json({ error: "Couldn't load the matters." }, { status: 500 });
  }
}
