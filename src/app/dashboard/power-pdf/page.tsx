"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import DocumentList from "@/components/pdf/DocumentList";

function PowerPdfHome() {
  const matter = useSearchParams().get("matter");
  return (
    <div className="px-10 py-10 max-w-[1100px]">
      <h1 className="text-[28px] font-semibold mb-1">Power PDF</h1>
      <p className="text-[14.5px] text-muted mb-7 max-w-[640px]">
        Upload a PDF to a matter, then fill its form fields, add text and a signature, and save the result as a new
        version. The original is always kept.
      </p>
      <DocumentList key={matter ?? ""} initialMatterId={matter} />
    </div>
  );
}

export default function PowerPdfPage() {
  return (
    <Suspense fallback={null}>
      <PowerPdfHome />
    </Suspense>
  );
}
