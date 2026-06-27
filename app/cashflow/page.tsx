"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Txn = {
  id: string;
  date: string;
  amount: number;
  merchantName: string | null;
  name: string;
  pfcPrimary: string | null;
  pfcDetailed: string | null;
  paymentChannel: string | null;
  logoUrl: string | null;
  pending: boolean;
  accountName: string | null;
  accountType: string | null;
  accountMask: string | null;
};

type Tab = "overview" | "expenses" | "income" | "transactions";

const money = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString()}`;

const CAT_EMOJI: Record<string, string> = {
  INCOME: "💰",
  TRANSFER_IN: "🔄",
  TRANSFER_OUT: "🔄",
  LOAN_PAYMENTS: "🏦",
  BANK_FEES: "🧾",
  ENTERTAINMENT: "🎬",
  FOOD_AND_DRINK: "🍔",
  GENERAL_MERCHANDISE: "🛍️",
  HOME_IMPROVEMENT: "🔨",
  MEDICAL: "🩺",
  PERSONAL_CARE: "💇",
  GENERAL_SERVICES: "🛠️",
  GOVERNMENT_AND_NON_PROFIT: "🏛️",
  TRANSPORTATION: "🚗",
  TRAVEL: "✈️",
  RENT_AND_UTILITIES: "🏠",
};

function emoji(primary: string | null) {
  return (primary && CAT_EMOJI[primary]) || "📦";
}

function label(primary: string | null) {
  if (!primary) return "Other";
  return primary
    .replace(/_AND_/g, " & ")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isTransfer(t: Txn) {
  if (t.pfcPrimary && ["TRANSFER_IN", "TRANSFER_OUT"].includes(t.pfcPrimary)) return true;
  if (t.pfcDetailed && t.pfcDetailed.includes("CREDIT_CARD_PAYMENT")) return true;
  return false;
}

export default function CashflowPage() {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [month, setMonth] = useState<string>("");
  const [excludeTransfers, setExcludeTransfers] = useState(true);

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [acctFilter, setAcctFilter] = useState<string>("all");
  const [dirFilter, setDirFilter] = useState<"all" | "income" | "expense">("all");

  useEffect(() => {
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
  }, []);

  const months = useMemo(
    () => Array.from(new Set(txns.map((t) => t.date.slice(0, 7)))).sort().reverse(),
    [txns]
  );

  useEffect(() => {
    if (months.length > 0 && !month) {
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const target = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
      setMonth(months.includes(target) ? target : months[0]);
    }
  }, [months, month]);

  const monthTxns = useMemo(() => {
    let list = txns.filter((t) => t.date.slice(0, 7) === month);
    if (excludeTransfers) list = list.filter((t) => !isTransfer(t));
    return list;
  }, [txns, month, excludeTransfers]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of monthTxns) {
      if (t.amount > 0) expense += t.amount;
      else income += -t.amount;
    }
    return { income, expense, net: income - expense };
  }, [monthTxns]);

  const expenseByCat = useMemo(() => {
    const map: Record<string, { amount: number; count: number }> = {};
    for (const t of monthTxns) {
      if (t.amount <= 0) continue;
      const key = t.pfcPrimary || "OTHER";
      if (!map[key]) map[key] = { amount: 0, count: 0 };
      map[key].amount += t.amount;
      map[key].count += 1;
    }
    return Object.entries(map).sort((a, b) => b[1].amount - a[1].amount);
  }, [monthTxns]);

  const incomeBySource = useMemo(() => {
    const map: Record<string, { amount: number; count: number }> = {};
    for (const t of monthTxns) {
      if (t.amount >= 0) continue;
      const key = t.pfcPrimary || "OTHER";
      if (!map[key]) map[key] = { amount: 0, count: 0 };
      map[key].amount += -t.amount;
      map[key].count += 1;
    }
    return Object.entries(map).sort((a, b) => b[1].amount - a[1].amount);
  }, [monthTxns]);

  const allCats = useMemo(
    () => Array.from(new Set(monthTxns.map((t) => t.pfcPrimary || "OTHER"))).sort(),
    [monthTxns]
  );
  const allAccts = useMemo(
    () => Array.from(new Set(monthTxns.map((t) => t.accountName).filter(Boolean) as string[])).sort(),
    [monthTxns]
  );

  const filteredTxns = useMemo(() => {
    return monthTxns
      .filter((t) => {
        if (dirFilter === "expense" && t.amount <= 0) return false;
        if (dirFilter === "income" && t.amount >= 0) return false;
        if (catFilter !== "all" && (t.pfcPrimary || "OTHER") !== catFilter) return false;
        if (acctFilter !== "all" && t.accountName !== acctFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          const hay = `${t.merchantName || ""} ${t.name}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [monthTxns, dirFilter, catFilter, acctFilter, search]);

  const monthLabel = (m: string) => {
    if (!m) return "";
    const [y, mo] = m.split("-");
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
  };

  const maxExpenseCat = expenseByCat.length > 0 ? expenseByCat[0][1].amount : 1;

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-900">
      <div className="max-w-3xl mx-auto px-5 py-8 space-y-5">

        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">← Home</Link>
            <span className="text-lg font-bold tracking-tight ml-2">Cash flow</span>
          </div>
          {months.length > 0 && (
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-slate-300"
            >
              {months.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          )}
        </div>

        {!loaded ? (
          <div className="rounded-2xl bg-white border border-gray-200/70 p-8 text-center text-sm text-slate-400">Loading…</div>
        ) : txns.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-200/70 p-8 text-center space-y-2">
            <p className="text-sm font-semibold">No transactions yet</p>
            <p className="text-sm text-slate-500">Connect your bank and sync from the home page to see your cash flow.</p>
          </div>
        ) : (
          <>
            {/* Summary tiles */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Income</p>
                <p className="text-2xl font-bold tracking-tight tabular-nums text-emerald-700 mt-1">{money(totals.income)}</p>
              </div>
              <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Expenses</p>
                <p className="text-2xl font-bold tracking-tight tabular-nums text-rose-600 mt-1">{money(totals.expense)}</p>
              </div>
              <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Net</p>
                <p className={`text-2xl font-bold tracking-tight tabular-nums mt-1 ${totals.net >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  {totals.net >= 0 ? "+" : "−"}{money(totals.net)}
                </p>
              </div>
            </div>

            {/* Tabs + transfer toggle */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex bg-slate-100 rounded-full p-1">
                {(["overview", "expenses", "income", "transactions"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium capitalize transition focus:outline-none ${
                      tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                <input type="checkbox" checked={excludeTransfers} onChange={(e) => setExcludeTransfers(e.target.checked)} className="accent-emerald-600" />
                Exclude transfers
              </label>
            </div>

            {/* OVERVIEW */}
            {tab === "overview" && (
              <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 space-y-4">
                <p className="text-sm font-semibold">Where your money went</p>
                {expenseByCat.length === 0 ? (
                  <p className="text-sm text-slate-400">No expenses this month.</p>
                ) : (
                  <div className="space-y-3">
                    {expenseByCat.map(([cat, v]) => {
                      const pct = (v.amount / maxExpenseCat) * 100;
                      const pctOfTotal = totals.expense > 0 ? Math.round((v.amount / totals.expense) * 100) : 0;
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="flex items-center gap-2">
                              <span>{emoji(cat)}</span>
                              <span className="font-medium">{label(cat)}</span>
                              <span className="text-xs text-slate-400">{pctOfTotal}%</span>
                            </span>
                            <span className="font-semibold tabular-nums">{money(v.amount)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: "#E2574C" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* EXPENSES */}
            {tab === "expenses" && (
              <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 space-y-3">
                <p className="text-sm font-semibold">Expense categories</p>
                {expenseByCat.map(([cat, v]) => (
                  <button
                    key={cat}
                    onClick={() => { setCatFilter(cat); setDirFilter("expense"); setTab("transactions"); }}
                    className="w-full flex items-center justify-between rounded-xl bg-slate-50 hover:bg-slate-100 px-3 py-2.5 text-left transition"
                  >
                    <span className="flex items-center gap-2.5 text-sm">
                      <span className="text-lg">{emoji(cat)}</span>
                      <span>
                        <span className="font-medium block">{label(cat)}</span>
                        <span className="text-xs text-slate-400">{v.count} transaction{v.count !== 1 ? "s" : ""}</span>
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums text-rose-600">{money(v.amount)}</span>
                  </button>
                ))}
              </div>
            )}

            {/* INCOME */}
            {tab === "income" && (
              <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 space-y-3">
                <p className="text-sm font-semibold">Income sources</p>
                {incomeBySource.length === 0 ? (
                  <p className="text-sm text-slate-400">No income recorded this month.</p>
                ) : (
                  incomeBySource.map(([cat, v]) => (
                    <button
                      key={cat}
                      onClick={() => { setCatFilter(cat); setDirFilter("income"); setTab("transactions"); }}
                      className="w-full flex items-center justify-between rounded-xl bg-slate-50 hover:bg-slate-100 px-3 py-2.5 text-left transition"
                    >
                      <span className="flex items-center gap-2.5 text-sm">
                        <span className="text-lg">{emoji(cat)}</span>
                        <span>
                          <span className="font-medium block">{label(cat)}</span>
                          <span className="text-xs text-slate-400">{v.count} deposit{v.count !== 1 ? "s" : ""}</span>
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums text-emerald-700">{money(v.amount)}</span>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* TRANSACTIONS */}
            {tab === "transactions" && (
              <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search merchant…"
                    className="flex-1 min-w-[140px] border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-300"
                  />
                  <select value={dirFilter} onChange={(e) => setDirFilter(e.target.value as "all" | "income" | "expense")} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none">
                    <option value="all">All</option>
                    <option value="expense">Expenses</option>
                    <option value="income">Income</option>
                  </select>
                  <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none">
                    <option value="all">All categories</option>
                    {allCats.map((c) => <option key={c} value={c}>{label(c)}</option>)}
                  </select>
                  {allAccts.length > 1 && (
                    <select value={acctFilter} onChange={(e) => setAcctFilter(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none">
                      <option value="all">All accounts</option>
                      {allAccts.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  )}
                </div>

                <p className="text-xs text-slate-400">{filteredTxns.length} transactions</p>

                <div className="divide-y divide-gray-100">
                  {filteredTxns.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 py-2.5">
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-base shrink-0 overflow-hidden">
                        {t.logoUrl ? <img src={t.logoUrl} alt="" className="w-full h-full object-cover" /> : emoji(t.pfcPrimary)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.merchantName || t.name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {label(t.pfcPrimary)}{t.accountName ? ` · ${t.accountName}` : ""} · {t.date}
                          {t.pending ? " · pending" : ""}
                        </p>
                      </div>
                      <p className={`text-sm font-semibold tabular-nums shrink-0 ${t.amount > 0 ? "text-slate-900" : "text-emerald-700"}`}>
                        {t.amount > 0 ? "−" : "+"}{money(t.amount)}
                      </p>
                    </div>
                  ))}
                  {filteredTxns.length === 0 && <p className="text-sm text-slate-400 py-4">No transactions match your filters.</p>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}