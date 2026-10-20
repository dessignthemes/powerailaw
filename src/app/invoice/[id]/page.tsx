"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Printer, Loader2 } from "lucide-react";
import { type Invoice, money, shortDate, statusOf, readJson } from "@/components/invoices/shared";

type Data = {
  invoice: Invoice;
  firm: { name: string; logoUrl: string | null };
  client: { name: string; email: string | null; phone: string | null; address: string | null } | null;
  matter: { title: string; number: string | null } | null;
};

// Printable invoice (outside the app menu, so only the invoice prints).
export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/invoices/${id}?print=1`)
      .then(readJson)
      .then((x: Data) => {
        setD(x);
        document.title = `${x.invoice.number}${x.client ? ` · ${x.client.name}` : ""}`;
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <div className="p-10 text-[14px] text-[#9F1D1D]">{error}</div>;
  if (!d)
    return (
      <div className="p-10 text-[14px] text-muted flex items-center gap-2">
        <Loader2 size={15} className="animate-spin" /> Opening the invoice…
      </div>
    );
  const { invoice: inv, firm, client, matter } = d;
  const st = statusOf(inv);
  const owed = Math.round((inv.total - inv.amountPaid) * 100) / 100;

  return (
    <div className="min-h-screen bg-page print:bg-white py-10 print:py-0 px-4">
      <div className="max-w-[820px] mx-auto mb-4 flex justify-end print:hidden">
        <button onClick={() => window.print()} className="bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5">
          <Printer size={14} /> Print or save as PDF
        </button>
      </div>
      <article className="max-w-[820px] mx-auto bg-white border border-line print:border-0 rounded-2xl print:rounded-none p-12 print:p-0 text-[13.5px] text-ink">
        <header className="flex justify-between gap-6 mb-10">
          <div>
            <div className="text-[20px] font-semibold">{firm.name || "Invoice"}</div>
            {!firm.name && <div className="text-[12px] text-muted print:hidden">Set the firm name in Settings so it shows here.</div>}
          </div>
          <div className="text-right">
            <div className="text-[26px] font-semibold tracking-tight">INVOICE</div>
            <div className="font-semibold">{inv.number}</div>
            <span className={`inline-block mt-1 text-[12px] font-semibold rounded-md px-2 py-0.5 ${st.cls}`}>{st.label}</span>
          </div>
        </header>
        <section className="grid grid-cols-2 gap-6 mb-8">
          <div>
            <div className="text-[11.5px] uppercase tracking-wide text-muted mb-1">Bill to</div>
            {client ? (
              <>
                <div className="font-semibold">{client.name}</div>
                {client.address && <div className="whitespace-pre-line">{client.address}</div>}
                {client.email && <div>{client.email}</div>}
                {client.phone && <div>{client.phone}</div>}
              </>
            ) : (
              <div className="text-muted">No client on this matter</div>
            )}
          </div>
          <div className="text-right">
            <div>
              <span className="text-muted">Invoice date: </span>
              {shortDate(inv.issueDate)}
            </div>
            <div>
              <span className="text-muted">Due date: </span>
              {shortDate(inv.dueDate)}
            </div>
            {matter && (
              <div className="mt-2">
                <span className="text-muted">Matter: </span>
                {matter.number ? `${matter.number} · ` : ""}
                {matter.title}
              </div>
            )}
          </div>
        </section>
        <table className="w-full mb-6">
          <thead>
            <tr className="text-left text-[12px] text-muted border-b border-line">
              <th className="font-medium py-2">Description</th>
              <th className="font-medium py-2 text-right w-[90px]">Qty / hrs</th>
              <th className="font-medium py-2 text-right w-[110px]">Rate</th>
              <th className="font-medium py-2 text-right w-[120px]">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(inv.lines ?? []).map((l, i) => (
              <tr key={i} className="border-b border-line align-top">
                <td className="py-2 pr-3">{l.description}</td>
                <td className="py-2 text-right tabular-nums">{l.quantity}</td>
                <td className="py-2 text-right tabular-nums">{money(l.rate)}</td>
                <td className="py-2 text-right tabular-nums">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <section className="ml-auto w-[300px] flex flex-col gap-1">
          <div className="flex justify-between">
            <span>Total</span>
            <span className="tabular-nums font-semibold">{money(inv.total)}</span>
          </div>
          {(inv.payments ?? []).map((p) => (
            <div key={p.id} className="flex justify-between text-muted">
              <span>
                Paid {shortDate(p.date)}
                {p.method ? ` · ${p.method}` : ""}
              </span>
              <span className="tabular-nums">−{money(p.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-line pt-1.5 mt-1 text-[15px] font-semibold">
            <span>Balance due</span>
            <span className="tabular-nums">{money(owed)}</span>
          </div>
        </section>
        {inv.notes && <p className="mt-10 whitespace-pre-line text-muted">{inv.notes}</p>}
      </article>
    </div>
  );
}
