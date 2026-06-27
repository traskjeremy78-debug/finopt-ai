"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Txn = {
  id: string;
  date: string;
  amount: number;
  pfcPrimary: string | null;
  pfcDetailed: string | null;
};

const money = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString()}`;

function isTransfer(t: Txn) {
  if (t.pfcPrimary && ["TRANSFER_IN", "TRANSFER_OUT"].includes(t.pfcPrimary)) return true;
  if (t.pfcDetailed && t.pfcDetailed.includes("CREDIT_CARD_PAYMENT")) return true;
  return false;
}

function label(primary: string | null) {
  if (!primary) return "Other";
  return primary
    .replace(/_AND_/g, " & ")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CashflowMiniSummary({ connected }: { connected: boolean }) {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!connected) return;
    (async () => {
      try {
        const res = await fetch("/api/transactions");
        const data = await res.json();
        if (res.ok && data.ok) setTxns(data.transactions);
      } catch (e) {
        console.error(e);
      } finally {
        setLoaded(true);
      }
    })();
  }, [connected]);

  const summary = useMemo(() => {
    if (txns.length === 0) return null;

    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    let targetMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;

    const months = Array.from(new Set(txns.map((t) => t.date.slice(0, 7)))).sort().reverse();
    if (!months.includes(targetMonth)) targetMonth = months[0];
    if (!targetMonth) return null;

    const monthTxns = txns.filter((t) => t.date.slice(0, 7) === targetMonth && !isTransfer(t));
    let income = 0;
    let expense = 0;
    const byCat: Record<string, number> = {};
    for (const t of monthTxns) {
      if (t.amount > 0) {
        expense += t.amount;
        const key = t.pfcPrimary || "OTHER";
        byCat[key] = (byCat[key] || 0) + t.amount;
      } else {
        income += -t.amount;
      }
    }
    const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const [y, m] = targetMonth.split("-");
    const monthName = new Date(Number(y), Number(m) - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });

    return { monthName, income, expense, net: income - expense, topCats };
  }, [txns]);

  if (!connected || !loaded || !summary) return null;

  return (
    <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Cash flow</p>
          <p className="text-sm text-slate-500">{summary.monthName}</p>
        </div>
        <Link href="/cashflow" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">
          See details →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
          <p className="text-[11px] text-slate-500">Income</p>
          <p className="text-lg font-bold tracking-tight tabular-nums text-emerald-700">{money(summary.income)}</p>
        </div>
        <div className="rounded-xl bg-rose-50 border border-rose-100 p-3">
          <p className="text-[11px] text-slate-500">Expenses</p>
          <p className="text-lg font-bold tracking-tight tabular-nums text-rose-600">{money(summary.expense)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
          <p className="text-[11px] text-slate-500">Net</p>
          <p className={`text-lg font-bold tracking-tight tabular-nums ${summary.net >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
            {summary.net >= 0 ? "+" : "−"}{money(summary.net)}
          </p>
        </div>
      </div>

      {summary.topCats.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.topCats.map(([cat, amt]) => (
            <span key={cat} className="text-xs bg-slate-100 rounded-full px-2.5 py-1 text-slate-600">
              {label(cat)} <span className="font-semibold tabular-nums">{money(amt)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}