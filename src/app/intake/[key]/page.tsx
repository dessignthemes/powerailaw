import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { firmByKey, invitePrefill } from "@/lib/data/leads";
import IntakeForm from "./IntakeForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Intake form", robots: { index: false, follow: false } };

// The firm's public intake form: lawpower.ai/intake/<key>, linked from or embedded
// in the firm's website (?embed=1), or sent to one person (?invite=<token>).
export default async function IntakePage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ invite?: string; embed?: string }> }) {
  const { key } = await params;
  const sp = await searchParams;
  const firm = await firmByKey(key);
  if (!firm) notFound();
  const prefill = await invitePrefill(firm.orgId, sp.invite ?? null).catch(() => null);
  return <IntakeForm firmKey={key} firmName={firm.name} logoUrl={firm.logoUrl} invite={prefill ? sp.invite ?? null : null} prefill={prefill ?? {}} embed={sp.embed === "1"} />;
}
