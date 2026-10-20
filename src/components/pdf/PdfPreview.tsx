"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X, Loader2, PenLine, Download, ZoomIn, ZoomOut } from "lucide-react";
import PdfPages from "@/components/esign/PdfPages";
import { fetchVersionBytes, versionDownloadUrl } from "@/lib/pdf/upload";

// Read-only view of a PDF: every page, zoom, and quick links to edit or download.
export default function PdfPreview({
  documentId,
  versionId,
  source,
  title,
  subtitle,
  onClose,
}: {
  documentId?: string;
  versionId?: string;
  // A PDF that isn't in Documents yet (e.g. an email attachment): where to read it and download it.
  source?: { url: string; downloadUrl: string };
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [boxWidth, setBoxWidth] = useState(800);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    const load = source
      ? fetch(source.url).then(async (r) => {
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d?.error ?? "");
          }
          return new Uint8Array(await r.arrayBuffer());
        })
      : fetchVersionBytes(versionId ?? "");
    load
      .then((b) => live && setBytes(b))
      .catch((e: Error) => live && setError(e?.message || "The PDF couldn't be loaded. Try Download instead."));
    return () => {
      live = false;
    };
  }, [versionId, source?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  // Page width follows the window (and the zoom).
  useEffect(() => {
    const measure = () => box.current && setBoxWidth(Math.max(280, box.current.clientWidth - 48));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.key === "+" || e.key === "=") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)));
      }
      if (e.key === "-" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function download() {
    try {
      window.location.assign(source ? source.downloadUrl : await versionDownloadUrl(versionId ?? "", true));
    } catch {
      setError("The download couldn't start. Please try again.");
    }
  }

  const width = Math.round(Math.min(boxWidth, 900) * zoom);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Preview ${title}`} className="bg-page rounded-3xl w-full max-w-[1100px] h-[94vh] flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-5 py-3.5 border-b border-line bg-cream">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold truncate" title={title}>
              {title}
            </div>
            {subtitle && <div className="text-[12.5px] text-muted truncate">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-1 bg-chip rounded-full p-0.5">
            <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out" className="w-8 h-8 rounded-full hover:bg-white flex items-center justify-center">
              <ZoomOut size={15} strokeWidth={1.75} />
            </button>
            <button onClick={() => setZoom(1)} className="text-[12.5px] font-medium w-12 text-center" title="Fit width">
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))} aria-label="Zoom in" className="w-8 h-8 rounded-full hover:bg-white flex items-center justify-center">
              <ZoomIn size={15} strokeWidth={1.75} />
            </button>
          </div>
          {documentId && versionId && (
          <Link
            href={`/dashboard/power-pdf/${documentId}?version=${versionId}`}
            className="bg-chip hover:bg-btn px-3.5 py-1.5 rounded-full text-[13px] font-medium flex items-center gap-1.5"
          >
            <PenLine size={13} strokeWidth={2} /> Open in Power PDF
          </Link>
          )}
          <button onClick={() => void download()} className="bg-chip hover:bg-btn px-3.5 py-1.5 rounded-full text-[13px] font-medium flex items-center gap-1.5">
            <Download size={13} strokeWidth={2} /> Download
          </button>
          <button onClick={onClose} aria-label="Close preview" className="w-9 h-9 rounded-full hover:bg-chip flex items-center justify-center">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div ref={box} className="flex-1 overflow-auto bg-[#E9EAEE] py-6">
          {error ? (
            <div className="text-center text-[14px] text-[#B42318] py-16">{error}</div>
          ) : !bytes ? (
            <div className="flex items-center justify-center gap-2 text-[14px] text-muted py-16">
              <Loader2 size={16} className="animate-spin" /> Loading preview…
            </div>
          ) : (
            <div className="mx-auto" style={{ width }}>
              <PdfPages bytes={bytes} width={width} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
