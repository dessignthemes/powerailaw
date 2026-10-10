"use client";

import { useRef, useState } from "react";
import { Upload, X, Check, AlertCircle, File as FileIcon } from "lucide-react";
import { fmtBytes, MAX_FILE_BYTES } from "@/lib/shares/types";
import type { UploadItem } from "./useUploads";

export default function DropZone({
  items,
  onAdd,
  onRemove,
  disabled,
  hint,
}: {
  items: UploadItem[];
  onAdd: (files: File[]) => void;
  onRemove?: (key: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [tooBig, setTooBig] = useState<string | null>(null);
  const accept = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list);
    const big = files.filter((f) => f.size > MAX_FILE_BYTES);
    setTooBig(big.length ? `${big.map((f) => f.name).join(", ")} ${big.length > 1 ? "are" : "is"} over 2 GB and can’t be added.` : null);
    const ok = files.filter((f) => f.size > 0 && f.size <= MAX_FILE_BYTES);
    if (ok.length) onAdd(ok);
  };

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) accept(e.dataTransfer.files);
        }}
        className={`w-full rounded-2xl border border-dashed px-5 py-7 flex flex-col items-center gap-1.5 text-center transition-colors disabled:opacity-50 ${
          over ? "border-[#3B82F6] bg-[#EEF4FF]" : "border-btn-ring bg-card-alt hover:bg-chip"
        }`}
      >
        <Upload size={20} strokeWidth={1.75} className="text-muted" />
        <span className="text-[14px] font-medium">Drop files here or click to choose</span>
        <span className="text-[12.5px] text-muted">{hint ?? "Any file type, up to 2 GB each"}</span>
      </button>
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => (accept(e.target.files), (e.target.value = ""))} />
      {tooBig && <div className="mt-2 text-[12.5px] text-[#B42318]">{tooBig}</div>}
      {items.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {items.map((it) => (
            <div key={it.key} className="bg-card-alt rounded-xl px-3 py-2">
              <div className="flex items-center gap-2.5">
                <FileIcon size={14} strokeWidth={1.75} className="text-muted flex-shrink-0" />
                <span className="text-[13px] truncate flex-1">{it.file.name}</span>
                <span className="text-[12px] text-muted flex-shrink-0">{fmtBytes(it.file.size)}</span>
                {it.state === "done" && <Check size={14} className="text-[#2F9E5A]" />}
                {it.state === "error" && <AlertCircle size={14} className="text-[#B42318]" />}
                {it.state === "uploading" && <span className="text-[12px] text-muted w-9 text-right">{it.pct}%</span>}
                {it.state === "waiting" && onRemove && (
                  <button type="button" onClick={() => onRemove(it.key)} aria-label={`Remove ${it.file.name}`} className="text-muted hover:text-ink">
                    <X size={14} />
                  </button>
                )}
              </div>
              {it.state === "uploading" && (
                <div className="mt-1.5 h-1 rounded-full bg-white overflow-hidden">
                  <div className="h-full bg-[#3B82F6] transition-all" style={{ width: `${it.pct}%` }} />
                </div>
              )}
              {it.state === "error" && <div className="mt-1 text-[12px] text-[#B42318]">{it.error}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
