"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Landmark } from "lucide-react";
import type { Matter } from "@/components/NewMatterModal";
import { money, shortDate, readJson } from "@/components/invoices/shared";

type Bal = { matterId: string | null; clientId: string | null; deposits: number; paidOut: number; balance: number; last: string };

// Client trust (IOLTA) balances per matter: money held for clients, never income.
export default function TrustBalances({ matters, clientName, reloadKey = 0 }: { matters: Matter[]; clientName: (id: string | null) => string; reloadKey?: number }) {
  const [rows, setRows] = useState<Bal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/accounting/trust")
      .then(readJson)
      .then((d) => live && setRows(d.balances))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [reloadKey]);

  if (error) return <div className="rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3 text-[13.5px]">{error}</div>;
  if (!rows)
    return (
      <div className="text-[13.5px] text-muted flex items-center gap-2 py-4">
        <Loader2 size={14} className="animate-spin" /> Loading trust balances…
      </div>
    );
  const total = rows.reduce((n, r) => n + r.balance, 0);
  const negative = rows.filter((r) => r.balance < -0.004);
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <Landmark size={16} className="text-muted" />
        <span className="text-[14px]">
          Held in trust for clients: <b>{money(total)}</b>
        </span>
      </div>
      {negative.length > 0 && (
        <div className="mb-3 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3 text-[13px]">
          {negative.length === 1 ? "One matter shows" : `${negative.length} matters show`} more paid out of trust than was deposited. Check those entries; a client&apos;s trust balance
          should never go below zero.
        </div>
      )}
      {rows.length === 0 ? (
        <div className="bg-card-alt rounded-xl py-8 text-center text-[13.5px] text-muted">
          No trust activity yet. Trust deposits and payments imported or added with the account set to <b>Trust (IOLTA)</b> and linked to a matter show here.
        </div>
      ) : (
        <div className="border border-line rounded-xl overflow-x-auto">
          <table className="w-full text-[13px] min-w-[560px]">
            <thead>
              <tr className="text-left text-[12px] text-muted bg-card-alt">
                <th className="font-medium px-3 py-2">Matter · client</th>
                <th className="font-medium px-2 py-2 text-right">Deposited</th>
                <th className="font-medium px-2 py-2 text-right">Paid out / to operating</th>
                <th className="font-medium px-2 py-2 text-right">Balance</th>
                <th className="font-medium px-3 py-2 text-right">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const m = matters.find((x) => x.id === r.matterId);
                return (
                  <tr key={r.matterId ?? `c${i}`} className="border-t border-line">
                    <td className="px-3 py-2">
                      {m ? (
                        <Link href={`/dashboard/matters/${m.id}`} className="font-medium hover:underline underline-offset-2" title={m.title}>
                          {m.matterNumber ?? m.title}
                        </Link>
                      ) : (
                        <span className="text-[#8A4B14]">Not linked to a matter</span>
                      )}
                      <span className="block text-muted truncate max-w-[320px]">{clientName(r.clientId ?? m?.clientId ?? null)}</span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{money(r.deposits)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{money(r.paidOut)}</td>
                    <td className={`px-2 py-2 text-right tabular-nums font-semibold ${r.balance < -0.004 ? "text-[#9F1D1D]" : ""}`}>{money(r.balance)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-muted">{shortDate(r.last)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
