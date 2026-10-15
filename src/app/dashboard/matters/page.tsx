"use client";

import ImportLeapModal from "@/components/matters/ImportLeapModal";

import { useState } from "react";
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
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+6px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[170px]">
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
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
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

  const [modalOpen, setModalOpen] = useState(false);
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

  const groups = matterStatusOrder
    .map((status) => ({ status, items: shownMatters.filter((m) => m.status === status) }))
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
            className="flex items-center gap-1.5 bg-chip text-ink px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-btn transition-colors"
          >
            <Upload size={14} strokeWidth={1.75} /> Import CSV file
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-btn-hover transition-colors"
          >
            + Add matter
          </button>
        </div>
      </div>
      {mattersLoaded && matters.length > 0 && (
        <div className="relative max-w-[520px] -mt-3 mb-6">
          <Search size={15} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Search matters: number, client, title, other side…"
            aria-label="Search matters"
            className="w-full bg-white border border-line rounded-full pl-10 pr-24 py-2.5 text-[14px] outline-none focus:border-ink"
          />
          {query && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 text-[12.5px] text-muted">
              {shownMatters.length} found
              <button onClick={() => setQuery("")} aria-label="Clear search" className="hover:text-ink">
                <X size={14} />
              </button>
            </span>
          )}
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
        <div className="border border-line rounded-2xl min-h-[320px] flex items-center justify-center text-[14px] text-muted">
          Loading matters…
        </div>
      ) : matters.length === 0 ? (
        <div className="border border-line rounded-2xl min-h-[320px] flex flex-col items-center justify-center text-center">
          <Briefcase size={26} strokeWidth={1.5} className="text-muted mb-4" />
          <div className="text-[16px] font-semibold mb-1">No matters yet</div>
          <div className="text-[14px] text-muted mb-5">Add one from the sidebar or here.</div>
          <button
            onClick={() => setModalOpen(true)}
            className="bg-btn text-ink px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-btn-hover transition-colors"
          >
            + Add matter
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div className="border border-line rounded-2xl min-h-[200px] flex flex-col items-center justify-center text-center text-[14px] text-muted">
          No matters match &ldquo;{query}&rdquo;.
          <button onClick={() => setQuery("")} className="mt-3 underline underline-offset-2 hover:text-ink">
            Clear search
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-20">
          {groups.map((group) => {
            const GroupIcon = matterStatusMeta[group.status].icon;
            const isCollapsed = collapsed.has(group.status);
            return (
              <div key={group.status}>
                <button
                  onClick={() => toggleCollapsed(group.status)}
                  className="w-full flex items-center gap-2.5 bg-chip hover:bg-btn transition-colors px-4 py-3 rounded-xl text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight size={15} strokeWidth={1.75} className="text-muted" />
                  ) : (
                    <ChevronDown size={15} strokeWidth={1.75} className="text-muted" />
                  )}
                  <GroupIcon size={15} strokeWidth={2} className={matterStatusMeta[group.status].color} />
                  <span className="text-[14.5px] font-semibold">{group.status}</span>
                  <span className="text-[12px] text-muted bg-white rounded-full px-2 py-0.5">
                    {group.items.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="border border-t-0 border-line rounded-b-xl overflow-visible divide-y divide-line">
                    {group.items.map((m) => {
                      const client = clientFor(m.clientId);
                      return (
                        <div
                          key={m.id}
                          onClick={() => router.push(`/dashboard/matters/${m.id}`)}
                          className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-chip/40 transition-colors cursor-pointer"
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
                                  : "border-line hover:border-muted"
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
                              <span className="text-[12px] font-semibold tracking-wide bg-chip rounded-md px-1.5 py-0.5 flex-shrink-0">{m.matterNumber}</span>
                            )}
                            <span className="text-[14.5px] font-semibold truncate">{m.title}</span>
                          </div>

                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="relative" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => setRowMenuFor(rowMenuFor === m.id ? null : m.id)}
                                className="w-7 h-7 rounded-full hover:bg-chip flex items-center justify-center text-muted hover:text-ink transition-colors"
                              >
                                <MoreHorizontal size={16} strokeWidth={1.75} />
                              </button>
                              {rowMenuFor === m.id && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setRowMenuFor(null)} />
                                  <div className="absolute right-0 top-[calc(100%+4px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[180px]">
                                    <button
                                      onClick={() => {
                                        setEditingMatter(m);
                                        setRowMenuFor(null);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
                                    >
                                      <Pencil size={14} strokeWidth={1.75} /> Edit
                                    </button>
                                    <button
                                      onClick={() => {
                                        updateMatterStatus(m, m.status === "Closed" ? "Active" : "Closed");
                                        setRowMenuFor(null);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
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
                                    <div className="border-t border-line my-1" />
                                    <button
                                      onClick={() => {
                                        handleDelete([m.id]);
                                        setRowMenuFor(null);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium text-red-500 hover:bg-red-50 transition-colors"
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
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
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
