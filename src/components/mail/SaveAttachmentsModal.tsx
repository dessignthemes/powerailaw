"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Paperclip, CheckCircle2 } from "lucide-react";
import type { Matter } from "@/components/NewMatterModal";
import type { MailProvider } from "@/lib/mail/types";

type Att = { name: string; size: number; mimeType: string };
export type SaveMode = "all" | "one" | "rename";

const split = (name: string) => {
  const m = name.match(/^(.*?)(\.[A-Za-z0-9]{1,8})?$/);
  return { base: m?.[1] ?? name, ext: m?.[2] ?? "" };
};

// Saves an email's attachments to a matter's Documents: all of them, just one,
// or with new names first. The email itself isn't filed.
export default function SaveAttachmentsModal({
  provider,
  messageId,
  attachments,
  mode,
  index,
  matters,
  defaultMatterId,
  onClose,
}: {
  provider: MailProvider;
  messageId: string;
  attachments: Att[];
  mode: SaveMode;
  index?: number;
  matters: Matter[];
  defaultMatterId?: string | null;
  onClose: () => void;
}) {
  const [matterId, setMatterId] = useState<string>(defaultMatterId ?? "");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<boolean[]>(() => attachments.map((_, i) => (mode === "all" ? true : i === index)));
  const [names, setNames] = useState<string[]>(() => attachments.map((a) => split(a.name).base));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const rename = mode === "rename";
  const matter = matters.find((m) => m.id === matterId) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const options = matters
    .filter((m) => m.status !== "Closed")
    .filter((m) => !q.trim() || `${m.matterNumber ?? ""} ${m.title}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 40);
  const count = picked.filter(Boolean).length;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const picks = attachments.map((a, i) => ({ index: i, name: `${names[i].trim() || split(a.name).base}${split(a.name).ext}` })).filter((_, i) => picked[i]);
      const res = await fetch(`/api/mail/messages/${encodeURIComponent(messageId)}/attachments/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, matterId, picks }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? "The attachments couldn't be saved. Please try again.");
      const added = (d.added ?? []) as string[];
      const skipped = (d.skipped ?? []) as { name: string; why: string }[];
      const parts: string[] = [];
      if (added.length) parts.push(`Saved to ${matter?.matterNumber ?? "the matter"} → Documents: ${added.join(", ")}.`);
      if (skipped.length) parts.push(`Not saved: ${skipped.map((x) => `${x.name} (${x.why})`).join("; ")}.`);
      if (!added.length && !skipped.length) parts.push("Already in this matter's Documents. Nothing new to save.");
      setDone(parts.join(" "));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "all" ? "Save all attachments to a matter" : rename ? "Rename and save to a matter" : "Save attachment to a matter";
  const input = "bg-white border border-line rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:border-btn-ring";

  return (
    <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center px-4 py-8" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-[620px] max-h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 pb-6 text-[13.5px]">
          {done ? (
            <>
              <div className="rounded-xl bg-[#E7F6EE] text-[#155C3A] px-4 py-3 flex gap-2 items-start">
                <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" /> <span>{done}</span>
              </div>
              <div className="flex justify-end mt-5">
                <button onClick={onClose} className="bg-btn hover:bg-btn-hover px-4 py-2 rounded-full font-medium">
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="font-medium mb-2">Matter</div>
              {matter ? (
                <div className="flex items-center gap-2 mb-4">
                  <span className="bg-[#E1E7F4] rounded-md px-2 py-1 font-semibold text-[12.5px]">{matter.matterNumber ?? "Matter"}</span>
                  <span className="truncate text-muted">{matter.title}</span>
                  <button onClick={() => setMatterId("")} className="ml-auto text-[12.5px] underline underline-offset-2 text-muted hover:text-ink flex-shrink-0">
                    Change
                  </button>
                </div>
              ) : (
                <div className="mb-4">
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Matter number or name" aria-label="Find a matter" className={`${input} w-full mb-2`} />
                  <div className="border border-line rounded-xl max-h-[220px] overflow-y-auto">
                    {options.length === 0 ? (
                      <div className="px-3 py-3 text-muted">No matching matters.</div>
                    ) : (
                      options.map((m) => (
                        <button key={m.id} onClick={() => setMatterId(m.id)} className="w-full text-left flex gap-2 px-3 py-2 hover:bg-chip border-b border-line last:border-0">
                          {m.matterNumber && <span className="font-semibold flex-shrink-0">{m.matterNumber}</span>}
                          <span className="truncate text-muted">{m.title}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="font-medium mb-2">{attachments.length > 1 ? "Attachments" : "Attachment"}</div>
              <div className="flex flex-col gap-2">
                {attachments.map((a, i) => {
                  const { ext } = split(a.name);
                  return (
                    <div key={i} className={`border rounded-xl px-3 py-2.5 ${picked[i] ? "border-btn bg-card-alt/50" : "border-line"}`}>
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input type="checkbox" checked={picked[i]} onChange={(e) => setPicked((p) => p.map((x, j) => (j === i ? e.target.checked : x)))} className="w-4 h-4 accent-[#5E6E8C]" />
                        <Paperclip size={13} className="text-muted flex-shrink-0" />
                        <span className="truncate">{a.name}</span>
                      </label>
                      {picked[i] && rename && (
                        <div className="flex items-center gap-2 mt-2 ml-6">
                          <span className="text-[12.5px] text-muted flex-shrink-0">Save as</span>
                          <input
                            autoFocus={rename && i === (index ?? 0)}
                            value={names[i]}
                            onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))}
                            aria-label={`New name for ${a.name}`}
                            className={`${input} flex-1 min-w-0`}
                          />
                          {ext && <span className="text-muted text-[13px] flex-shrink-0">{ext}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[12.5px] text-muted mt-3">The files go to the matter&apos;s Documents tab. The email itself isn&apos;t filed (use File to matter for that).</p>
              {error && <div className="mt-3 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3">{error}</div>}
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-full hover:bg-chip font-medium">
                  Cancel
                </button>
                <button onClick={() => void save()} disabled={busy || !matterId || !count} className="bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-2 rounded-full font-medium flex items-center gap-2">
                  {busy && <Loader2 size={14} className="animate-spin" />} Save {count === 1 ? "1 file" : `${count} files`} to matter
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
