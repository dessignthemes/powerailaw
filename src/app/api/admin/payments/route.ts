import { NextResponse } from "next/server";
import { requireUserOrg } from "@/lib/data/documents";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentSettings, cleanUrl, PaymentSettingsError } from "@/lib/payments/settings";

export const dynamic = "force-dynamic";

// Administration → Online payments (LawPay links). GET → settings. PATCH → save.
export async function GET() {
  try {
    const { orgId } = await requireUserOrg();
    return NextResponse.json({ settings: await getPaymentSettings(orgId) });
  } catch (e) {
    console.error("GET /api/admin/payments failed:", e);
    return NextResponse.json({ error: "Couldn't load the payment settings." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { orgId } = await requireUserOrg();
    const b = (await request.json().catch(() => ({}))) as { lawpayOperatingUrl?: unknown; lawpayTrustUrl?: unknown };
    const settings = { lawpayOperatingUrl: cleanUrl(b.lawpayOperatingUrl), lawpayTrustUrl: cleanUrl(b.lawpayTrustUrl) };
    const { error } = await createAdminClient().from("organizations").update({ payment_settings: settings }).eq("id", orgId);
    if (error) return NextResponse.json({ error: "Couldn't save. Run migration 0052_payment_settings.sql in Supabase first." }, { status: 503 });
    return NextResponse.json({ settings });
  } catch (e) {
    if (e instanceof PaymentSettingsError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("PATCH /api/admin/payments failed:", e);
    return NextResponse.json({ error: "Couldn't save the payment settings." }, { status: 500 });
  }
}
