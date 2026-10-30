"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Loader2, Printer, Trash2, Receipt, Send, CheckCircle2, Undo2 } from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import type { Matter } from "@/components/NewMatterModal";
import InvoiceModal from "@/components/invoices/InvoiceModal";
import PaymentModal from "@/components/invoices/PaymentModal";
import { type Invoice, money, shortDate, statusOf, readJson } from "@/components/invoices/shared";

// outstanding = issued, not fully paid (with who owes what) · pending = waiting for the managing attorney.
type Filter = "outstanding" | "pending" | "draft" | "paid" | "all";
type Balance = { clientId: string | null; owed: number; overdue: number; count: number; oldestDue: string | null };

// Invoices list: all of them (AI Accountant → Operating) or one matter's (matter page).
export default function InvoicesPanel({
  matters,
  clientName,
  matterId,
  compact = false,
  onChanged,
  focusId = null,
}: {
  matters: Matter[];
  clientName: (id: string | null) => string;
  matterId?: string | null;
  compact?: boolean;
  onChanged?: () => void;
  focusId?: string | null; // opened from a bell alert: show that invoice
}) {
  const { teamMembers } = useWorkspaceData();
  const [canApprove, setCanApprove] = useState(false);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const person = (id: string | null | undefined) => (id ? teamMembers.find((m) => m.id === id)?.fullName ?? "someone" : "someone");
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(`/api/invoices${matterId ? `?matterId=${matterId}` : ""}`)
      .then(readJson)
      .then((d) => {
        if (!live) return;
        setInvoices(d.invoices);
        setCanApprove(!!d.canApprove);
        setBalances(d.balances ?? []);
        setError(null);
      })
      .catch((e: Error & { code?: string }) => {
        if (!live) return;
        if (e.code === "setup_required") setSetup(true);
        else setError(e.message);
        setInvoices([]);
      });
    return () => {
      live = false;
    };
  }, [matterId, reload]);

  const changed = useCallback(() => {
    setReload((r) => r + 1);
    onChanged?.();
  }, [onChanged]);

  async function remove(inv: Invoice) {
    const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
    const msg =
      inv.amountPaid > 0
        ? `Delete ${inv.number}?\n\nIt has ${money(inv.amountPaid)} in payments recorded. Those payment entries will also be removed from the books (Operating, and Trust if it was paid from trust). Any time on it becomes unbilled again.\n\nThis can't be undone.`
        : `Delete ${inv.number}? Any time on it becomes unbilled again.`;
    if (!confirm(msg)) return;
    try {
      await fetch(`/api/invoices/${inv.id}`, { method: "DELETE" }).then(readJson);
      changed();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const matterOf = (id: string | null) => matters.find((m) => m.id === id) ?? null;
  const all = invoices ?? [];
  const isOpen = (i: Invoice) => i.status === "unpaid" || i.status === "partial";
  const counts: Record<Filter, number> = {
    outstanding: all.filter(isOpen).length,
    pending: all.filter((i) => i.status === "pending").length,
    draft: all.filter((i) => i.status === "draft").length,
    paid: all.filter((i) => i.status === "paid").length,
    all: all.length,
  };
  // Opens on what needs attention: approvals for the managing attorney, else outstanding.
  const focused = focusId ? all.find((i) => i.id === focusId) : null;
  const active: Filter =
    filter ??
    (focused
      ? focused.status === "pending" ? "pending" : focused.status === "draft" ? "draft" : focused.status === "paid" ? "paid" : isOpen(focused) ? "outstanding" : "all"
      : compact ? "all" : canApprove && counts.pending ? "pending" : "outstanding");
  const list = all.filter((i) => (active === "outstanding" ? isOpen(i) : active === "all" ? true : i.status === active));
  const owed = all.filter(isOpen).reduce((n, i) => n + i.total - i.amountPaid, 0);
  const paidSum = all.reduce((n, i) => n + i.amountPaid, 0);
  const pendingSum = all.filter((i) => i.status === "pending").reduce((n, i) => n + i.total, 0);

  async function stage(inv: Invoice, action: "submit" | "approve" | "return" | "reopen") {
    let note = "";
    if (action === "return") {
      const v = window.prompt(`Send ${inv.number} back as a draft. What needs changing? (optional)`, "");
      if (v === null) return;
      note = v;
    }
    if (action === "reopen" && !window.confirm(`Turn ${inv.number} back into a draft? It stops showing as owed until it's approved again.`)) return;
    setBusyId(inv.id);
    setActionError(null);
    try {
      await fetch(`/api/invoices/${inv.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note }) }).then(readJson);
      changed();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {(
          [
            ["outstanding", "Outstanding"],
            ["pending", "Waiting for approval"],
            ["draft", "Drafts"],
            ["paid", "Paid"],
            ["all", "All"],
          ] as [Filter, string][]
        ).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-full text-[13px] font-medium flex items-center gap-1.5 ${active === k ? "bg-btn-hover" : "bg-chip hover:bg-btn"}`}>
            {l}
            {counts[k] > 0 && <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold flex items-center justify-center ${k === "pending" && canApprove ? "bg-[#4C2E91] text-white" : "bg-white/70"}`}>{counts[k]}</span>}
          </button>
        ))}
        {invoices && invoices.length > 0 && (
          <span className="text-[13px] text-muted ml-2">
            Still owed <b className="text-ink">{money(owed)}</b> · received <b className="text-ink">{money(paidSum)}</b>
            {pendingSum > 0 && (
              <>
                {" "}· waiting for approval <b className="text-ink">{money(pendingSum)}</b>
              </>
            )}
          </span>
        )}
        <button onClick={() => setCreating(true)} className="ml-auto bg-btn hover:bg-btn-hover px-3.5 py-1.5 rounded-full text-[13px] font-medium flex items-center gap-1.5">
          <Plus size={13} /> New invoice
        </button>
      </div>

      {actionError && <div className="rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-2.5 text-[13px] mb-3">{actionError}</div>}
      {active === "pending" && !canApprove && counts.pending > 0 && (
        <div className="rounded-xl bg-[#EDE7FB] text-[#4C2E91] px-4 py-2.5 text-[13px] mb-3">These are waiting for the managing attorney (the workspace owner or an admin) to approve.</div>
      )}
      {active === "outstanding" && !matterId && balances.length > 0 && (
        <div className="border border-line rounded-xl overflow-x-auto mb-4">
          <div className="px-3 py-2 bg-card-alt text-[12.5px] font-semibold text-muted">Outstanding balances by client</div>
          <table className="w-full text-[13px] min-w-[560px]">
            <thead>
              <tr className="text-left text-[12px] text-muted border-t border-line">
                <th className="font-medium px-3 py-1.5">Client</th>
                <th className="font-medium px-2 py-1.5">Invoices</th>
                <th className="font-medium px-2 py-1.5">Oldest due</th>
                <th className="font-medium px-2 py-1.5 text-right">Overdue</th>
                <th className="font-medium px-3 py-1.5 text-right">Owed</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.clientId ?? "none"} className="border-t border-line">
                  <td className="px-3 py-1.5 font-medium">
                    {b.clientId ? (
                      <Link href={`/dashboard/client-intake?card=${b.clientId}`} className="hover:underline underline-offset-2">
                        {clientName(b.clientId) || "Client"}
                      </Link>
                    ) : (
                      <span className="text-muted">No client</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">{b.count}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{shortDate(b.oldestDue)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${b.overdue > 0 ? "text-[#9F1D1D] font-medium" : "text-muted"}`}>{b.overdue > 0 ? money(b.overdue) : "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{money(b.owed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {setup ? (
        <div className="rounded-xl bg-card-alt px-4 py-3 text-[13.5px]">
          Invoices need a one-time database update. Run <b>supabase/migrations/0046_invoices.sql</b> in the Supabase SQL editor, then refresh.
        </div>
      ) : error ? (
        <div className="rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3 text-[13.5px]">{error}</div>
      ) : !invoices ? (
        <div className="text-[13.5px] text-muted flex items-center gap-2 py-4">
          <Loader2 size={14} className="animate-spin" /> Loading invoices…
        </div>
      ) : list.length === 0 ? (
        <div className="bg-card-alt rounded-xl py-8 text-center text-[13.5px] text-muted">
          <Receipt size={18} className="mx-auto mb-2" />
          {invoices.length
            ? active === "pending"
              ? "Nothing is waiting for approval."
              : active === "draft"
                ? "No drafts."
                : active === "outstanding"
                  ? "Nothing outstanding: every issued invoice is paid."
                  : "No invoices here."
            : matterId
              ? "No invoices for this matter yet."
              : "No invoices yet. Create one for a matter with New invoice."}
        </div>
      ) : (
        <div className="border border-line rounded-xl overflow-x-auto">
          <table className="w-full text-[13px] min-w-[640px]">
            <thead>
              <tr className="text-left text-[12px] text-muted bg-card-alt">
                <th className="font-medium px-3 py-2">Invoice</th>
                {!matterId && <th className="font-medium px-2 py-2">Matter · client</th>}
                <th className="font-medium px-2 py-2">Date</th>
                <th className="font-medium px-2 py-2">Due</th>
                <th className="font-medium px-2 py-2 text-right">Total</th>
                <th className="font-medium px-2 py-2 text-right">Paid</th>
                <th className="font-medium px-2 py-2">Status</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((inv) => {
                const m = matterOf(inv.matterId);
                const st = statusOf(inv);
                const open = inv.status === "unpaid" || inv.status === "partial";
                return (
                  <tr key={inv.id} id={`inv-${inv.id}`} className={`border-t border-line ${inv.id === focusId ? "bg-[#F4F1FD]" : ""}`}>
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">{inv.number}</td>
                    {!matterId && (
                      <td className="px-2 py-2 max-w-[260px]">
                        {m ? (
                          <Link href={`/dashboard/matters/${m.id}`} className="hover:underline underline-offset-2 font-medium" title={m.title}>
                            {m.matterNumber ?? m.title}
                          </Link>
                        ) : (
                          <span className="text-muted">No matter</span>
                        )}
                        <span className="text-muted truncate block">{inv.clientId ? clientName(inv.clientId) : ""}</span>
                      </td>
                    )}
                    <td className="px-2 py-2 whitespace-nowrap">{shortDate(inv.issueDate)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{shortDate(inv.dueDate)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{money(inv.total)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{money(inv.amountPaid)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className={`text-[12px] font-semibold rounded-md px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                      {inv.status === "paid" && inv.paidAt && <span className="block text-[11.5px] text-muted mt-0.5">on {shortDate(inv.paidAt)}</span>}
                      {inv.status === "pending" && <span className="block text-[11.5px] text-muted mt-0.5">from {person(inv.submittedBy ?? inv.createdBy)}</span>}
                      {inv.status === "draft" && inv.reviewNote && <span className="block text-[11.5px] text-[#8A4B14] mt-0.5 max-w-[220px] whitespace-normal">“{inv.reviewNote}”</span>}
                      {(inv.status === "unpaid" || inv.status === "partial" || inv.status === "paid") && inv.approvedBy && <span className="block text-[11.5px] text-muted mt-0.5">approved by {person(inv.approvedBy)}</span>}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {inv.status === "draft" && !canApprove && (
                          <button disabled={busyId === inv.id} onClick={() => void stage(inv, "submit")} className="px-2.5 py-1 rounded-full bg-chip hover:bg-btn text-[12.5px] font-medium whitespace-nowrap flex items-center gap-1 disabled:opacity-50">
                            <Send size={12} /> Send for approval
                          </button>
                        )}
                        {(inv.status === "draft" || inv.status === "pending") && canApprove && (
                          <button disabled={busyId === inv.id} onClick={() => void stage(inv, "approve")} className="px-2.5 py-1 rounded-full bg-[#CAF0D9] hover:bg-[#B6E8CA] text-[#14532D] text-[12.5px] font-medium whitespace-nowrap flex items-center gap-1 disabled:opacity-50">
                            <CheckCircle2 size={12} /> Approve
                          </button>
                        )}
                        {inv.status === "pending" && canApprove && (
                          <button disabled={busyId === inv.id} onClick={() => void stage(inv, "return")} className="px-2.5 py-1 rounded-full bg-chip hover:bg-btn text-[12.5px] font-medium whitespace-nowrap flex items-center gap-1 disabled:opacity-50">
                            <Undo2 size={12} /> Send back
                          </button>
                        )}
                        {inv.status === "unpaid" && inv.amountPaid === 0 && canApprove && (
                          <button disabled={busyId === inv.id} onClick={() => void stage(inv, "reopen")} title="Back to draft" className="w-7 h-7 rounded-full hover:bg-chip flex items-center justify-center text-muted disabled:opacity-50">
                            <Undo2 size={13} />
                          </button>
                        )}
                        {open && (
                          <button onClick={() => setPaying(inv)} className="px-2.5 py-1 rounded-full bg-chip hover:bg-btn text-[12.5px] font-medium whitespace-nowrap">
                            Record payment
                          </button>
                        )}
                        <a href={`/invoice/${inv.id}`} target="_blank" rel="noopener" title="Open / print" aria-label={`Open ${inv.number}`} className="w-7 h-7 rounded-full hover:bg-chip flex items-center justify-center text-muted">
                          <Printer size={13} />
                        </a>
                        <button onClick={() => void remove(inv)} title="Delete invoice" aria-label={`Delete ${inv.number}`} className="w-7 h-7 rounded-full hover:bg-chip hover:text-[#B42318] flex items-center justify-center text-muted">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <InvoiceModal
          matters={matters}
          fixedMatterId={matterId ?? null}
          canApprove={canApprove}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            changed();
          }}
        />
      )}
      {paying && (
        <PaymentModal
          invoice={paying}
          onClose={() => setPaying(null)}
          onPaid={() => {
            setPaying(null);
            changed();
          }}
        />
      )}
    </div>
  );
}
