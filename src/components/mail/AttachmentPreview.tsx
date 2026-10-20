"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Loader2, X } from "lucide-react";
import type { MailProvider } from "@/lib/mail/types";
import PdfPreview from "@/components/pdf/PdfPreview";

type Att = { name: string; size: number; mimeType: string };

// What the browser can show inside LawPower: PDFs, pictures and plain text.
export function previewKind(a: Att): "pdf" | "image" | "text" | null {
  const ext = a.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf" || /pdf/i.test(a.mimeType)) return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (ext === "txt") return "text";
  return null;
}

export function attachmentUrl(provider: MailProvider, messageId: string, index: number, download = false) {
  return `/api/mail/messages/${encodeURIComponent(messageId)}/attachments/${index}?provider=${provider}${download ? "&download=1" : ""}`;
}

// Full-screen preview of one email attachment, with Download.
export default function AttachmentPreview({
  provider,
  messageId,
  index,
  attachment,
  onClose,
}: {
  provider: MailProvider;
  messageId: string;
  index: number;
  attachment: Att;
  onClose: () => void;
}) {
  const kind = previewKind(attachment);
  const src = attachmentUrl(provider, messageId, index);
  // Fetched once and shown from memory, so a mailbox problem shows a clear
  // message instead of an error page inside the preview.
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = !!kind && kind !== "pdf" && !blobUrl && !error;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!kind || kind === "pdf") return;
    let live = true;
    let made: string | null = null;
    fetch(src)
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d?.error ?? "This attachment couldn't be opened. Please try again.");
        }
        const type = kind === "text" ? "text/plain" : r.headers.get("Content-Type") ?? "";
        const blob = new Blob([await r.arrayBuffer()], { type });
        if (!live) return;
        made = URL.createObjectURL(blob);
        setBlobUrl(made);
      })
      .catch((e: Error) => live && setError(e.message || "This attachment couldn't be opened. Please try again."));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src, kind]);

  // PDFs open in LawPower's own PDF viewer (the same as in Documents), which works in every browser.
  if (kind === "pdf")
    return (
      <PdfPreview
        source={{ url: src, downloadUrl: attachmentUrl(provider, messageId, index, true) }}
        title={attachment.name}
        subtitle="Email attachment"
        onClose={onClose}
      />
    );

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Preview of ${attachment.name}`}>
      <div className="bg-white rounded-2xl w-full max-w-[1000px] h-[88vh] flex flex-col overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line">
          <FileText size={16} className="text-muted flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold truncate">{attachment.name}</div>
            <div className="text-[12px] text-muted">Email attachment</div>
          </div>
          <a
            href={attachmentUrl(provider, messageId, index, true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-chip hover:bg-btn text-[13px] font-medium"
          >
            <Download size={13} /> Download
          </a>
          <button onClick={onClose} aria-label="Close preview" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 bg-card-alt relative">
          {error ? (
            <div className="h-full flex items-center justify-center text-[14px] text-[#B42318] px-6 text-center">{error}</div>
          ) : !kind ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
              <FileText size={28} className="text-muted" />
              <div className="text-[14px] font-medium">This kind of file can&apos;t be previewed here.</div>
              <div className="text-[13px] text-muted">Download it to open it on your computer.</div>
            </div>
          ) : (
            <>
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center text-[13px] text-muted gap-2">
                  <Loader2 size={15} className="animate-spin" /> Opening…
                </div>
              )}
              {blobUrl &&
                (kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={blobUrl} alt={attachment.name} className="w-full h-full object-contain" />
                ) : (
                  <iframe title={attachment.name} src={blobUrl} className="w-full h-full bg-white" />
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
