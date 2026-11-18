import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// The person's Dashboard layout: [{ id, size, w?, h? }] in order. null = the default layout.
const clean = (v: unknown) =>
  Array.isArray(v)
    ? v
        .slice(0, 60)
        .map((x) => {
          const o = x as { id?: unknown; size?: unknown; w?: unknown; h?: unknown };
          // A size dragged by hand: half-columns / half-rows (1–12).
          const span = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 12 ? v : undefined);
          const w = span(o.w);
          const h = span(o.h);
          return { id: String(o.id ?? "").slice(0, 40), size: String(o.size ?? "").slice(0, 4), ...(w && h ? { w, h } : {}) };
        })
        .filter((x) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(x.id) && /^(s|m|l|w|xl)$/.test(x.size))
    : null;

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { data, error } = await createAdminClient().from("profiles").select("dashboard_layout").eq("id", user.id).maybeSingle();
  if (error) return NextResponse.json({ layout: null, ready: false });
  return NextResponse.json({ layout: clean((data as { dashboard_layout?: unknown } | null)?.dashboard_layout), ready: true });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { layout?: unknown };
  const layout = b.layout === null ? null : clean(b.layout);
  const { error } = await createAdminClient().from("profiles").update({ dashboard_layout: layout }).eq("id", user.id);
  if (error) return NextResponse.json({ ok: false, ready: false }, { status: 200 }); // before migration 0066: kept on this computer only
  return NextResponse.json({ ok: true, ready: true });
}
