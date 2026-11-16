"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowUp, Folder, ChevronDown, Search, Check, ArrowUpRight } from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";

// "Ask Donna" in the top bar: the AI Agent, one click away from any page. Type a
// question (optionally about a matter) and it opens in the AI Agent and is sent.
export default function AskDonna() {
  const router = useRouter();
  const { matters } = useWorkspaceData();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [matterId, setMatterId] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [find, setFind] = useState("");
  const box = useRef<HTMLDivElement | null>(null);
  const text = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => text.current?.focus(), 0);
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const list = useMemo(() => {
    const w = find.trim().toLowerCase();
    return matters
      .filter((m) => !["Closed", "Not proceeding"].includes(m.status))
      .filter((m) => !w || `${m.matterNumber ?? ""} ${m.title}`.toLowerCase().includes(w))
      .slice(0, 60);
  }, [matters, find]);
  const matter = matters.find((m) => m.id === matterId) ?? null;

  function ask() {
    const question = q.trim();
    if (!question) return;
    const qs = new URLSearchParams({ q: question.slice(0, 4000), send: "1", ...(matterId ? { matter: matterId } : {}) });
    setOpen(false);
    setQ("");
    router.push(`/dashboard/agent?${qs}`);
  }

  return (
    <>
    {/* The page dims behind the box, like Search. */}
    {open && <div className="fixed inset-0 z-[64] bg-black/25" aria-hidden />}
    <div ref={box} className={`relative flex-shrink-0 ${open ? "z-[65]" : ""}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 bg-[#F3F2F0] border border-[#E8E6E2] rounded-full p-1"
      >
        <span className="flex items-center gap-2 bg-white border border-[#E9E7E4] rounded-full px-4 py-1.5 text-[13.5px] font-medium hover:bg-[#FAFAF9]">
          <Sparkles size={15} strokeWidth={1.75} /> Ask Donna
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-[65] w-[min(640px,calc(100vw-48px))] bg-[#F3F2F0] border border-[#E8E6E2] rounded-[22px] p-1.5">
          <div className="bg-white border border-[#E9E7E4] rounded-2xl p-4">
            <textarea
              ref={text}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask();
                }
              }}
              rows={3}
              placeholder="Ask anything"
              aria-label="Ask Donna"
              className="w-full resize-none outline-none text-[15px] placeholder:text-muted bg-transparent"
            />
            <div className="flex items-center gap-2 mt-2">
              <div className="relative">
                <button onClick={() => setPickOpen((p) => !p)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium bg-[#F3F2F0] hover:bg-[#E7E5E1] max-w-[280px]">
                  <Folder size={13} strokeWidth={1.75} />
                  <span className="truncate">{matter ? `${matter.matterNumber ? `${matter.matterNumber} · ` : ""}${matter.title}` : "No matter"}</span>
                  <ChevronDown size={12} />
                </button>
                {pickOpen && (
                  <div className="absolute left-0 top-full mt-1 z-10 w-[340px] bg-white border border-[#E8E6E2] rounded-xl p-1.5">
                    <div className="flex items-center gap-2 bg-[#F3F2F0] rounded-full px-3 py-1.5 mb-1">
                      <Search size={13} className="text-muted" />
                      <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a matter" className="flex-1 bg-transparent outline-none text-[13px]" />
                    </div>
                    <div className="max-h-[260px] overflow-y-auto">
                      <button onClick={() => (setMatterId(null), setPickOpen(false))} className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[13px] hover:bg-[#F3F2F0] text-muted">
                        No matter (a general question) {!matterId && <Check size={13} />}
                      </button>
                      {list.map((m) => (
                        <button key={m.id} onClick={() => (setMatterId(m.id), setPickOpen(false))} className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-[13px] hover:bg-[#F3F2F0] text-left">
                          <span className="truncate">
                            {m.matterNumber && <span className="text-muted">{m.matterNumber} · </span>}
                            {m.title}
                          </span>
                          {matterId === m.id && <Check size={13} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => (setOpen(false), router.push("/dashboard/agent"))} className="text-[12.5px] text-muted hover:text-ink flex items-center gap-1">
                Open AI Agent <ArrowUpRight size={12} />
              </button>
              <button onClick={ask} disabled={!q.trim()} aria-label="Ask" className="ml-auto w-9 h-9 rounded-full bg-btn hover:bg-btn-hover flex items-center justify-center disabled:opacity-40">
                <ArrowUp size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
