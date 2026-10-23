import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// The firm's LawPay payment pages (Administration → Online payments).
export type PaymentSettings = { lawpayOperatingUrl: string; lawpayTrustUrl: string };
export const EMPTY_PAYMENTS: PaymentSettings = { lawpayOperatingUrl: "", lawpayTrustUrl: "" };

export class PaymentSettingsError extends Error {}

// Only secure (https) web addresses; the payment page itself is LawPay's.
export function cleanUrl(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "";
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    throw new PaymentSettingsError("That doesn't look like a web address. Copy the link of your LawPay payment page.");
  }
  if (u.protocol !== "https:") throw new PaymentSettingsError("Use the secure (https://) link of your LawPay payment page.");
  return u.toString().slice(0, 500);
}

export function cleanPayments(raw: unknown): PaymentSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const safe = (v: unknown) => {
    try {
      return cleanUrl(v);
    } catch {
      return "";
    }
  };
  return { lawpayOperatingUrl: safe(r.lawpayOperatingUrl), lawpayTrustUrl: safe(r.lawpayTrustUrl) };
}

export async function getPaymentSettings(orgId: string): Promise<PaymentSettings> {
  const { data, error } = await createAdminClient().from("organizations").select("payment_settings").eq("id", orgId).maybeSingle();
  if (error) return EMPTY_PAYMENTS; // before migration 0052
  return cleanPayments((data as { payment_settings?: unknown } | null)?.payment_settings);
}

// The link a client clicks to pay: LawPay's page, with the amount and invoice
// number added for pages that read them (others simply ignore them).
export function payLink(base: string, opts: { amount?: number; reference?: string } = {}) {
  if (!base) return "";
  const u = new URL(base);
  if (opts.amount && opts.amount > 0) u.searchParams.set("amount", opts.amount.toFixed(2));
  if (opts.reference) u.searchParams.set("reference", opts.reference.slice(0, 80));
  return u.toString();
}
