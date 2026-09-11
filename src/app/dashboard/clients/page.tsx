"use client";

import { useState } from "react";
import {
  CircleUser,
  ChevronDown,
  ChevronRight,
  Check,
  Folder,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  MoreHorizontal,
  X,
} from "lucide-react";
import NewClientModal, {
  Client,
  ClientStatus,
  statusMeta,
  typeMeta,
  getInitials,
  getAvatarColor,
  formatUpdatedAt,
} from "@/components/NewClientModal";
import { GenericDropdown } from "@/components/NewTaskModal";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";

const statusOrder: ClientStatus[] = ["Active", "Archived"];

function RowStatusPicker({
  status,
  onChange,
}: {
  status: ClientStatus;
  onChange: (s: ClientStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = statusMeta[status].icon;

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-card-alt transition-colors flex-shrink-0"
      >
        <Icon size={16} strokeWidth={2} className={statusMeta[status].color} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+6px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[160px]">
            {statusOrder.map((s) => {
              const OptIcon = statusMeta[s].icon;
              return (
                <button
                  key={s}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(s);
                    setOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <OptIcon size={15} strokeWidth={2} className={statusMeta[s].color} />
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

export default function ClientsPage() {
  const {
    clients,
    clientsLoaded,
    addClient,
    updateClient,
    deleteClients,
    bulkSetClientStatus,
    matters,
  } = useWorkspaceData();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [collapsed, setCollapsed] = useState<Set<ClientStatus>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowMenuFor, setRowMenuFor] = useState<string | null>(null);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);

  function toggleCollapsed(status: ClientStatus) {
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

  function updateClientStatus(client: Client, status: ClientStatus) {
    updateClient({ ...client, status, updatedAt: new Date().toISOString() });
  }

  function handleDelete(ids: string[]) {
    deleteClients(ids);
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  function bulkSetStatus(status: ClientStatus) {
    bulkSetClientStatus(Array.from(selected), status);
    setBulkStatusOpen(false);
  }

  function matterCountFor(clientId: string) {
    return matters.filter((m) => m.clientId === clientId).length;
  }

  const groups = statusOrder
    .map((status) => ({ status, items: clients.filter((c) => c.status === status) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="px-10 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-[28px] font-semibold">
          Clients <span className="text-muted font-normal text-[18px]">/ {clients.length}</span>
        </h1>
        <button
          onClick={() => setModalOpen(true)}
          className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors"
        >
          + Add client
        </button>
      </div>

      {!clientsLoaded ? (
        <div className="border border-line rounded-2xl min-h-[320px] flex items-center justify-center text-[14px] text-muted">
          Loading clients…
        </div>
      ) : clients.length === 0 ? (
        <div className="border border-line rounded-2xl min-h-[320px] flex flex-col items-center justify-center text-center">
          <CircleUser size={26} strokeWidth={1.5} className="text-muted mb-4" />
          <div className="text-[16px] font-semibold mb-1">No clients yet</div>
          <div className="text-[14px] text-muted mb-5">Add your first client to start tracking matters for them.</div>
          <button
            onClick={() => setModalOpen(true)}
            className="bg-dark text-white px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors"
          >
            + Add client
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-20">
          {groups.map((group) => {
            const GroupIcon = statusMeta[group.status].icon;
            const isCollapsed = collapsed.has(group.status);
            return (
              <div key={group.status}>
                <button
                  onClick={() => toggleCollapsed(group.status)}
                  className="w-full flex items-center gap-2.5 bg-card-alt hover:bg-line/50 transition-colors px-4 py-3 rounded-xl text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight size={15} strokeWidth={1.75} className="text-muted" />
                  ) : (
                    <ChevronDown size={15} strokeWidth={1.75} className="text-muted" />
                  )}
                  <GroupIcon size={15} strokeWidth={2} className={statusMeta[group.status].color} />
                  <span className="text-[14.5px] font-semibold">{group.status}</span>
                  <span className="text-[12px] text-muted bg-white rounded-full px-2 py-0.5">
                    {group.items.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="border border-t-0 border-line rounded-b-xl overflow-visible divide-y divide-line">
                    {group.items.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => setEditingClient(c)}
                        className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-card-alt/40 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelected(c.id);
                            }}
                            className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
                              selected.has(c.id)
                                ? "bg-dark border-dark"
                                : "border-line hover:border-muted"
                            }`}
                          >
                            {selected.has(c.id) && <Check size={12} strokeWidth={2.5} className="text-white" />}
                          </button>

                          <div onClick={(e) => e.stopPropagation()}>
                            <RowStatusPicker
                              status={c.status}
                              onChange={(s) => updateClientStatus(c, s)}
                            />
                          </div>

                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0"
                            style={{ backgroundColor: getAvatarColor(c.name), color: "#fff" }}
                          >
                            {getInitials(c.name)}
                          </div>
                          <span className="text-[14.5px] font-medium truncate">{c.name}</span>
                        </div>

                        <div className="flex items-center gap-4 flex-shrink-0">
                          <span className="hidden sm:flex items-center gap-1.5 text-muted text-[13px]">
                            {(() => {
                              const TypeIcon = typeMeta[c.type].icon;
                              return <TypeIcon size={13} strokeWidth={1.75} />;
                            })()}
                            {c.type}
                          </span>
                          <span className="hidden md:flex items-center gap-1.5 text-muted text-[13px]">
                            <Folder size={13} strokeWidth={1.75} />
                            {matterCountFor(c.id)}
                          </span>
                          <span className="hidden lg:inline text-muted text-[13px]">
                            Updated: {formatUpdatedAt(c.updatedAt)}
                          </span>

                          <div className="relative" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setRowMenuFor(rowMenuFor === c.id ? null : c.id)}
                              className="w-7 h-7 rounded-full hover:bg-card-alt flex items-center justify-center text-muted hover:text-ink transition-colors"
                            >
                              <MoreHorizontal size={16} strokeWidth={1.75} />
                            </button>
                            {rowMenuFor === c.id && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => setRowMenuFor(null)} />
                                <div className="absolute right-0 top-[calc(100%+4px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[180px]">
                                  <button
                                    onClick={() => {
                                      setEditingClient(c);
                                      setRowMenuFor(null);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
                                  >
                                    <Pencil size={14} strokeWidth={1.75} /> Edit
                                  </button>
                                  <button
                                    onClick={() => {
                                      updateClientStatus(c, c.status === "Active" ? "Archived" : "Active");
                                      setRowMenuFor(null);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
                                  >
                                    {c.status === "Active" ? (
                                      <>
                                        <Archive size={14} strokeWidth={1.75} /> Archive
                                      </>
                                    ) : (
                                      <>
                                        <ArchiveRestore size={14} strokeWidth={1.75} /> Restore
                                      </>
                                    )}
                                  </button>
                                  <div className="border-t border-line my-1" />
                                  <button
                                    onClick={() => {
                                      handleDelete([c.id]);
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
                    ))}
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
            {statusOrder.map((s) => {
              const Icon = statusMeta[s].icon;
              return (
                <button
                  key={s}
                  onClick={() => bulkSetStatus(s)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
                >
                  <Icon size={15} strokeWidth={2} className={statusMeta[s].color} />
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
            className="w-9 h-9 rounded-full hover:bg-card-alt flex items-center justify-center text-muted hover:text-ink transition-colors"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
      )}

      {modalOpen && (
        <NewClientModal
          onClose={() => setModalOpen(false)}
          onSubmit={(client) => {
            addClient(client);
            setModalOpen(false);
          }}
        />
      )}

      {editingClient && (
        <NewClientModal
          client={editingClient}
          onClose={() => setEditingClient(null)}
          onSubmit={(updated) => {
            updateClient(updated);
            setEditingClient(null);
          }}
        />
      )}
    </div>
  );
}
