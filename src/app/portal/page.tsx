"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, FileText, Eye, Download, LogOut, Folder } from "lucide-react";
import PortalHeader from "./PortalHeader";

type Home = {
  firm: string;
  clientName: string;
  email: string;
  matters: { id: string; title: string; status: string; category: string | null }[];
  documents: { id: string; matterId: string; title: string; sharedAt: string | null; versionId: string; fileType: string; size: number; updatedAt: string }[];
};

const fmtSize = (n: number) => (n < 1024 ** 2 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);
const fmtDate = (s: string) => new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const previewable = (t: string) => ["pdf", "png", "jpg", "jpeg", "gif", "webp", "txt"].includes(t.toLowerCase());

export default function PortalHome() {
  const router = useRouter();
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => live && setMissing(new URLSearchParams(window.location.search).get("missing") === "1"), 0);
    fetch("/api/portal/home")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!live) return;
        if (r.status === 401) return void router.replace("/portal/login");
        if (!r.ok) setError(d?.error ?? "Couldn’t load your documents.");
        else setHome(d);
      })
      .catch(() => live && setError("Couldn’t load your documents. Check your connection."));
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [router]);

  async function signOut() {
    await fetch("/api/portal/logout", { method: "POST" }).catch(() => null);
    router.push("/portal/login");
  }


  return (
    <>
      <PortalHeader
        firm={home?.firm}
        right={
          home && (
            <div className="flex items-center gap-3">
              <span className="hidden sm:block text-[13px] text-muted truncate max-w-[220px]">{home.email}</span>
              <button onClick={signOut} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors">
                <LogOut size={13} /> Sign out
              </button>
            </div>
          )
        }
      />
      <main className="flex-1 max-w-[960px] w-full mx-auto px-5 py-10">
        {error ? (
          <div className="bg-card-alt rounded-2xl px-6 py-10 text-center text-[14.5px]">{error}</div>
        ) : !home ? (
          <div className="flex items-center justify-center gap-2 text-muted text-[14px] py-20"><Loader2 size={16} className="animate-spin" /> Loading your documents…</div>
        ) : (
          <>
            <h1 className="text-[28px] font-semibold">Hello{home.clientName ? `, ${home.clientName.split(" ")[0]}` : ""}</h1>
            <p className="text-[14px] text-muted mt-1 mb-8">Here are the documents {home.firm} has shared with you.</p>
            {missing && <div className="mb-5 rounded-xl bg-[#FDF1E7] text-[#8A4B14] px-4 py-3 text-[13.5px]">That document isn’t available anymore. Your law firm may have stopped sharing it.</div>}

            {home.documents.length === 0 ? (
              <div className="bg-card-alt rounded-2xl px-6 py-14 text-center">
                <FileText size={22} className="mx-auto text-muted mb-3" />
                <div className="text-[15px] font-medium">No documents yet</div>
                <div className="text-[13.5px] text-muted mt-1">When {home.firm} shares a document with you, it will appear here.</div>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {[...home.matters, { id: "", title: "Other documents", status: "", category: null }]
                  .map((m) => ({ m, docs: home.documents.filter((d) => (m.id ? d.matterId === m.id : !home.matters.some((x) => x.id === d.matterId))) }))
                  .filter((g) => g.docs.length)
                  .map(({ m, docs }) => (
                    <section key={m.id || "other"}>
                      <div className="flex items-center gap-2 mb-2.5">
                        <Folder size={15} className="text-muted" />
                        <h2 className="text-[15px] font-semibold" style={{ letterSpacing: 0 }}>{m.title}</h2>
                        {m.status && <span className="text-[12px] text-muted bg-card-alt rounded-md px-1.5 py-0.5">{m.status}</span>}
                      </div>
                      <div className="flex flex-col gap-2">
                        {docs.map((d) => (
                          <div key={d.id} className="flex items-center gap-3 bg-card-alt rounded-xl px-4 py-3">
                            <FileText size={17} strokeWidth={1.75} className="text-muted flex-shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[14px] font-medium truncate">{d.title}</span>
                              <span className="block text-[12px] text-muted">
                                {d.fileType.toUpperCase()} · {fmtSize(d.size)} · updated {fmtDate(d.updatedAt)}
                              </span>
                            </span>
                            {previewable(d.fileType) && (
                              <a href={`/api/portal/file/${d.versionId}`} target="_blank" rel="noopener" className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors">
                                <Eye size={13} /> <span className="hidden sm:inline">Preview</span>
                              </a>
                            )}
                            <a href={`/api/portal/file/${d.versionId}?download=1`} className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors">
                              <Download size={13} /> <span className="hidden sm:inline">Download</span>
                            </a>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
              </div>
            )}
          </>
        )}
      </main>
      <footer className="text-center text-[12px] text-muted py-6">Secure client portal by LawPower AI · Only you and your law firm can see these documents.</footer>
    </>
  );
}
