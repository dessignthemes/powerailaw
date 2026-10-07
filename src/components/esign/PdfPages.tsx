"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { openPdf } from "@/lib/pdf/pdfjsClient";

// Renders every page of a PDF at the given width; `overlay(pageNumber)` is
// drawn on top of each page (positioned in fractions of the page).
export default function PdfPages({
  bytes,
  width,
  overlay,
  onPageClick,
}: {
  bytes: Uint8Array;
  width: number;
  overlay?: (page: number) => React.ReactNode;
  onPageClick?: (page: number, fx: number, fy: number) => void;
}) {
  const [pages, setPages] = useState<{ n: number; ratio: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvases = useRef(new Map<number, HTMLCanvasElement>());

  useEffect(() => {
    let cancelled = false;
    let close: (() => Promise<void>) | null = null;
    (async () => {
      const res = await openPdf(bytes);
      if ("problem" in res) {
        if (!cancelled) setError(res.problem === "encrypted" ? "This PDF is password-protected and can't be shown." : "This PDF couldn't be read.");
        return;
      }
      close = res.close;
      const doc = res.doc;
      const list: { n: number; ratio: number }[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const p = await doc.getPage(n);
        const vp = p.getViewport({ scale: 1 });
        list.push({ n, ratio: vp.height / vp.width });
      }
      if (cancelled) return;
      setPages(list);
      // Wait a frame so the canvases exist, then draw them.
      await new Promise((r) => requestAnimationFrame(r));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const { n } of list) {
        if (cancelled) return;
        const c = canvases.current.get(n);
        if (!c) continue;
        const p = await doc.getPage(n);
        const vp = p.getViewport({ scale: (width / p.getViewport({ scale: 1 }).width) * dpr });
        c.width = vp.width;
        c.height = vp.height;
        await p.render({ canvasContext: c.getContext("2d")!, viewport: vp, canvas: c } as Parameters<typeof p.render>[0]).promise;
      }
    })().catch(() => !cancelled && setError("This PDF couldn't be shown."));
    return () => {
      cancelled = true;
      void close?.();
    };
  }, [bytes, width]);

  if (error) return <div className="py-16 text-center text-[14px] text-red-700">{error}</div>;
  if (!pages) return <div className="py-16 flex items-center justify-center gap-2 text-[14px] text-muted"><Loader2 size={16} className="animate-spin" /> Loading document…</div>;

  return (
    <div className="flex flex-col items-center gap-5">
      {pages.map(({ n, ratio }) => (
        <div key={n} className="relative bg-white shadow-[0_2px_12px_rgba(20,24,33,0.12)]" style={{ width, height: width * ratio }}>
          <canvas
            ref={(el) => {
              if (el) canvases.current.set(n, el);
            }}
            className="absolute inset-0 w-full h-full"
            onClick={(e) => {
              if (!onPageClick) return;
              const r = (e.target as HTMLElement).getBoundingClientRect();
              onPageClick(n, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
            }}
          />
          <div className="absolute inset-0 pointer-events-none">
            <div className="relative w-full h-full">{overlay?.(n)}</div>
          </div>
          <div className="absolute -bottom-5 right-0 text-[11px] text-muted">Page {n} of {pages.length}</div>
        </div>
      ))}
    </div>
  );
}
