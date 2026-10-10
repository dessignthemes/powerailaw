"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, Download, Lock, File as FileIcon, Check, Clock } from "lucide-react";
import DropZone from "@/components/shares/DropZone";
import { useUploads } from "@/components/shares/useUploads";
import { fmtBytes } from "@/lib/shares/types";

type View = {
  kind: "send" | "request";
  title: string;
  firm: string;
  expiresAt: string;
  needsPassword: boolean;
  locked: boolean;
  message?: string;
  files?: { id: string; name: string; size: number }[];
  maxFiles?: number;
};

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [view, setView] = useState<View | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const up = useUploads();

  const call = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/public/share/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, password: password || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(d?.error ?? "Something went wrong. Please try again."), { status: res.status, code: d?.code });
      return d;
    },
    [token, password]
  );

  useEffect(() => {
    let live = true;
    fetch(`/api/public/share/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "view" }) })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) setFatal(d?.error ?? "This link isn’t valid.");
        else setView(d);
      })
      .catch(() => live && setFatal("Couldn’t load this page. Check your connection and try again."));
    return () => {
      live = false;
    };
  }, [token]);

  async function unlock() {
    setBusy("unlock");
    setPwError(null);
    try {
      setView(await call({ action: "view" }));
    } catch (e) {
      const err = e as Error & { code?: string; status?: number };
      if (err.status === 410 || err.code === "locked") setFatal(err.message);
      else setPwError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function download(id: string) {
    setBusy(id);
    setError(null);
    try {
      const { url } = await call({ action: "download", fileId: id });
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function downloadAll() {
    for (const f of view?.files ?? []) {
      await download(f.id);
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  async function uploadAll() {
    setBusy("upload");
    setError(null);
    await up.run(
      (f) => call({ action: "upload", name: f.name, size: f.size, type: f.type }),
      async (fileId) => {
        const { file } = await call({ action: "complete", fileId });
        setView((v) => (v ? { ...v, files: [...(v.files ?? []), file] } : v));
      }
    );
    up.clear();
    setBusy(null);
  }

  const until = view ? new Date(view.expiresAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "";
  const pending = up.items.filter((i) => i.state !== "done").length;

  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-line bg-white">
        <div className="max-w-[760px] mx-auto px-5 py-4 flex items-center justify-between gap-3">
          <div className="text-[15px] font-semibold truncate">{view?.firm || "Secure files"}</div>
          <div className="flex items-center gap-1.5 text-[12px] text-muted flex-shrink-0"><ShieldCheck size={14} /> Secure file sharing by LawPower AI</div>
        </div>
      </header>

      <main className="max-w-[760px] mx-auto px-5 py-10">
        {fatal ? (
          <div className="bg-card-alt rounded-2xl px-6 py-12 text-center">
            <Lock size={22} className="mx-auto text-muted mb-3" />
            <div className="text-[16px] font-medium">{fatal}</div>
          </div>
        ) : !view ? (
          <div className="flex items-center justify-center gap-2 text-muted text-[14px] py-20"><Loader2 size={16} className="animate-spin" /> Loading…</div>
        ) : view.locked ? (
          <div className="bg-card-alt rounded-2xl p-7 max-w-[420px] mx-auto">
            <Lock size={20} className="text-muted mb-3" />
            <h1 className="text-[20px] font-semibold mb-1">{view.title}</h1>
            <p className="text-[13.5px] text-muted mb-4">This link is password protected. Enter the password {view.firm ? `${view.firm} ` : ""}gave you.</p>
            <form onSubmit={(e) => (e.preventDefault(), unlock())} className="flex gap-2">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="off" placeholder="Password" className="flex-1 bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none" />
              <button disabled={!password || busy === "unlock"} className="bg-btn hover:bg-btn-hover px-4 py-2 rounded-xl text-[14px] font-medium disabled:opacity-60">
                {busy === "unlock" ? <Loader2 size={15} className="animate-spin" /> : "Open"}
              </button>
            </form>
            {pwError && <div className="mt-2 text-[13px] text-[#B42318]">{pwError}</div>}
          </div>
        ) : (
          <>
            <h1 className="text-[26px] font-semibold">{view.title}</h1>
            <div className="text-[13px] text-muted mt-1 flex items-center gap-1.5">
              <Clock size={13} /> Available until {until}. After that the files are deleted.
            </div>
            {view.message && <div className="mt-5 bg-card-alt rounded-2xl px-4 py-3.5 text-[14px] whitespace-pre-wrap">{view.message}</div>}

            {view.kind === "send" ? (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">{view.files?.length ?? 0} file{view.files?.length === 1 ? "" : "s"}</div>
                  {(view.files?.length ?? 0) > 1 && (
                    <button onClick={downloadAll} disabled={!!busy} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors">
                      <Download size={13} /> Download all
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {(view.files ?? []).map((f) => (
                    <div key={f.id} className="flex items-center gap-3 bg-card-alt rounded-xl px-4 py-3">
                      <FileIcon size={16} strokeWidth={1.75} className="text-muted flex-shrink-0" />
                      <span className="flex-1 min-w-0 text-[14px] truncate">{f.name}</span>
                      <span className="text-[12.5px] text-muted flex-shrink-0">{fmtBytes(f.size)}</span>
                      <button onClick={() => download(f.id)} disabled={!!busy} className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors flex-shrink-0">
                        {busy === f.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download
                      </button>
                    </div>
                  ))}
                  {(view.files ?? []).length === 0 && <div className="text-[14px] text-muted">No files have been added yet.</div>}
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <DropZone items={up.items} onAdd={up.add} onRemove={busy ? undefined : up.remove} disabled={busy === "upload"} hint="PDFs, photos, Word files… up to 2 GB each" />
                {pending > 0 && (
                  <button onClick={uploadAll} disabled={busy === "upload"} className="mt-3 w-full bg-btn hover:bg-btn-hover px-4 py-2.5 rounded-xl text-[14px] font-medium transition-colors flex items-center justify-center gap-2">
                    {busy === "upload" && <Loader2 size={15} className="animate-spin" />} {busy === "upload" ? "Uploading…" : `Upload ${pending} file${pending > 1 ? "s" : ""}`}
                  </button>
                )}
                {(view.files ?? []).length > 0 && (
                  <div className="mt-6">
                    <div className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-2">Received by {view.firm || "the firm"}</div>
                    <div className="flex flex-col gap-1.5">
                      {(view.files ?? []).map((f) => (
                        <div key={f.id} className="flex items-center gap-3 bg-card-alt rounded-xl px-4 py-2.5 text-[13.5px]">
                          <Check size={15} className="text-[#2F9E5A] flex-shrink-0" />
                          <span className="flex-1 truncate">{f.name}</span>
                          <span className="text-[12.5px] text-muted">{fmtBytes(f.size)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {error && <div className="mt-3 text-[13.5px] text-[#B42318]">{error}</div>}
            <p className="mt-10 text-[12px] text-muted text-center">Files are sent over an encrypted connection and stored privately. Only people with this link{view.needsPassword ? " and its password" : ""} can open it.</p>
          </>
        )}
      </main>
    </div>
  );
}
