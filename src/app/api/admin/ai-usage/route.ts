import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUserOrg, AccessError } from "@/lib/data/documents";
import { NoWorkspaceError } from "@/lib/data/org";
import { usageToday } from "@/lib/ai/store";
import { aiConfig } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

// GET ?month=YYYY-MM → the firm's AI usage that month: total, by feature, by person
// (by person: owner / admins only), and the monthly allowance.
const FEATURES = ["documents", "chat", "matter_review", "accounting", "conflicts", "other"] as const;

export async function GET(request: Request) {
  try {
    const { user, orgId } = await requireUserOrg();
    const db = createAdminClient();
    const m = /^(\d{4})-(\d{2})$/.exec(new URL(request.url).searchParams.get("month") ?? "");
    const now = new Date();
    const year = m ? Number(m[1]) : now.getUTCFullYear();
    const month = m ? Number(m[2]) - 1 : now.getUTCMonth();
    const from = new Date(Date.UTC(year, month, 1)).toISOString();
    const to = new Date(Date.UTC(year, month + 1, 1)).toISOString();

    const [{ data: me }, rowsRes, { data: team }] = await Promise.all([
      db.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      db.from("ai_usage").select("*").eq("org_id", orgId).gte("created_at", from).lt("created_at", to).limit(100000),
      db.from("profiles").select("id, email, full_name").eq("org_id", orgId),
    ]);
    if (rowsRes.error) throw rowsRes.error;
    const rows = (rowsRes.data ?? []) as { user_id: string; feature?: string | null; input_tokens: number; output_tokens: number }[];
    const canSeePeople = me?.role === "owner" || me?.role === "admin";

    const byFeature = new Map<string, number>();
    const byPerson = new Map<string, number>();
    let total = 0;
    for (const r of rows) {
      const t = (r.input_tokens || 0) + (r.output_tokens || 0);
      total += t;
      const f = FEATURES.includes((r.feature ?? "chat") as (typeof FEATURES)[number]) ? (r.feature ?? "chat") : "other";
      byFeature.set(f, (byFeature.get(f) ?? 0) + t);
      byPerson.set(r.user_id, (byPerson.get(r.user_id) ?? 0) + t);
    }
    const names = new Map(((team ?? []) as { id: string; email: string; full_name?: string | null }[]).map((p) => [p.id, p.full_name || p.email]));
    const allowance = Math.max(0, Number(process.env.AI_MONTHLY_TOKEN_LIMIT) || 10_000_000);

    return NextResponse.json({
      month: `${year}-${String(month + 1).padStart(2, "0")}`,
      total,
      requests: rows.length,
      allowance,
      byFeature: FEATURES.map((f) => ({ feature: f, tokens: byFeature.get(f) ?? 0 })).filter((x) => x.tokens > 0),
      byPerson: canSeePeople
        ? await Promise.all(
            [...byPerson.entries()]
              .map(([id, tokens]) => ({ id, name: names.get(id) ?? "Former member", tokens }))
              .sort((a, b) => b.tokens - a.tokens)
              .map(async (p) => ({ ...p, today: await usageToday({ userId: p.id, orgId, email: null }) }))
          )
        : null,
      dailyLimit: { tokens: aiConfig().dailyTokenLimit, requests: aiConfig().dailyRequestLimit },
    });
  } catch (e) {
    if (e instanceof AccessError || e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/admin/ai-usage failed:", e);
    return NextResponse.json({ error: "AI usage couldn't be loaded." }, { status: 500 });
  }
}

// POST { resetUserId } (owner / admins): reset that person's daily AI limit now.
export async function POST(request: Request) {
  try {
    const { user, orgId } = await requireUserOrg();
    const db = createAdminClient();
    const { data: me } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (me?.role !== "owner" && me?.role !== "admin") return NextResponse.json({ error: "Only the owner or an admin can reset AI limits." }, { status: 403 });
    const b = (await request.json().catch(() => ({}))) as { resetUserId?: unknown };
    const id = typeof b.resetUserId === "string" && /^[0-9a-f-]{36}$/i.test(b.resetUserId) ? b.resetUserId : null;
    if (!id) return NextResponse.json({ error: "Choose a person." }, { status: 400 });
    const { error } = await db.from("profiles").update({ ai_limit_reset_at: new Date().toISOString() }).eq("id", id).eq("org_id", orgId);
    if (error) return NextResponse.json({ error: "Couldn't reset. Run supabase/migrations/0055_ai_limit_reset.sql in Supabase first." }, { status: 503 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AccessError || e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/admin/ai-usage failed:", e);
    return NextResponse.json({ error: "Couldn't reset the limit." }, { status: 500 });
  }
}
