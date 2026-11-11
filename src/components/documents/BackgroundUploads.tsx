"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Loader2, RotateCcw, UploadCloud, X, AlertCircle } from "lucide-react";
import { subscribeUploads, getUploads, retryUpload, clearFinished, removeUpload, isUploading } from "@/lib/uploads/backgroundUploads";

const EMPTY: ReturnType<typeof getUploads> = [];

// Small panel at the bottom right while documents upload in the background.
export default function BackgroundUploads() {
  const items = useSyncExternalStore(subscribeUploads, getUploads, () => EMPTY);
  const [open, setOpen] = useState(true);
  const active = items.filter((x) => x.status === "waiting" || x.status === "uploading").length;
  const done = items.filter((x) => x.status === "done").length;
  const failed = items.filter((x) => x.status === "error").length;

  // Closing or reloading the tab would stop the uploads: ask first.
  useEffect(() => {
    if (!active) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!isUploading()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [active]);

  // All added without problems: the panel hides itself after a few seconds.
  useEffect(() => {
    if (active || failed || !done) return;
    const t = setTimeout(clearFinished, 8000);
    return () => clearTimeout(t);
  }, [active, failed, done]);

  if (!items.length) return null;
  const total = items.length;
  const matters = [...new Map(items.map((x) => [x.matterId, x.matterTitle])).entries()];

  return (
    <div className="fixed bottom-5 right-5 z-[45] w-[360px] max-w-[calc(100vw-40px)] bg-[#F3F2F0] border border-[#E8E6E2] rounded-[22px] p-1.5 ">
      <div className="bg-white border border-[#E9E7E4] rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3">
          {active ? (
            <Loader2 size={16} className="animate-spin text-muted flex-shrink-0" />
          ) : failed ? (
            <AlertCircle size={16} className="text-[#B42318] flex-shrink-0" />
          ) : (
            <Check size={16} strokeWidth={2.25} className="text-[#1F7A4D] flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold truncate">
              {active ? `Adding documents… ${done + failed} of ${total}` : failed ? `${failed} couldn't be added` : `${done} ${done === 1 ? "document" : "documents"} added`}
            </div>
            <div className="text-[12px] text-muted truncate">
              {active ? "You can keep working. Don't close this tab." : matters.length === 1 ? matters[0][1] : `${matters.length} matters`}
            </div>
          </div>
          <button onClick={() => setOpen((o) => !o)} aria-label={open ? "Hide list" : "Show list"} className="w-7 h-7 rounded-full hover:bg-[#F3F2F0] flex items-center justify-center text-muted">
            {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
          {!active && (
            <button onClick={clearFinished} aria-label="Close" className="w-7 h-7 rounded-full hover:bg-[#F3F2F0] flex items-center justify-center text-muted">
              <X size={15} />
            </button>
          )}
        </div>
        {active > 0 && (
          <div className="h-1 bg-[#F1F0EE]">
            <div className="h-full bg-[#5E7BA6] transition-all" style={{ width: `${Math.round(((done + failed) / total) * 100)}%` }} />
          </div>
        )}
        {open && (
          <div className="max-h-[260px] overflow-y-auto border-t border-[#EBEAE7] divide-y divide-[#F1F0ED]">
            {items.map((x) => (
              <div key={x.id} className="px-4 py-2 text-[12.5px]">
                <div className="flex items-center gap-2">
                  <UploadCloud size={13} className="text-muted flex-shrink-0" />
                  <span className="flex-1 truncate" title={x.file.name}>
                    {x.file.name}
                  </span>
                  {x.status === "waiting" && <span className="text-muted">Waiting</span>}
                  {x.status === "uploading" && <Loader2 size={13} className="animate-spin text-muted" />}
                  {x.status === "done" && <Check size={13} strokeWidth={2.25} className="text-[#1F7A4D]" />}
                  {x.status === "error" && (
                    <>
                      <button onClick={() => retryUpload(x.id)} className="text-muted hover:text-ink" title="Try again" aria-label={`Try ${x.file.name} again`}>
                        <RotateCcw size={13} />
                      </button>
                      <button onClick={() => removeUpload(x.id)} className="text-muted hover:text-ink" title="Remove" aria-label={`Remove ${x.file.name}`}>
                        <X size={13} />
                      </button>
                    </>
                  )}
                </div>
                {x.error && <div className="text-[11.5px] text-[#B42318] mt-0.5 pl-5">{x.error}</div>}
              </div>
            ))}
          </div>
        )}
        {!active && matters.length === 1 && (
          <div className="px-4 py-2 border-t border-[#EBEAE7]">
            <Link href={`/dashboard/matters/${matters[0][0]}?tab=documents`} className="text-[12.5px] font-medium underline underline-offset-2 text-muted hover:text-ink">
              Open the matter&apos;s documents
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
