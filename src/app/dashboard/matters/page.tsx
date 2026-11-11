"use client";

import ClickAway from "@/components/ClickAway";
import ImportLeapModal from "@/components/matters/ImportLeapModal";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  ChevronDown,
  ChevronRight,
  Check,
  Pencil,
  CheckCircle2,
  RotateCcw,
  Trash2,
  MoreHorizontal,
  X,
  Upload,
  Search,
  Plus,
  ArrowUpDown,
} from "lucide-react";
import NewMatterModal, {
  numberOf,
  Matter,
  MatterStatus,
  matterStatusOrder,
  matterStatusMeta,
} from "@/components/NewMatterModal";
import { getInitials, getAvatarColor } from "@/components/NewClientModal";
import { GenericDropdown } from "@/components/NewTaskModal";
import { menuPanel, menuItem, frameOuter, frameInner, frameTitle, pageBtnB } from "@/lib/ui";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";

function RowStatusPicker({
  status,
  onChange,
}: {
  status: MatterStatus;
  onChange: (s: MatterStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = matterStatusMeta[status].icon;

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-chip transition-colors flex-shrink-0"
      >
        <Icon size={16} strokeWidth={2} className={matterStatusMeta[status].color} />
      </button>
      {open && (
        <>
          <ClickAway onClose={() => setOpen(false)} />
          <div className={`absolute left-0 top-[calc(100%+12px)] z-50 ${menuPanel} w-[170px]`}>
            {matterStatusOrder.map((s) => {
              const OptIcon = matterStatusMeta[s].icon;
              return (
                <button
                  key={s}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(s);
                    setOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium hover:bg-[#F7F6F2] transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <OptIcon size={15} strokeWidth={2} className={matterStatusMeta[s].color} />
                    {s}
                  </span>
                  {s === status && <Check size={14} strokeWidth={2} />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function MattersPage() {
  const router = useRouter();
  const {
    matters,
    mattersLoaded,
    addMatter,
    updateMatter,
    deleteMatters,
    bulkSetMatterStatus,
    clients,
    refreshAll,
  } = useWorkspaceData();
  // Import CSV file (matters from LEAP, Clio, PracticePanther, a spreadsheet…).
  const [importOpen, setImportOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Shown only after the matters load in the browser, so reading the saved choice here is safe.
  const [sortBy, setSortByState] = useState<SortKey>(() => {
    try {
      const v = typeof window !== "undefined" ? (localStorage.getItem("lp:matters-sort") as SortKey | null) : null;
      return v && SORTS.some((x) => x.key === v) ? v : "default";
    } catch {
      return "default";
    }
  });
  const [sortOpen, setSortOpen] = useState(false);
  const setSortBy = (k: SortKey) => {
    setSortByState(k);
    setSortOpen(false);
    try {
      localStorage.setItem("lp:matters-sort", k);
    } catch {
      /* private mode */
    }
  };

  const [modalOpen, setModalOpen] = useState(false);
  // ?new=1 (Dashboard → Shortcuts → New matter) opens the New matter window.
  useEffect(() => {
    const t = setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("new") === "1") setModalOpen(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const [editingMatter, setEditingMatter] = useState<Matter | null>(null);
  const [collapsed, setCollapsed] = useState<Set<MatterStatus>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowMenuFor, setRowMenuFor] = useState<string | null>(null);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);

  function toggleCollapsed(status: MatterStatus) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateMatterStatus(matter: Matter, status: MatterStatus) {
    updateMatter({ ...matter, status, updatedAt: new Date().toISOString() });
  }

  function handleDelete(ids: string[]) {
    deleteMatters(ids);
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  function bulkSetStatus(status: MatterStatus) {
    bulkSetMatterStatus(Array.from(selected), status);
    setBulkStatusOpen(false);
  }

  function clientFor(clientId: string | null) {
    return clientId ? clients.find((c) => c.id === clientId) ?? null : null;
  }

  // Search: matter number, title, client, other side, type. Every word must match.
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shownMatters = words.length
    ? matters.filter((m) => {
        const hay = [m.title, m.matterNumber, numberOf(m), clientFor(m.clientId)?.name, m.counterparty, m.category, m.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return words.every((w) => hay.includes(w));
      })
    : matters;

  // Sort by (inside each status group); the choice is remembered in this browser.
  const sorted = sortMatters(shownMatters, sortBy, (m) => clientFor(m.clientId)?.name ?? "");
  const groups = matterStatusOrder
    .map((status) => ({ status, items: sorted.filter((m) => m.status === status) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="px-10 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-[28px] font-semibold">
          Matters <span className="text-muted font-normal text-[18px]">/ {matters.length}</span>
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className={pageBtnB}
          >
            <Upload size={14} /> Import CSV file
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className={pageBtnB}
          >
            <Plus size={14} /> Add matter
          </button>
        </div>
      </div>
      {mattersLoaded && matters.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap -mt-3 mb-6">
        <div className="relative flex-1 min-w-[260px] max-w-[520px] bg-[#F3F2F0] border border-[#EBE8DF] rounded-full p-1 shadow-[0_2px_6px_-1px_rgba(27,25,26,0.07)]">
          <Search size={15} strokeWidth={1.75} className="absolute left-[18px] top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Search matters: number, client, title, other side…"
            aria-label="Search matters"
            className="w-full bg-white border border-[#ECE9E1] rounded-full pl-10 pr-24 py-2 text-[14px] outline-none focus:border-[#D7D1C0] shadow-[0_1px_3px_rgba(27,25,26,0.06)]"
          />
          {query && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-[12.5px] text-muted">
              {shownMatters.length} found
              <button onClick={() => setQuery("")} aria-label="Clear search" className="hover:text-ink">
                <X size={14} />
              </button>
            </span>
          )}
        </div>
        <div className="bg-[#F3F2F0] border border-[#EBE8DF] rounded-full p-1 shadow-[0_2px_6px_-1px_rgba(27,25,26,0.07)]">
          <GenericDropdown
            open={sortOpen}
            setOpen={setSortOpen}
            trigger={
              <>
                <ArrowUpDown size={13} strokeWidth={1.75} />
                Sort: {SORTS.find((x) => x.key === sortBy)?.label}
              </>
            }
          >
            <div className="min-w-[220px]">
              {SORTS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => setSortBy(o.key)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium hover:bg-chip transition-colors text-left"
                >
                  {o.label}
                  {o.key === sortBy && <Check size={14} strokeWidth={2} />}
                </button>
              ))}
            </div>
          </GenericDropdown>
        </div>
        </div>
      )}
      {importOpen && (
        <ImportLeapModal
          existingNumbers={new Set(matters.flatMap((m) => [m.matterNumber, numberOf(m)]).filter((n): n is string => !!n).map((n) => n.toUpperCase()))}
          onClose={() => setImportOpen(false)}
          onDone={() => refreshAll()}
        />
      )}

      {!mattersLoaded ? (
        <div className={frameOuter}>
          <div className={`${frameInner} min-h-[320px] flex items-center justify-center text-[14px] text-muted`}>Loading matters…</div>
        </div>
      ) : matters.length === 0 ? (
        <div className={frameOuter}>
        <div className={`${frameInner} min-h-[320px] flex flex-col items-center justify-center text-center`}>
          <Briefcase size={26} strokeWidth={1.5} className="text-muted mb-4" />
          <div className="text-[16px] font-semibold mb-1">No matters yet</div>
          <div className="text-[14px] text-muted mb-5">Add one from the sidebar or here.</div>
          <button
            onClick={() => setModalOpen(true)}
            className={pageBtnB}
          >
            <Plus size={14} /> Add matter
          </button>
        </div>
        </div>
      ) : groups.length === 0 ? (
        <div className={frameOuter}>
          <div className={`${frameInner} min-h-[200px] flex flex-col items-center justify-center text-center text-[14px] text-muted`}>
            No matters match &ldquo;{query}&rdquo;.
            <button onClick={() => setQuery("")} className="mt-3 underline underline-offset-2 hover:text-ink">
              Clear search
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5 pb-20">
          {groups.map((group) => {
            const GroupIcon = matterStatusMeta[group.status].icon;
            const isCollapsed = collapsed.has(group.status);
            return (
              <div key={group.status} className={`${frameOuter} hover:shadow-[0_8px_22px_-6px_rgba(27,25,26,0.14)] transition-shadow duration-200`}>
                <button
                  onClick={() => toggleCollapsed(group.status)}
                  className="w-full flex items-center justify-between gap-2 px-3 pt-2.5 pb-2.5 text-left"
                  aria-expanded={!isCollapsed}
                >
                  <span className={frameTitle}>
                    <GroupIcon size={15} strokeWidth={1.9} className={matterStatusMeta[group.status].color} />
                    {group.status} · {group.items.length}
                  </span>
                  <span className="text-[12px] text-muted flex items-center gap-1 hover:text-ink">
                    {isCollapsed ? "Show" : "Hide"}
                    {isCollapsed ? <ChevronRight size={14} strokeWidth={1.75} /> : <ChevronDown size={14} strokeWidth={1.75} />}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className={`${frameInner} p-2 flex flex-col gap-1.5 overflow-visible`}>
                    {group.items.map((m) => {
                      const client = clientFor(m.clientId);
                      return (
                        <div
                          key={m.id}
                          onClick={() => router.push(`/dashboard/matters/${m.id}`)}
                          className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl bg-[#F7F6F2] border border-[#EEEBE4] hover:bg-[#F1EFE9] transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelected(m.id);
                              }}
                              className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
                                selected.has(m.id)
                                  ? "bg-dark border-dark"
                                  : "bg-white border-[#E7E2D7] hover:border-muted"
                              }`}
                            >
                              {selected.has(m.id) && <Check size={12} strokeWidth={2.5} className="text-white" />}
                            </button>

                            <div onClick={(e) => e.stopPropagation()}>
                              <RowStatusPicker
                                status={m.status}
                                onChange={(s) => updateMatterStatus(m, s)}
                              />
                            </div>

                            {client && (
                              <>
                                <div
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
                                  style={{ backgroundColor: getAvatarColor(client.name), color: "#fff" }}
                                >
                                  {getInitials(client.name)}
                                </div>
                                <span className="text-[13.5px] text-muted truncate">{client.name}</span>
                                <ChevronRight size={13} strokeWidth={1.75} className="text-muted flex-shrink-0" />
                              </>
                            )}
                            {m.matterNumber && (
                              <span className="text-[12px] font-semibold tracking-wide bg-white border border-[#EBE8DF] rounded-md px-1.5 py-0.5 flex-shrink-0">{m.matterNumber}</span>
                            )}
                            <span className="text-[14.5px] font-semibold truncate">{m.title}</span>
                          </div>

                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="relative" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => setRowMenuFor(rowMenuFor === m.id ? null : m.id)}
                                className="w-7 h-7 rounded-full hover:bg-white flex items-center justify-center text-muted hover:text-ink transition-colors"
                              >
                                <MoreHorizontal size={16} strokeWidth={1.75} />
                              </button>
                              {rowMenuFor === m.id && (
                                <>
                                  <ClickAway onClose={() => setRowMenuFor(null)} />
                                  <div className={`absolute right-0 top-[calc(100%+12px)] z-50 ${menuPanel} w-[180px]`}>
                                    <button
                                      onClick={() => {
                                        setEditingMatter(m);
                                        setRowMenuFor(null);
                                      }}
                                      className={menuItem}
                                    >
                                      <Pencil size={14} strokeWidth={1.75} /> Edit
                                    </button>
                                    <button
                                      onClick={() => {
                                        updateMatterStatus(m, m.status === "Closed" ? "Active" : "Closed");
                                        setRowMenuFor(null);
                                      }}
                                      className={menuItem}
                                    >
                                      {m.status === "Closed" ? (
                                        <>
                                          <RotateCcw size={14} strokeWidth={1.75} /> Reopen
                                        </>
                                      ) : (
                                        <>
                                          <CheckCircle2 size={14} strokeWidth={1.75} /> Mark closed
                                        </>
                                      )}
                                    </button>
                                    <div className="border-t border-[#EEEBE4] my-1" />
                                    <button
                                      onClick={() => {
                                        handleDelete([m.id]);
                                        setRowMenuFor(null);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] font-medium text-red-500 hover:bg-red-50 transition-colors text-left"
                                    >
                                      <Trash2 size={14} strokeWidth={1.75} /> Delete
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-white border border-line rounded-full shadow-[0_20px_50px_-15px_rgba(18,17,16,0.35)] px-2 py-2">
          <span className="px-3 text-[13.5px] font-medium">{selected.size} selected</span>
          <GenericDropdown
            open={bulkStatusOpen}
            setOpen={setBulkStatusOpen}
            direction="up"
            trigger={<>Status</>}
          >
            {matterStatusOrder.map((s) => {
              const Icon = matterStatusMeta[s].icon;
              return (
                <button
                  key={s}
                  onClick={() => bulkSetStatus(s)}
                  className={menuItem}
                >
                  <Icon size={15} strokeWidth={2} className={matterStatusMeta[s].color} />
                  {s}
                </button>
              );
            })}
          </GenericDropdown>
          <button
            onClick={() => handleDelete(Array.from(selected))}
            className="w-9 h-9 rounded-full hover:bg-red-50 flex items-center justify-center text-red-500 transition-colors"
          >
            <Trash2 size={16} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="w-9 h-9 rounded-full hover:bg-chip flex items-center justify-center text-muted hover:text-ink transition-colors"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
      )}

      {modalOpen && (
        <NewMatterModal
          clients={clients}
          onClose={() => setModalOpen(false)}
          onSubmit={(matter) => {
            addMatter(matter);
            setModalOpen(false);
          }}
        />
      )}

      {editingMatter && (
        <NewMatterModal
          matter={editingMatter}
          clients={clients}
          onClose={() => setEditingMatter(null)}
          onSubmit={(updated) => {
            updateMatter(updated);
            setEditingMatter(null);
          }}
        />
      )}
    </div>
  );
}

// ── Sort by ──────────────────────────────────────────────────────────────────
type SortKey = "default" | "numberDesc" | "numberAsc" | "nameAsc" | "nameDesc" | "clientAsc" | "updated" | "newest" | "oldest" | "due";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "default", label: "Default" },
  { key: "numberDesc", label: "Matter number (newest first)" },
  { key: "numberAsc", label: "Matter number (oldest first)" },
  { key: "nameAsc", label: "Name A–Z" },
  { key: "nameDesc", label: "Name Z–A" },
  { key: "clientAsc", label: "Client A–Z" },
  { key: "updated", label: "Recently updated" },
  { key: "newest", label: "Newest added" },
  { key: "oldest", label: "Oldest added" },
  { key: "due", label: "Due date (soonest first)" },
];
// "Mr. Henryk Kwasnik – Residential (NJ)" sorts under H, not M.
const plainName = (s: string) => s.replace(/^\s*((mr|mrs|ms|miss|dr)\.?\s+)+/i, "").trim().toLowerCase();
// "REP-2026-3718" → year 2026, number 3718 (matters without a number go last).
const numberKey = (m: Matter) => {
  const n = numberOf(m)?.match(/-(\d{4})-(\d+)/);
  return n ? Number(n[1]) * 1e7 + Number(n[2]) : null;
};
function sortMatters(list: Matter[], by: SortKey, clientName: (m: Matter) => string): Matter[] {
  if (by === "default") return list;
  const a = [...list];
  const text = (x: string, y: string) => x.localeCompare(y, "en", { sensitivity: "base", numeric: true });
  const last = <T,>(x: T | null, y: T | null, cmp: (p: T, q: T) => number) => (x === null ? (y === null ? 0 : 1) : y === null ? -1 : cmp(x, y));
  a.sort((x, y) => {
    switch (by) {
      case "numberDesc":
        return last(numberKey(x), numberKey(y), (p, q) => q - p);
      case "numberAsc":
        return last(numberKey(x), numberKey(y), (p, q) => p - q);
      case "nameAsc":
        return text(plainName(x.title), plainName(y.title));
      case "nameDesc":
        return text(plainName(y.title), plainName(x.title));
      case "clientAsc":
        return last(clientName(x) ? plainName(clientName(x)) : null, clientName(y) ? plainName(clientName(y)) : null, text) || text(plainName(x.title), plainName(y.title));
      case "updated":
        return (y.updatedAt ?? "").localeCompare(x.updatedAt ?? "");
      case "newest":
        return (y.createdAt ?? "").localeCompare(x.createdAt ?? "");
      case "oldest":
        return (x.createdAt ?? "").localeCompare(y.createdAt ?? "");
      case "due":
        return last(x.dueDate || null, y.dueDate || null, (p, q) => p.localeCompare(q));
    }
    return 0;
  });
  return a;
}
