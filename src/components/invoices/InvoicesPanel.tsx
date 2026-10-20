"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Loader2, Printer, Trash2, Receipt } from "lucide-react";
import type { Matter } from "@/components/NewMatterModal";
import InvoiceModal from "@/components/invoices/InvoiceModal";
import PaymentModal from "@/components/invoices/PaymentModal";
import { type Invoice, money, shortDate, statusOf, readJson } from "@/components/invoices/shared";

type Filter = "all" | "unpaid" | "paid";

// Invoices list: all of them (AI Accountant → Operating) or one matter's (matter page).
export default function InvoicesPanel({
  matters,
  clientName,
  matterId,
  compact = false,
  onChanged,
}: {
  matters: Matter[];
  clientName: (id: string | null) => string;
  matterId?: string | null;
  compact?: boolean;
  onChanged?: () => void;
}) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
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
    if (!confirm(`Delete ${inv.number}? Any time on it becomes unbilled again.`)) return;
    try {
      await fetch(`/api/invoices/${inv.id}`, { method: "DELETE" }).then(readJson);
      changed();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const matterOf = (id: string | null) => matters.find((m) => m.id === id) ?? null;
  const list = (invoices ?? []).filter((i) => (filter === "paid" ? i.status === "paid" : filter === "unpaid" ? i.status === "unpaid" || i.status === "partial" : true));
  const owed = (invoices ?? []).filter((i) => i.status === "unpaid" || i.status === "partial").reduce((n, i) => n + i.total - i.amountPaid, 0);
  const paidSum = (invoices ?? []).reduce((n, i) => n + i.amountPaid, 0);

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {!compact &&
          (
            [
              ["all", "All"],
              ["unpaid", "Unpaid"],
              ["paid", "Paid"],
            ] as [Filter, string][]
          ).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-full text-[13px] font-medium ${filter === k ? "bg-btn-hover" : "bg-chip hover:bg-btn"}`}>
              {l}
            </button>
          ))}
        {invoices && invoices.length > 0 && (
          <span className={`text-[13px] text-muted ${compact ? "" : "ml-2"}`}>
            Still owed <b className="text-ink">{money(owed)}</b> · received <b className="text-ink">{money(paidSum)}</b>
          </span>
        )}
        <button onClick={() => setCreating(true)} className="ml-auto bg-btn hover:bg-btn-hover px-3.5 py-1.5 rounded-full text-[13px] font-medium flex items-center gap-1.5">
          <Plus size={13} /> New invoice
        </button>
      </div>

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
          {invoices.length ? "No invoices match." : matterId ? "No invoices for this matter yet." : "No invoices yet. Create one for a matter with New invoice."}
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
                  <tr key={inv.id} className="border-t border-line">
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
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {open && (
                          <button onClick={() => setPaying(inv)} className="px-2.5 py-1 rounded-full bg-chip hover:bg-btn text-[12.5px] font-medium whitespace-nowrap">
                            Record payment
                          </button>
                        )}
                        <a href={`/invoice/${inv.id}`} target="_blank" rel="noopener" title="Open / print" aria-label={`Open ${inv.number}`} className="w-7 h-7 rounded-full hover:bg-chip flex items-center justify-center text-muted">
                          <Printer size={13} />
                        </a>
                        {inv.amountPaid === 0 && (
                          <button onClick={() => void remove(inv)} title="Delete" aria-label={`Delete ${inv.number}`} className="w-7 h-7 rounded-full hover:bg-chip flex items-center justify-center text-muted">
                            <Trash2 size={13} />
                          </button>
                        )}
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
