"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Pencil,
  MoreHorizontal,
  Trash2,
  Check,
  User,
  ChevronRight,
  LayoutGrid,
  ListChecks,
  CalendarRange,
  Calendar,
  FileText,
  Mail,
  Users,
  Activity,
  BookOpen,
  StickyNote,
  Link2,
  ClipboardList,
  Bookmark,
  CalendarDays,
} from "lucide-react";
import NewMatterModal, {
  Matter,
  BillingType,
  matterStatusOrder,
  matterStatusMeta,
  matterCategories,
} from "@/components/NewMatterModal";
import { getInitials, getAvatarColor } from "@/components/NewClientModal";
import { GenericDropdown } from "@/components/NewTaskModal";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";

const tabs = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "tasks", label: "Tasks", icon: ListChecks },
  { key: "timeline", label: "Timeline", icon: CalendarRange },
  { key: "calendar", label: "Calendar", icon: Calendar },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "emails", label: "Emails", icon: Mail },
  { key: "parties", label: "Parties", icon: Users },
  { key: "activities", label: "Activities", icon: Activity },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export default function MatterDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { matters, mattersLoaded, clients, updateMatter, deleteMatters } = useWorkspaceData();

  const matter = matters.find((m) => m.id === params.id) ?? null;

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [assignedOpen, setAssignedOpen] = useState(false);

  if (!matter) {
    if (!mattersLoaded) {
      return (
        <div className="px-10 py-10">
          <div className="text-[14px] text-muted">Loading matter…</div>
        </div>
      );
    }
    return (
      <div className="px-10 py-10">
        <div className="text-[16px] font-semibold mb-2">Matter not found</div>
        <Link href="/dashboard/matters" className="text-[14px] text-muted underline">
          Back to Matters
        </Link>
      </div>
    );
  }

  const client = matter.clientId ? clients.find((c) => c.id === matter.clientId) ?? null : null;
  const StatusIcon = matterStatusMeta[matter.status].icon;

  function patch(fields: Partial<Matter>) {
    if (!matter) return;
    updateMatter({ ...matter, ...fields, updatedAt: new Date().toISOString() });
  }

  return (
    <div className="px-10 py-10">
      <div className="flex items-center gap-2 text-[13.5px] text-muted font-medium mb-5">
        <Link href="/dashboard/matters" className="bg-card-alt px-2.5 py-1 rounded-full hover:bg-line/50 transition-colors">
          Matters
        </Link>
        <ChevronRight size={13} strokeWidth={1.75} />
        <span className="bg-card-alt px-2.5 py-1 rounded-full text-ink font-semibold">{matter.title}</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <h1 className="text-[30px] font-semibold">{matter.title}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditModalOpen(true)}
            className="w-9 h-9 rounded-full bg-card-alt hover:bg-line/60 transition-colors flex items-center justify-center"
          >
            <Pencil size={15} strokeWidth={1.75} />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="w-9 h-9 rounded-full bg-card-alt hover:bg-line/60 transition-colors flex items-center justify-center"
            >
              <MoreHorizontal size={15} strokeWidth={1.75} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-[calc(100%+6px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[170px]">
                  <button
                    onClick={() => {
                      deleteMatters([matter.id]);
                      router.push("/dashboard/matters");
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={14} strokeWidth={1.75} /> Delete matter
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-3 mb-8 max-w-[900px]">
        <div className="flex items-center gap-3">
          <span className="w-[110px] text-[13.5px] text-muted flex-shrink-0">Status</span>
          <GenericDropdown
            open={statusOpen}
            setOpen={setStatusOpen}
            trigger={
              <>
                <StatusIcon size={13} strokeWidth={2} className={matterStatusMeta[matter.status].color} />
                {matter.status}
              </>
            }
          >
            {matterStatusOrder.map((s) => {
              const Icon = matterStatusMeta[s].icon;
              return (
                <button
                  key={s}
                  onClick={() => {
                    patch({ status: s });
                    setStatusOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Icon size={15} strokeWidth={2} className={matterStatusMeta[s].color} />
                    {s}
                  </span>
                  {s === matter.status && <Check size={14} strokeWidth={2} />}
                </button>
              );
            })}
          </GenericDropdown>
        </div>

        <div className="flex items-center gap-3">
          <span className="w-[110px] text-[13.5px] text-muted flex-shrink-0">Client</span>
          <GenericDropdown
            open={clientOpen}
            setOpen={setClientOpen}
            trigger={
              client ? (
                <>
                  <span
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-semibold flex-shrink-0"
                    style={{ backgroundColor: getAvatarColor(client.name), color: "#fff" }}
                  >
                    {getInitials(client.name)}
                  </span>
                  {client.name}
                </>
              ) : (
                <>
                  <User size={13} strokeWidth={1.75} />
                  Unassigned
                </>
              )
            }
          >
            {clients.length === 0 ? (
              <div className="px-3 py-2.5 text-[13.5px] text-muted">No clients yet</div>
            ) : (
              clients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    patch({ clientId: c.id });
                    setClientOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold"
                      style={{ backgroundColor: getAvatarColor(c.name), color: "#fff" }}
                    >
                      {getInitials(c.name)}
                    </span>
                    {c.name}
                  </span>
                  {c.id === matter.clientId && <Check size={14} strokeWidth={2} />}
                </button>
              ))
            )}
          </GenericDropdown>
        </div>

        <div className="flex items-center gap-3">
          <span className="w-[110px] text-[13.5px] text-muted flex-shrink-0">Category</span>
          <GenericDropdown
            open={categoryOpen}
            setOpen={setCategoryOpen}
            trigger={<>{matter.category ?? "—"}</>}
          >
            {matterCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  patch({ category: cat === "None" ? null : cat });
                  setCategoryOpen(false);
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
              >
                {cat}
                {(cat === "None" ? matter.category === null : cat === matter.category) && (
                  <Check size={14} strokeWidth={2} />
                )}
              </button>
            ))}
          </GenericDropdown>
        </div>

        <div className="flex items-center gap-3">
          <span className="w-[110px] text-[13.5px] text-muted flex-shrink-0">Assigned to</span>
          <GenericDropdown
            open={assignedOpen}
            setOpen={setAssignedOpen}
            trigger={<>{matter.assignedTo ?? "Unassigned"}</>}
          >
            <button
              onClick={() => {
                patch({ assignedTo: null });
                setAssignedOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors text-muted"
            >
              Unassigned
            </button>
            <button
              onClick={() => {
                patch({ assignedTo: "marios@dessign.co" });
                setAssignedOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-dark text-white flex items-center justify-center text-[11px]">
                M
              </span>
              marios@dessign.co
            </button>
          </GenericDropdown>
        </div>

        <div className="flex items-center gap-3">
          <span className="w-[110px] text-[13.5px] text-muted flex-shrink-0">Due date</span>
          <GenericDropdown
            open={dateOpen}
            setOpen={setDateOpen}
            trigger={<>{matter.dueDate ?? "—"}</>}
          >
            <div className="p-2">
              <input
                type="date"
                value={matter.dueDate ?? ""}
                onChange={(e) => patch({ dueDate: e.target.value || null })}
                className="w-full bg-card-alt rounded-lg px-3 py-2 text-[13.5px] outline-none"
              />
            </div>
          </GenericDropdown>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-line mb-7 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-3.5 py-3 text-[13.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                active ? "border-dark text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              <Icon size={14} strokeWidth={1.75} />
              {t.label}
              {t.key === "activities" && (
                <span className="bg-card-alt text-muted text-[11px] font-medium px-1.5 py-0.5 rounded-full">
                  1 Unread
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab !== "overview" ? (
        <div className="border border-line rounded-2xl min-h-[240px] flex items-center justify-center text-[14px] text-muted">
          {tabs.find((t) => t.key === activeTab)?.label} coming soon.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 flex flex-col gap-5">
            <div className="rounded-2xl overflow-hidden border border-line">
              <div className="flex items-center gap-2 bg-card-alt px-4 py-3">
                <BookOpen size={14} strokeWidth={1.75} className="text-muted" />
                <span className="text-[14px] font-semibold">State of Play</span>
              </div>
              <div className="p-4">
                <div className="bg-card-alt rounded-xl px-4 py-3.5 text-[13.5px] text-muted">
                  State of Play hasn&apos;t been generated yet.
                </div>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden border border-line">
              <div className="flex items-center gap-2 bg-card-alt px-4 py-3">
                <StickyNote size={14} strokeWidth={1.75} className="text-muted" />
                <span className="text-[14px] font-semibold">Private notes</span>
              </div>
              <div className="p-4">
                <textarea
                  value={matter.privateNotes}
                  onChange={(e) => patch({ privateNotes: e.target.value })}
                  placeholder="Add private notes for your firm..."
                  rows={3}
                  className="w-full bg-card-alt rounded-xl px-4 py-3.5 text-[13.5px] outline-none placeholder:text-muted resize-none"
                />
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden border border-line">
              <div className="flex items-center justify-between bg-card-alt px-4 py-3">
                <div className="flex items-center gap-2">
                  <Link2 size={14} strokeWidth={1.75} className="text-muted" />
                  <span className="text-[14px] font-semibold">Billing</span>
                </div>
                <span className="text-[13px] font-medium text-muted">Add entry +</span>
              </div>
              <div className="p-4 flex flex-col gap-4">
                <div>
                  <div className="text-[13px] text-muted mb-2">Billing type</div>
                  <div className="inline-flex items-center bg-card-alt rounded-full p-1">
                    {(["Hourly", "Flat fee"] as BillingType[]).map((b) => (
                      <button
                        key={b}
                        onClick={() => patch({ billingType: b })}
                        className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                          matter.billingType === b ? "bg-white shadow-sm" : "text-muted"
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[13px] text-muted mb-2">Custom hourly rate</div>
                  <div className="flex items-center gap-2 bg-card-alt rounded-xl px-3.5 py-2.5 w-full max-w-[220px]">
                    <span className="text-muted">$</span>
                    <input
                      type="number"
                      value={matter.hourlyRate ?? ""}
                      onChange={(e) =>
                        patch({ hourlyRate: e.target.value ? Number(e.target.value) : null })
                      }
                      placeholder="0"
                      className="w-full bg-transparent outline-none text-[13.5px]"
                    />
                    <span className="text-muted text-[13px] flex-shrink-0">/h</span>
                  </div>
                  <div className="text-[12.5px] text-muted mt-1.5">
                    Leave empty or 0 to use the firm default.
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                  <div>
                    <div className="text-[13px] text-muted mb-1">Total billed</div>
                    <div className="text-[16px] font-semibold text-green-600">$0.00</div>
                  </div>
                  <div>
                    <div className="text-[13px] text-muted mb-1">Hourly value</div>
                    <div className="text-[16px] font-semibold">$0.00</div>
                  </div>
                  <div>
                    <div className="text-[13px] text-muted mb-1">Flat fees</div>
                    <div className="text-[16px] font-semibold">
                      ${matter.billingType === "Flat fee" && matter.value ? matter.value.toFixed(2) : "0.00"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[13px] text-muted mb-1">Billable hours</div>
                    <div className="text-[16px] font-semibold">0h</div>
                  </div>
                </div>

                <div className="text-[13px] text-muted pt-1">0 time entries</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="rounded-2xl overflow-hidden border border-line">
              <div className="flex items-center gap-2 bg-card-alt px-4 py-3">
                <ClipboardList size={14} strokeWidth={1.75} className="text-muted" />
                <span className="text-[14px] font-semibold">Upcoming tasks</span>
              </div>
              <div className="p-6 flex flex-col items-center justify-center text-center gap-2">
                <ListChecks size={20} strokeWidth={1.5} className="text-muted" />
                <div className="text-[13px] text-muted">No tasks due in the next 3 days.</div>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden border border-line">
              <div className="flex items-center gap-2 bg-card-alt px-4 py-3">
                <Bookmark size={14} strokeWidth={1.75} className="text-muted" />
                <span className="text-[14px] font-semibold">Records</span>
              </div>
              <div className="p-6 flex flex-col items-center justify-center text-center gap-2">
                <Bookmark size={20} strokeWidth={1.5} className="text-muted" />
                <div className="text-[13px] text-muted">No records yet.</div>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden border border-line">
              <div className="flex items-center gap-2 bg-card-alt px-4 py-3">
                <CalendarDays size={14} strokeWidth={1.75} className="text-muted" />
                <span className="text-[14px] font-semibold">Upcoming events</span>
              </div>
              <div className="p-6 flex flex-col items-center justify-center text-center gap-2">
                <CalendarDays size={20} strokeWidth={1.5} className="text-muted" />
                <div className="text-[13px] text-muted">No upcoming events.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {editModalOpen && (
        <NewMatterModal
          matter={matter}
          clients={clients}
          onClose={() => setEditModalOpen(false)}
          onSubmit={(updated) => {
            updateMatter(updated);
            setEditModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
