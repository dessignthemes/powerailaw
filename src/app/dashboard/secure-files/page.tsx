"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Send, Inbox, ChevronDown, ChevronRight, Download, Trash2, Link2, Mail, Copy, Check, Loader2, KeyRound, ShieldCheck, Clock, Eye, Upload,
} from "lucide-react";
import CreateShareModal, { linkFor, mailtoFor } from "@/components/shares/CreateShareModal";
import DropZone from "@/components/shares/DropZone";
import { useUploads, api } from "@/components/shares/useUploads";
import { fmtBytes, SHARE_DAYS, type Share, type ShareEvent, type ShareKind } from "@/lib/shares/types";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
function left(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const h = Math.ceil(ms / 3_600_000);
  const d = Math.ceil(ms / 86_400_000);
  return h > 24 ? `Deletes in ${d} days` : `Deletes in ${h} hour${h > 1 ? "s" : ""}`;
}
const eventText: Record<ShareEvent["type"], string> = { opened: "Link opened", downloaded: "Downloaded", uploaded: "Uploaded", locked: "Locked after too many wrong passwords" };

export default function SecureFilesPage() {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<ShareKind | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [showEnded, setShowEnded] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api("/api/shares");
      setShares(d.shares);
      setError(null);
    } catch (e) {
      setShares([]);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    let live = true;
    api("/api/shares")
      .then((d) => live && setShares(d.shares))
      .catch((e: Error) => {
        if (!live) return;
        setShares([]);
        setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);

  const active = (shares ?? []).filter((s) => s.status === "active");
  const ended = (shares ?? []).filter((s) => s.status !== "active");

  return (
    <div className="px-10 py-10 max-w-[1100px]">
      <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
        <div>
          <h1 className="text-[28px] font-semibold mb-1">Secure Files</h1>
          <p className="text-[14.5px] text-muted mt-1 max-w-[680px]">
            Send large files to anyone, or ask a client to upload documents for you, through a private link. Links and their files are deleted automatically after {SHARE_DAYS} days.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCreating("request")} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors">
            <Inbox size={14} strokeWidth={1.75} /> Request files
          </button>
          <button onClick={() => setCreating("send")} className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors">
            <Send size={14} strokeWidth={1.75} /> Send files
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[12.5px] text-muted mb-6 flex-wrap">
        <span className="flex items-center gap-1.5"><ShieldCheck size={13} /> Private links, impossible to guess</span>
        <span className="flex items-center gap-1.5"><KeyRound size={13} /> Optional password</span>
        <span className="flex items-center gap-1.5"><Clock size={13} /> Deleted after {SHARE_DAYS} days</span>
        <span className="flex items-center gap-1.5"><Upload size={13} /> Up to 2 GB per file</span>
      </div>

      {error && <div className="mb-4 rounded-xl bg-[#FDF1E7] text-[#8A4B14] px-4 py-3 text-[13.5px]">{error}</div>}

      {shares === null ? (
        <div className="text-[13.5px] text-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : active.length === 0 && !error ? (
        <div className="bg-card-alt rounded-2xl px-6 py-12 text-center">
          <div className="text-[15px] font-medium">No active links</div>
          <div className="text-[13.5px] text-muted mt-1">Use <b>Send files</b> to share documents, or <b>Request files</b> to collect them from a client.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {active.map((s) => (
            <ShareRow key={s.id} share={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} onChanged={load} />
          ))}
        </div>
      )}

      {ended.length > 0 && (
        <div className="mt-8">
          <button onClick={() => setShowEnded((v) => !v)} className="text-[13px] text-muted hover:text-ink flex items-center gap-1">
            {showEnded ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Ended links ({ended.length})
          </button>
          {showEnded && (
            <div className="mt-2 flex flex-col gap-1.5">
              {ended.map((s) => (
                <div key={s.id} className="flex items-center gap-3 bg-card-alt rounded-xl px-4 py-2.5 text-[13px]">
                  {s.kind === "send" ? <Send size={13} className="text-muted" /> : <Inbox size={13} className="text-muted" />}
                  <span className="flex-1 truncate">{s.title}</span>
                  <span className="text-muted">{s.status === "cancelled" ? "Cancelled" : "Expired"} · files deleted</span>
                  <span className="text-muted">{when(s.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {creating && <CreateShareModal kind={creating} onClose={() => setCreating(null)} onCreated={load} />}
    </div>
  );
}

function ShareRow({ share: s, open, onToggle, onChanged }: { share: Share; open: boolean; onToggle: () => void; onChanged: () => void }) {
  const [events, setEvents] = useState<ShareEvent[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const up = useUploads();
  const total = s.files.reduce((n, f) => n + f.size, 0);
  const send = s.kind === "send";

  useEffect(() => {
    if (!open) return;
    let live = true;
    api(`/api/shares/${s.id}`).then((d) => live && setEvents(d.events)).catch(() => live && setEvents([]));
    return () => {
      live = false;
    };
  }, [open, s.id, s.files.length]);

  async function act(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const download = (fileId: string) =>
    act(`dl-${fileId}`, async () => {
      const { url } = await api(`/api/shares/${s.id}`, { action: "download", fileId });
      window.location.href = url;
    });

  const makeLink = () =>
    act("link", async () => {
      if (!confirm("Make a new link? The old link will stop working.")) return;
      const { token } = await api(`/api/shares/${s.id}`, { action: "newLink" });
      setLink(linkFor(token));
    });

  const cancel = () =>
    act("cancel", async () => {
      if (!confirm(`Cancel “${s.title}”? The link stops working and its files are deleted now.`)) return;
      await api(`/api/shares/${s.id}`, undefined, "DELETE");
      onChanged();
    });

  const addFiles = () =>
    act("add", async () => {
      await up.run(
        (f) => api(`/api/shares/${s.id}`, { action: "upload", name: f.name, size: f.size, type: f.type }),
        (fileId) => api(`/api/shares/${s.id}`, { action: "complete", fileId })
      );
      up.clear();
      onChanged();
    });

  const downloads = s.files.reduce((n, f) => n + f.downloadCount, 0);

  return (
    <div className="bg-card-alt rounded-2xl">
      <button onClick={onToggle} className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left">
        <span className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
          {send ? <Send size={15} strokeWidth={1.75} /> : <Inbox size={15} strokeWidth={1.75} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[14px] font-medium truncate">{s.title}</span>
            {s.hasPassword && <KeyRound size={12} className="text-muted flex-shrink-0" aria-label="Password protected" />}
          </span>
          <span className="block text-[12.5px] text-muted truncate">
            {send ? "Sent" : "Upload request"}
            {s.recipientEmail ? ` to ${s.recipientEmail}` : ""} · {s.files.length} file{s.files.length === 1 ? "" : "s"}
            {s.files.length ? ` (${fmtBytes(total)})` : ""}
            {send ? ` · ${downloads} download${downloads === 1 ? "" : "s"}` : ""}
            {s.openCount ? ` · opened ${s.openCount}×` : " · not opened yet"}
          </span>
        </span>
        <span className="text-[12px] text-muted flex-shrink-0 flex items-center gap-1"><Clock size={12} /> {left(s.expiresAt)}</span>
        {open ? <ChevronDown size={15} className="text-muted" /> : <ChevronRight size={15} className="text-muted" />}
      </button>

      {open && (
        <div className="px-4 pb-4">
          {s.message && <div className="text-[13px] text-muted bg-page rounded-xl px-3.5 py-2.5 mb-3 whitespace-pre-wrap">{s.message}</div>}

          <div className="bg-page rounded-xl p-3 mb-3">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-2">{send ? "Files shared" : "Files received"}</div>
            {s.files.length === 0 && <div className="text-[13px] text-muted">{send ? "No files yet." : "Nothing uploaded yet."}</div>}
            <div className="flex flex-col gap-1">
              {s.files.map((f) => (
                <div key={f.id} className="flex items-center gap-2.5 text-[13px] py-1">
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-muted text-[12px]">{fmtBytes(f.size)}</span>
                  {send && <span className="text-muted text-[12px] w-[90px] text-right">{f.downloadCount ? `${f.downloadCount} download${f.downloadCount > 1 ? "s" : ""}` : "not downloaded"}</span>}
                  {!send && <span className="text-muted text-[12px]">{when(f.createdAt)}</span>}
                  <button onClick={() => download(f.id)} disabled={!!busy} className="flex items-center gap-1 bg-chip hover:bg-btn px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors">
                    {busy === `dl-${f.id}` ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Download
                  </button>
                </div>
              ))}
            </div>
            {send && (
              <div className="mt-3">
                <DropZone items={up.items} onAdd={up.add} onRemove={busy ? undefined : up.remove} disabled={!!busy} hint="Add more files to this link (up to 2 GB each)" />
                {up.items.some((i) => i.state !== "done") && (
                  <button onClick={addFiles} disabled={!!busy} className="mt-2 bg-btn hover:bg-btn-hover px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors flex items-center gap-1.5">
                    {busy === "add" && <Loader2 size={13} className="animate-spin" />} Upload {up.items.filter((i) => i.state !== "done").length} file(s)
                  </button>
                )}
              </div>
            )}
          </div>

          {link && (
            <div className="flex items-center gap-2 mb-3">
              <input readOnly value={link} onFocus={(e) => e.target.select()} className="flex-1 bg-white border border-line rounded-xl px-3 py-2 text-[12.5px] font-mono outline-none" />
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
              </button>
              <a href={mailtoFor(s.kind, s.recipientEmail ?? "", s.title, link, s.expiresAt, s.hasPassword)} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors">
                <Mail size={13} /> Email
              </a>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={makeLink} disabled={!!busy} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors">
              <Link2 size={13} /> {link ? "Make another new link" : "Get a new link"}
            </button>
            <button onClick={cancel} disabled={!!busy} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3.5 py-1.5 rounded-full text-[13px] font-medium text-[#B42318] transition-colors">
              <Trash2 size={13} /> Cancel link & delete files
            </button>
            <span className="text-[12px] text-muted ml-auto">Created {when(s.createdAt)}{s.createdByEmail ? ` by ${s.createdByEmail}` : ""}</span>
          </div>
          {err && <div className="mt-2 text-[12.5px] text-[#B42318]">{err}</div>}

          <div className="mt-4">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-1.5 flex items-center gap-1.5"><Eye size={12} /> Activity</div>
            {events === null ? (
              <div className="text-[12.5px] text-muted">Loading…</div>
            ) : events.length === 0 ? (
              <div className="text-[12.5px] text-muted">No activity yet.</div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {events.slice(0, 20).map((e, i) => (
                  <div key={i} className="text-[12.5px] flex gap-3">
                    <span className="text-muted w-[120px] flex-shrink-0">{when(e.at)}</span>
                    <span>{eventText[e.type]}{e.fileName ? `: ${e.fileName}` : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
