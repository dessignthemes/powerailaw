"use client";

// Browser-only pdf.js loader. The library is imported lazily so it never
// runs during server rendering, and its worker/fonts/cmaps are served from
// /public/pdfjs (copied from node_modules by scripts/copy-pdfjs-assets.mjs).

import { installStreamAsyncIterator } from "@/lib/pdf/streamPolyfill";

type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
export type PdfDoc = Awaited<ReturnType<PdfjsModule["getDocument"]>["promise"]>;
export type PdfPage = Awaited<ReturnType<PdfDoc["getPage"]>>;

let modPromise: Promise<PdfjsModule> | null = null;

export function loadPdfjs(): Promise<PdfjsModule> {
  if (!modPromise) {
    installStreamAsyncIterator();
    modPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
      // The entry module installs the same stream fix inside the worker,
      // then loads the real pdf.js worker.
      m.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.entry.mjs";
      return m;
    });
  }
  return modPromise;
}

export type OpenProblem = "encrypted" | "damaged";

export const openProblemMessages: Record<OpenProblem, string> = {
  encrypted:
    "This PDF is password-protected or has editing restrictions, so it can't be edited. Open it in the app that created it, remove the password or protection, save a copy, and upload that copy.",
  damaged:
    "This PDF appears to be damaged and can't be read. Try re-exporting or re-saving it from the original app, then upload it again.",
};

export async function openPdf(bytes: Uint8Array): Promise<{ doc: PdfDoc; close: () => Promise<void> } | { problem: OpenProblem }> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: bytes.slice(), // pdf.js transfers (detaches) the buffer it's given
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
  });
  // Never prompt for a password — report it instead.
  task.onPassword = () => {
    task.destroy();
  };
  try {
    const doc = await task.promise;
    return { doc, close: () => task.destroy() };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException") return { problem: "encrypted" };
    // destroy() from onPassword surfaces as a worker/abort error
    if (task.destroyed || name === "AbortException") return { problem: "encrypted" };
    return { problem: "damaged" };
  }
}
