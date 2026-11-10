import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCurrentOrgId, NoWorkspaceError } from "@/lib/data/org";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Row = { id: string; kind: string; name: string; email: string | null; phone: string | null; mobile?: string | null; company: string | null; employer_id?: string | null; category?: string | null; vendor_type?: string | null };

// GET ?q=kathy&kind=person|company → up to 8 contacts whose name (or email) has every word,
// with the company each person works at. Used to pick a contact while typing in a matter's Details.
export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const orgId = await getCurrentOrgId();
    const u = new URL(request.url).searchParams;
    const words = (u.get("q") ?? "").toLowerCase().replace(/[%_,()]/g, " ").split(/\s+/).filter((w) => w.length >= 2).slice(0, 5);
    const kind = u.get("kind");
    if (!words.length) return NextResponse.json({ results: [] });
    const longest = [...words].sort((a, b) => b.length - a.length)[0];
    let q = createAdminClient().from("contacts").select("*").eq("org_id", orgId).or(`name.ilike.%${longest}%,email.ilike.%${longest}%`).limit(200);
    if (kind === "person") q = q.eq("kind", "person");
    if (kind === "company") q = q.neq("kind", "person");
    const { data, error } = await q;
    if (error) return NextResponse.json({ results: [] });
    const rows = ((data ?? []) as Row[])
      .filter((r) => words.every((w) => `${r.name} ${r.email ?? ""}`.toLowerCase().includes(w)))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(words[0])) - Number(!b.name.toLowerCase().startsWith(words[0])) || a.name.localeCompare(b.name))
      .slice(0, 8);
    const employerIds = [...new Set(rows.map((r) => r.employer_id).filter(Boolean))] as string[];
    const { data: emps } = employerIds.length ? await createAdminClient().from("contacts").select("id, name").eq("org_id", orgId).in("id", employerIds) : { data: [] };
    const empName = new Map(((emps ?? []) as { id: string; name: string }[]).map((e) => [e.id, e.name]));
    return NextResponse.json({
      results: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        name: r.name,
        email: r.email,
        phone: r.phone || r.mobile || null,
        company: (r.employer_id && empName.get(r.employer_id)) || r.company || "",
        category: r.category ?? "",
        type: r.vendor_type ?? "",
      })),
    });
  } catch (error) {
    if (error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("GET /api/contacts/search failed:", error);
    return NextResponse.json({ results: [] });
  }
}
