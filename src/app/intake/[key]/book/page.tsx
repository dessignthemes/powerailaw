import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { firmByKey } from "@/lib/data/leads";
import BookingPicker from "../BookingPicker";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book a consultation", robots: { index: false, follow: false } };

// A prospective client's own link to pick (or change) their consultation time.
export default async function BookPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ t?: string }> }) {
  const { key } = await params;
  const { t } = await searchParams;
  const firm = await firmByKey(key);
  if (!firm || !t) notFound();
  return (
    <div className="min-h-screen bg-[#F3F5F9] px-4 py-10" style={{ fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif", color: "#1B191A" }}>
      <div className="max-w-[680px] mx-auto bg-white rounded-3xl shadow-[0_20px_60px_-30px_rgba(18,17,16,0.25)] px-6 sm:px-10 py-9">
        <div className="text-[13px] font-medium text-[#6B7280]">{firm.name}</div>
        <h1 className="text-[24px] font-semibold leading-tight mb-6">Book a consultation</h1>
        <BookingPicker firmKey={key} token={t} firmName={firm.name} />
      </div>
    </div>
  );
}
