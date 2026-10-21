"use client";

import MatterContactsCard from "@/components/matters/MatterContactsCard";
import ClickAway from "@/components/ClickAway";
import PortalButton from "@/components/clientCard/PortalButton";
import InvoicesPanel from "@/components/invoices/InvoicesPanel";
import { money as invMoney } from "@/components/invoices/shared";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter , useSearchParams } from "next/navigation";
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
import DocumentsLibrary from "@/components/documents/DocumentsLibrary";
import AssigneeOptions from "@/components/AssigneeOptions";
import MatterTasks from "@/components/matters/MatterTasks";
import MatterEmails from "@/components/matters/MatterEmails";
import MatterDetailsPanel from "@/components/matters/MatterDetailsPanel";
import KeyDatesCard, { useKeyDates } from "@/components/matters/KeyDatesCard";
import { anchorDates, isCashDeal } from "@/lib/matters/keyDates";
import { statusMeta as taskStatusMeta } from "@/components/NewTaskModal";

const tabs = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "tasks", label: "Tasks", icon: ListChecks },
  { key: "timeline", label: "Timeline", icon: CalendarRange },
  { key: "calendar", label: "Calendar", icon: Calendar },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "emails", label: "Emails", icon: Mail },
  { key: "parties", label: "Details", icon: Users },
  { key: "activities", label: "Activities", icon: Activity },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export default function MatterDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { matters, mattersLoaded, clients, tasks, updateMatter, deleteMatters } = useWorkspaceData();
  const [invoiceKey, setInvoiceKey] = useState(0);

  const matter = matters.find((m) => m.id === params.id) ?? null;

  // ?tab=emails etc. opens that tab (e.g. from a client portal message alert).
  const tabParam = useSearchParams().get("tab");
  const [activeTab, setActiveTab] = useState<TabKey>(() => (tabs.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "overview"));
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [assignedOpen, setAssignedOpen] = useState(false);
  // Key dates stay up to date on every tab (documents uploaded on the Documents tab are read).
  const keyDates = useKeyDates(matter);
  // "Go to Documents" from Key dates: open the Documents tab with the Add documents window.
  const [uploadNow, setUploadNow] = useState(false);
  // Unread client replies in the secure portal (cleared when the Emails tab is opened).
  const [unreadReplies, setUnreadReplies] = useState(0);
  // A flat-fee matter whose fee was typed into the old "Custom hourly rate" box
  // (before Oct 21, 2026): move it to the flat fee, once.
  useEffect(() => {
    if (matter && matter.billingType === "Flat fee" && !matter.value && matter.hourlyRate && matter.hourlyRate > 0) {
      updateMatter({ ...matter, value: matter.hourlyRate, hourlyRate: null });
    }
  }, [matter, updateMatter]);

  const matterIdForCount = matter?.id;
  useEffect(() => {
    if (!matterIdForCount || activeTab === "emails") return;
    let live = true;
    fetch(`/api/matters/${matterIdForCount}/portal-messages?count=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && typeof d?.unread === "number" && setUnreadReplies(d.unread))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [matterIdForCount, activeTab]);

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
  // Open tasks on this matter, soonest due first (for the Overview card).
  const openTasks = tasks
    .filter((t) => t.matterId === matter.id && t.status !== "done")
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

  function patch(fields: Partial<Matter>) {
    if (!matter) return;
    updateMatter({ ...matter, ...fields, updatedAt: new Date().toISOString() });
  }

  return (
    <div className="px-10 py-10">
      <div className="flex items-center gap-2 text-[13.5px] text-muted font-medium mb-5">
        <Link href="/dashboard/matters" className="bg-chip px-2.5 py-1 rounded-full hover:bg-btn transition-colors">
          Matters
        </Link>
        <ChevronRight size={13} strokeWidth={1.75} />
        <span className="bg-card-alt px-2.5 py-1 rounded-full text-ink font-semibold">{matter.title}</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          {matter.matterNumber && (
            <div className="inline-flex items-center bg-chip rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold tracking-wide mb-1.5">{matter.matterNumber}</div>
          )}
          <h1 className="text-[30px] font-semibold">{matter.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditModalOpen(true)}
            className="w-9 h-9 rounded-full bg-chip hover:bg-btn transition-colors flex items-center justify-center"
          >
            <Pencil size={15} strokeWidth={1.75} />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="w-9 h-9 rounded-full bg-chip hover:bg-btn transition-colors flex items-center justify-center"
            >
              <MoreHorizontal size={15} strokeWidth={1.75} />
            </button>
            {menuOpen && (
              <>
                <ClickAway onClose={() => setMenuOpen(false)} />
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
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
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
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
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
          {client && <PortalButton clientId={client.id} defaultEmail={client.email ?? undefined} defaultName={client.name} />}
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
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
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
            <AssigneeOptions
              value={matter.assignedTo}
              onPick={(email) => {
                patch({ assignedTo: email });
                setAssignedOpen(false);
              }}
            />
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
              onClick={() => {
                setActiveTab(t.key);
                setUploadNow(false); // only "Go to Documents" opens the upload window
                if (t.key === "emails") setUnreadReplies(0);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-3 text-[13.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                active ? "border-dark text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              <Icon size={14} strokeWidth={1.75} />
              {t.label}
              {t.key === "emails" && unreadReplies > 0 && (
                <span className="bg-[#3B82F6] text-white text-[11px] font-semibold px-1.5 py-0.5 rounded-full" title="Unread replies from the client portal">
                  {unreadReplies}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "documents" ? (
        <DocumentsLibrary key={uploadNow ? "upload" : "list"} matterId={matter.id} openAdd={uploadNow} />
      ) : activeTab === "parties" ? (
        <MatterDetailsPanel matter={matter} keyDates={keyDates} wide />
      ) : activeTab === "emails" ? (
        <MatterEmails matter={matter} client={client} />
      ) : activeTab === "tasks" ? (
        <MatterTasks
          matter={matter}
          clientName={client?.name ?? null}
          keyDates={anchorDates(keyDates.data?.state.dates ?? {}, keyDates.data?.fields ?? [])}
          cash={isCashDeal(keyDates.data?.state)}
        />
      ) : activeTab !== "overview" ? (
        <div className="border border-line rounded-2xl min-h-[240px] flex items-center justify-center text-[14px] text-muted">
          {tabs.find((t) => t.key === activeTab)?.label} coming soon.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 flex flex-col gap-5">
            <KeyDatesCard
              api={keyDates}
              onOpenDocuments={(opts) => {
                setUploadNow(!!opts?.upload);
                setActiveTab("documents");
              }}
            />
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
                  <div className="inline-flex items-center bg-chip rounded-full p-1">
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

                {matter.billingType === "Flat fee" ? (
                  <div>
                    <div className="text-[13px] text-muted mb-2">Flat fee</div>
                    <div className="flex items-center gap-2 bg-card-alt rounded-xl px-3.5 py-2.5 w-full max-w-[220px]">
                      <span className="text-muted">$</span>
                      <input
                        type="number"
                        min={0}
                        value={matter.value ?? ""}
                        onChange={(e) => patch({ value: e.target.value ? Number(e.target.value) : null })}
                        placeholder="0"
                        aria-label="Flat fee"
                        className="w-full bg-transparent outline-none text-[13.5px]"
                      />
                    </div>
                    <div className="text-[12.5px] text-muted mt-1.5">The fee for this matter. New invoice fills it in.</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-[13px] text-muted mb-2">Custom hourly rate</div>
                    <div className="flex items-center gap-2 bg-card-alt rounded-xl px-3.5 py-2.5 w-full max-w-[220px]">
                      <span className="text-muted">$</span>
                      <input
                        type="number"
                        min={0}
                        value={matter.hourlyRate ?? ""}
                        onChange={(e) => patch({ hourlyRate: e.target.value ? Number(e.target.value) : null })}
                        placeholder="0"
                        aria-label="Custom hourly rate"
                        className="w-full bg-transparent outline-none text-[13.5px]"
                      />
                      <span className="text-muted text-[13px] flex-shrink-0">/h</span>
                    </div>
                    <div className="text-[12.5px] text-muted mt-1.5">Leave empty or 0 to use the firm default.</div>
                  </div>
                )}

                <BillingTotals matterId={matter.id} flat={matter.billingType === "Flat fee"} fee={matter.billingType === "Flat fee" ? matter.value ?? 0 : matter.hourlyRate ?? 0} reloadKey={invoiceKey} />

                {/* Invoices for this matter (they also show in AI Accountant → Operating → Invoices). */}
                <div className="border-t border-line pt-5">
                  <div className="text-[14px] font-semibold mb-3 flex items-center gap-2">
                    Invoices
                    <MatterTrustBalance matterId={matter.id} />
                  </div>
                  <InvoicesPanel matters={matters} clientName={(id) => clients.find((c) => c.id === id)?.name ?? ""} matterId={matter.id} compact onChanged={() => setInvoiceKey((k) => k + 1)} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <MatterDetailsPanel matter={matter} keyDates={keyDates} />
            <div className="rounded-2xl overflow-hidden border border-line">
              <div className="flex items-center gap-2 bg-card-alt px-4 py-3">
                <ClipboardList size={14} strokeWidth={1.75} className="text-muted" />
                <span className="text-[14px] font-semibold">Open tasks</span>
                <button onClick={() => setActiveTab("tasks")} className="ml-auto text-[12.5px] font-medium text-muted hover:text-ink">
                  {openTasks.length ? "View all" : "Add from template"}
                </button>
              </div>
              {openTasks.length === 0 ? (
                <div className="p-6 flex flex-col items-center justify-center text-center gap-2">
                  <ListChecks size={20} strokeWidth={1.5} className="text-muted" />
                  <div className="text-[13px] text-muted">No open tasks on this matter.</div>
                </div>
              ) : (
                <div className="p-2 flex flex-col">
                  {openTasks.slice(0, 5).map((t) => {
                    const S = taskStatusMeta[t.status];
                    return (
                      <button
                        key={t.id}
                        onClick={() => setActiveTab("tasks")}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-card-alt text-left"
                      >
                        <S.icon size={14} strokeWidth={2} className={S.color} />
                        <span className="text-[13px] font-medium truncate flex-1">{t.title}</span>
                        <span className="text-[12px] text-muted flex-shrink-0">{t.dueDate ?? ""}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <MatterContactsCard matterId={matter.id} clientId={matter.clientId} clients={clients} />

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

// "In trust: $X" next to Invoices, when this matter has money in trust.
function MatterTrustBalance({ matterId }: { matterId: string }) {
  const [bal, setBal] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/accounting/trust")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { balances?: { matterId: string | null; balance: number }[] } | null) => {
        if (!live || !d?.balances) return;
        setBal(d.balances.find((b) => b.matterId === matterId)?.balance ?? 0);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [matterId]);
  if (!bal) return null;
  return (
    <span className="ml-auto text-[12.5px] font-medium bg-card-alt rounded-md px-2 py-0.5" title="Client money held in trust for this matter (AI Accountant → Trust)">
      In trust: {invMoney(bal)}
    </span>
  );
}

// Billing totals from the matter's real invoices (all $0 until an invoice exists).
function BillingTotals({ matterId, flat, fee, reloadKey }: { matterId: string; flat: boolean; fee: number; reloadKey: number }) {
  const [t, setT] = useState<{ billed: number; paid: number } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/invoices?matterId=${matterId}`)
      .then((r) => (r.ok ? r.json() : { invoices: [] }))
      .then((d: { invoices?: { status: string; total: number; amountPaid: number }[] }) => {
        if (!live) return;
        const list = (d.invoices ?? []).filter((i) => i.status !== "void");
        setT({ billed: list.reduce((n, i) => n + Number(i.total || 0), 0), paid: list.reduce((n, i) => n + Number(i.amountPaid || 0), 0) });
      })
      .catch(() => live && setT({ billed: 0, paid: 0 }));
    return () => {
      live = false;
    };
  }, [matterId, reloadKey]);
  const m = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const owed = t ? Math.max(0, t.billed - t.paid) : 0;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
      <div>
        <div className="text-[13px] text-muted mb-1">{flat ? "Flat fee" : "Hourly rate"}</div>
        <div className="text-[16px] font-semibold">{fee ? `${m(fee)}${flat ? "" : "/h"}` : "—"}</div>
      </div>
      <div>
        <div className="text-[13px] text-muted mb-1">Total billed</div>
        <div className="text-[16px] font-semibold">{t ? m(t.billed) : "…"}</div>
      </div>
      <div>
        <div className="text-[13px] text-muted mb-1">Paid</div>
        <div className="text-[16px] font-semibold text-green-600">{t ? m(t.paid) : "…"}</div>
      </div>
      <div>
        <div className="text-[13px] text-muted mb-1">Still owed</div>
        <div className={`text-[16px] font-semibold ${owed > 0 ? "text-[#B42318]" : ""}`}>{t ? m(owed) : "…"}</div>
      </div>
    </div>
  );
}
