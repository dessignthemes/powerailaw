"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2, Folder, Users, FileText, Calendar, StickyNote, ListChecks, MessagesSquare, ChevronUp, ChevronDown, ShieldCheck, ExternalLink, CornerDownLeft } from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import RunConflictModal from "@/components/conflicts/RunConflictModal";
import type { SearchHit, SearchType } from "@/lib/data/search";

// Search everything from the top bar (Ctrl/⌘ K): matters, contacts, documents,
// events, notes, tasks and communications. Pick categories to narrow it down.

const TYPES: { key: SearchType; label: string; icon: typeof Folder }[] = [
  { key: "matters", label: "Matters", icon: Folder },
  { key: "contacts", label: "Contacts", icon: Users },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "events", label: "Events", icon: Calendar },
  { key: "notes", label: "Notes", icon: StickyNote },
  { key: "tasks", label: "Tasks", icon: ListChecks },
  { key: "communications", label: "Communications", icon: MessagesSquare },
];

export default function GlobalSearch() {
  const router = useRouter();
  const { tasks } = useWorkspaceData();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<SearchType[]>([]); // none = everything
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [eventHits, setEventHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [active, setActive] = useState(0);
  // Conflict check from Search: the typed name, or a picked client / contact. Search hides behind it and comes back on Cancel.
  const [conflictFor, setConflictFor] = useState<{ names?: string; company?: string; email?: string; phone?: string } | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Ctrl/⌘ K opens it from anywhere.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const wantEvents = only.length === 0 || only.includes("events");
  const others = only.filter((t) => t !== "events");
  const wantOthers = only.length === 0 || others.length > 0;

  // Results as you type (a short pause first).
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      if (wantOthers) {
        setLoading(true);
        fetch(`/api/search?q=${encodeURIComponent(term)}${others.length ? `&types=${others.join(",")}` : ""}`)
          .then((r) => (r.ok ? r.json() : { hits: [] }))
          .then((d: { hits?: SearchHit[] }) => live && (setHits(d.hits ?? []), setActive(0)))
          .catch(() => undefined)
          .finally(() => live && setLoading(false));
      }
      if (wantEvents && term.length >= 3) {
        setEventsLoading(true);
        fetch(`/api/search?q=${encodeURIComponent(term)}&types=events`)
          .then((r) => (r.ok ? r.json() : { hits: [] }))
          .then((d: { hits?: SearchHit[] }) => live && setEventHits(d.hits ?? []))
          .catch(() => undefined)
          .finally(() => live && setEventsLoading(false));
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, only.join(",")]);

  const term = q.trim();
  const recent = useMemo(
    () =>
      [...tasks]
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
        .slice(0, 6)
        .map((t) => ({ type: "tasks" as const, id: t.id, title: t.title, sub: t.status === "done" ? "Done" : t.dueDate ? `Due ${t.dueDate}` : "No due date", href: `/dashboard/task-board?board=${t.boardId ?? "general"}&task=${t.id}` })),
    [tasks]
  );
  const shown: SearchHit[] = term.length < 2 ? recent : [...(wantOthers ? hits : []), ...(wantEvents ? eventHits : [])].filter((h) => only.length === 0 || only.includes(h.type));
  const groups = TYPES.map((t) => ({ ...t, items: shown.filter((h) => h.type === t.key) })).filter((g) => g.items.length);
  const flat = groups.flatMap((g) => g.items);

  // A client: run the check on their client card details right away, then show the result.
  async function checkClient(clientId: string, rowId: string) {
    setCheckingId(rowId);
    setCheckError(null);
    try {
      const r = await fetch("/api/conflicts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId }) });
      const d = (await r.json().catch(() => ({}))) as { check?: { id: string }; error?: string };
      if (!r.ok || !d.check) throw new Error(d.error ?? "The conflict check couldn't be run.");
      close();
      router.push(`/dashboard/conflict-checks?check=${d.check.id}`);
    } catch (e) {
      setCheckError((e as Error).message);
    } finally {
      setCheckingId(null);
    }
  }
  const titleCase = (t: string) => t.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

  const close = () => {
    setOpen(false);
    setQ("");
    setHits([]);
    setEventHits([]);
    setOnly([]);
  };
  const go = (h: SearchHit) => {
    if (h.external) window.open(h.href, "_blank", "noopener");
    else router.push(h.href);
    close();
  };
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const move = (d: number) => setActive((a) => (flat.length ? (a + d + flat.length) % flat.length : 0));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-chip hover:bg-btn transition-colors pl-3.5 pr-2 py-2 rounded-full text-[13.5px] text-muted min-w-0 w-[300px] max-w-full"
        aria-label="Search"
      >
        <Search size={14} strokeWidth={1.75} className="flex-shrink-0" />
        <span className="flex-1 text-left truncate">Search matters, contacts, documents…</span>
        <kbd className="hidden sm:inline text-[11px] font-medium bg-white/80 rounded-md px-1.5 py-0.5 text-muted">Ctrl K</kbd>
      </button>

      {open && !conflictFor && (
        <div className="fixed inset-0 z-[70] bg-black/25 flex items-start justify-center px-4 pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div role="dialog" aria-label="Search" className="bg-page rounded-2xl w-full max-w-[760px] shadow-xl flex flex-col max-h-[80vh]">
            <div className="flex items-center gap-3 px-5 pt-4 pb-3">
              <Search size={17} className="text-muted flex-shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    move(1);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    move(-1);
                  } else if (e.key === "Enter" && flat[active]) {
                    e.preventDefault();
                    go(flat[active]);
                  } else if (e.key === "Escape") close();
                }}
                placeholder="What are you looking for today?"
                aria-label="Search"
                className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-muted"
              />
              {(loading || eventsLoading) && <Loader2 size={15} className="animate-spin text-muted" />}
              <button onClick={close} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 px-5 pb-3 border-b border-line">
              {TYPES.map((t) => {
                const on = only.includes(t.key);
                return (
                  <button
                    key={t.key}
                    onClick={() => {
                      setOnly((o) => (on ? o.filter((x) => x !== t.key) : [...o, t.key]));
                      inputRef.current?.focus(); // keep typing / arrow keys in the search box
                    }}
                    aria-pressed={on}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors ${on ? "bg-btn-hover border-transparent" : "border-line bg-white hover:bg-chip"}`}
                  >
                    <t.icon size={13} strokeWidth={1.75} /> {t.label}
                  </button>
                );
              })}
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 min-h-[200px]">
              {term.length < 2 && <div className="px-3 pb-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted">Recent tasks</div>}
              {term.length >= 2 && !groups.length && !loading && !eventsLoading && <div className="px-3 py-10 text-center text-[14px] text-muted">Nothing found for &ldquo;{term}&rdquo;{only.length ? " in the categories you picked" : ""}.</div>}
              {term.length >= 2 && !groups.length && (loading || eventsLoading) && <div className="px-3 py-10 text-center text-[14px] text-muted">Searching…</div>}
              {groups.map((g) => (
                <div key={g.key} className="mb-2">
                  {term.length >= 2 && (
                    <div className="px-3 pt-1 pb-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted flex items-center gap-1.5">
                      <g.icon size={12} /> {g.label}
                    </div>
                  )}
                  {g.items.map((h) => {
                    const i = flat.indexOf(h);
                    return (
                      <button
                        key={`${h.type}:${h.id}`}
                        data-i={i}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(h)}
                        className={`w-full text-left px-3 py-2 rounded-xl flex items-center gap-3 ${i === active ? "bg-chip" : ""}`}
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block text-[14px] font-medium truncate">{h.title}</span>
                          {h.sub && <span className="block text-[12.5px] text-muted truncate">{h.sub}</span>}
                        </span>
                        {h.person && (i === active || checkingId === h.id) && (
                          <span
                            role="button"
                            tabIndex={0}
                            title={h.person.clientId ? "Check this client against every matter now" : "Run a conflict check on this person"}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (h.person?.clientId) void checkClient(h.person.clientId, h.id);
                              else setConflictFor({ names: h.person?.name ?? h.title, company: h.person?.company ?? "", email: h.person?.email ?? "", phone: h.person?.phone ?? "" });
                            }}
                            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLElement).click()}
                            className="flex items-center gap-1 bg-white border border-line hover:bg-btn rounded-full px-2.5 py-1 text-[12px] font-medium text-ink flex-shrink-0"
                          >
                            {checkingId === h.id ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />} Conflict check
                          </span>
                        )}
                        {h.external && <ExternalLink size={13} className="text-muted flex-shrink-0" />}
                        {i === active && <CornerDownLeft size={13} className="text-muted flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))}
              {term.length >= 2 && wantEvents && eventsLoading && groups.length > 0 && <div className="px-3 py-1 text-[12.5px] text-muted">Searching your calendar…</div>}
              {checkError && <div className="mx-3 mt-2 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-3.5 py-2 text-[13px]">{checkError}</div>}
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-line text-[12.5px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="w-6 h-6 rounded-md border border-line flex items-center justify-center bg-white">
                  <ChevronUp size={13} />
                </span>
                <span className="w-6 h-6 rounded-md border border-line flex items-center justify-center bg-white">
                  <ChevronDown size={13} />
                </span>
                Navigate · Enter to open
              </span>
              <button
                onClick={() => setConflictFor({ names: term.length >= 2 ? titleCase(term) : "" })}
                title={term.length >= 2 ? `Check "${term}" against every matter` : "Check a name against every matter"}
                className="flex items-center gap-1.5 bg-chip hover:bg-btn text-ink px-3 py-1.5 rounded-full font-medium max-w-[320px]"
              >
                <ShieldCheck size={13} className="flex-shrink-0" />
                <span className="truncate">{term.length >= 2 ? `Conflict check “${term}”` : "Conflict check"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {conflictFor && (
        <RunConflictModal
          showPastLink
          initial={conflictFor}
          onClose={() => {
            setConflictFor(null); // back to the search
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          onDone={(c) => {
            setConflictFor(null);
            close();
            router.push(`/dashboard/conflict-checks?check=${c.id}`);
          }}
        />
      )}
    </>
  );
}
