"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePlaidLink } from "react-plaid-link";
import { computeFinOptScore } from "../src/lib/finopt";
import CashflowMiniSummary from "./components/CashflowMiniSummary";

type DashboardData = {
  summary: {
    totalCash: number;
    totalDebt: number;
    totalInvestments: number;
    netWorth: number;
    accountCount: number;
    recentTransactionCount: number;
  };
};

type Account = {
  id: string;
  name: string;
  officialName: string | null;
  type: string;
  subtype: string | null;
  currentBalance: number;
  availableBalance: number | null;
  currency: string;
  mask: string | null;
  apr: number | null;
  rateSource: string | null;
  minimumPayment: number | null;
  lastPaymentAmount: number | null;
  plaidAccountId: string;
};

type AccountFilter = "debts" | "assets" | "all";

type PlaidStatus = {
  connected: boolean;
  institutionName: string | null;
  lastSyncedAt: string | null;
};

type DebtInput = {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minPayment: number;
  overpayment: number;
};

type ManualItem = {
  id: string;
  name: string;
  kind: "asset" | "debt";
  balance: number;
  apr: number | null;
  minPayment: number | null;
  lastPayment: number | null;
};

type RankedItem = {
  id: string;
  name: string;
  currentBalance: number;
  apr: number | null;
};

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const MANUAL_ITEMS_KEY = "finopt_manual_items";

const MOCK_ACCOUNTS: Account[] = [
  { id: "mock-chk", name: "Chase Checking", officialName: "Chase Total Checking", type: "depository", subtype: "checking", currentBalance: 4218, availableBalance: 4218, currency: "USD", mask: "4821", apr: null, rateSource: null, minimumPayment: null, lastPaymentAmount: null, plaidAccountId: "mock-chk" },
  { id: "mock-sav", name: "Marcus Savings", officialName: "Marcus High-Yield Savings", type: "depository", subtype: "savings", currentBalance: 11945, availableBalance: 11945, currency: "USD", mask: "3302", apr: 4.5, rateSource: null, minimumPayment: null, lastPaymentAmount: null, plaidAccountId: "mock-sav" },
  { id: "mock-401k", name: "Fidelity 401(k)", officialName: null, type: "investment", subtype: "401k", currentBalance: 48320, availableBalance: null, currency: "USD", mask: null, apr: null, rateSource: null, minimumPayment: null, lastPaymentAmount: null, plaidAccountId: "mock-401k" },
  { id: "mock-brok", name: "Vanguard Brokerage", officialName: null, type: "investment", subtype: "brokerage", currentBalance: 15512, availableBalance: null, currency: "USD", mask: null, apr: null, rateSource: null, minimumPayment: null, lastPaymentAmount: null, plaidAccountId: "mock-brok" },
  { id: "mock-cc", name: "Visa Credit Card", officialName: null, type: "credit", subtype: "credit card", currentBalance: 4832, availableBalance: null, currency: "USD", mask: "5519", apr: 22.99, rateSource: null, minimumPayment: 96, lastPaymentAmount: 120, plaidAccountId: "mock-cc" },
  { id: "mock-auto", name: "Toyota Auto Loan", officialName: null, type: "loan", subtype: "auto", currentBalance: 14208, availableBalance: null, currency: "USD", mask: null, apr: 7.2, rateSource: null, minimumPayment: 285, lastPaymentAmount: 285, plaidAccountId: "mock-auto" },
  { id: "mock-student", name: "Federal Student Loans", officialName: null, type: "loan", subtype: "student", currentBalance: 28150, availableBalance: null, currency: "USD", mask: null, apr: 5.5, rateSource: null, minimumPayment: 318, lastPaymentAmount: 318, plaidAccountId: "mock-student" },
];

const MOCK_DASHBOARD: DashboardData = {
  summary: { totalCash: 16163, totalInvestments: 63832, totalDebt: 47190, netWorth: 32805, accountCount: 7, recentTransactionCount: 12 },
};

const MOCK_MANUAL_ITEMS: ManualItem[] = [
  { id: "mock-home", name: "Primary Residence", kind: "asset", balance: 340000, apr: null, minPayment: null, lastPayment: null },
  { id: "mock-car", name: "Toyota RAV4", kind: "asset", balance: 24500, apr: null, minPayment: null, lastPayment: null },
  { id: "mock-mortgage", name: "Mortgage", kind: "debt", balance: 294750, apr: 6.5, minPayment: 1850, lastPayment: 1850 },
];

export default function HomePage() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeFilter, setActiveFilter] = useState<AccountFilter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [plaidStatus, setPlaidStatus] = useState<PlaidStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [benchmarkRate, setBenchmarkRate] = useState(8);
  const [mathExpanded, setMathExpanded] = useState(false);
  const [accountsExpanded, setAccountsExpanded] = useState(false);
  const [assumptionsExpanded, setAssumptionsExpanded] = useState(false);
  const [topAccountsExpanded, setTopAccountsExpanded] = useState(false);
  const [age, setAge] = useState<number | null>(null);

  const [editingMinPaymentId, setEditingMinPaymentId] = useState<string | null>(null);
  const [minPaymentValue, setMinPaymentValue] = useState("");
  const [savingMinPaymentId, setSavingMinPaymentId] = useState<string | null>(null);

  const [editingLastPaymentId, setEditingLastPaymentId] = useState<string | null>(null);
  const [lastPaymentValue, setLastPaymentValue] = useState("");
  const [savingLastPaymentId, setSavingLastPaymentId] = useState<string | null>(null);

const [resetting, setResetting] = useState(false);

async function resetDemoData() {
  if (!confirm("This will permanently erase all connected accounts, transactions, and holdings for everyone using this link. Continue?")) {
    return;
  }
  setResetting(true);
  try {
    const res = await fetch("/api/admin/reset", { method: "POST" });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Reset failed");
    try {
      window.localStorage.removeItem("finopt_age");
      window.localStorage.removeItem("finopt_manual_items");
    } catch {}
    alert("Demo data reset. Reloading...");
    window.location.reload();
  } catch (err) {
    console.error(err);
    alert("Failed to reset demo data.");
  } finally {
    setResetting(false);
  }
}

  const [hasMatch, setHasMatch] = useState(false);
  const [matchCapPercent, setMatchCapPercent] = useState(6);
  const [currentContributionPercent, setCurrentContributionPercent] = useState(0);
  const [annualSalary, setAnnualSalary] = useState(0);

  const manualSectionRef = useRef<HTMLDivElement>(null);
  const assumptionsSectionRef = useRef<HTMLDivElement>(null);

  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [manualExpanded, setManualExpanded] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualKind, setManualKind] = useState<"asset" | "debt">("asset");
  const [manualBalance, setManualBalance] = useState("");
  const [manualApr, setManualApr] = useState("");
  const [manualMinPayment, setManualMinPayment] = useState("");
  const [manualLastPayment, setManualLastPayment] = useState("");

  useEffect(() => {
    try {
      const a = window.localStorage.getItem("finopt_age");
      if (a) setAge(parseInt(a, 10) || null);
      const m = window.localStorage.getItem(MANUAL_ITEMS_KEY);
      if (m) setManualItems(JSON.parse(m));
    } catch {}
  }, []);

  function persistManualItems(items: ManualItem[]) {
    setManualItems(items);
    try {
      window.localStorage.setItem(MANUAL_ITEMS_KEY, JSON.stringify(items));
    } catch {}
  }

  function addManualItem() {
    const balance = parseFloat(manualBalance);
    if (!manualName.trim() || isNaN(balance) || balance < 0) {
      alert("Enter a name and a valid balance.");
      return;
    }
    const apr = manualApr.trim() === "" ? null : parseFloat(manualApr);
    const minPayment = manualMinPayment.trim() === "" ? null : parseFloat(manualMinPayment);
    const lastPayment = manualLastPayment.trim() === "" ? null : parseFloat(manualLastPayment);

    const newItem: ManualItem = {
      id: `manual-${Date.now()}`,
      name: manualName.trim(),
      kind: manualKind,
      balance,
      apr: apr != null && !isNaN(apr) ? apr : null,
      minPayment: minPayment != null && !isNaN(minPayment) ? minPayment : null,
      lastPayment: lastPayment != null && !isNaN(lastPayment) ? lastPayment : null,
    };

    persistManualItems([...manualItems, newItem]);
    setManualName("");
    setManualBalance("");
    setManualApr("");
    setManualMinPayment("");
    setManualLastPayment("");
  }

  function removeManualItem(id: string) {
    persistManualItems(manualItems.filter((m) => m.id !== id));
  }

  function updateAge(val: string) {
    const parsed = parseInt(val, 10);
    if (isNaN(parsed) || parsed <= 0) {
      setAge(null);
      try { window.localStorage.removeItem("finopt_age"); } catch {}
    } else {
      setAge(parsed);
      try { window.localStorage.setItem("finopt_age", String(parsed)); } catch {}
    }
  }

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load dashboard");
      setDashboard(data);
    } catch (err) { console.error(err); }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load accounts");
      setAccounts(data.accounts);
    } catch (err) { console.error(err); }
  }, []);

  const loadPlaidStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/plaid/status");
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to check Plaid status");
      setPlaidStatus(data);
    } catch (err) { console.error(err); }
  }, []);

  const createLinkToken = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/plaid/link-token", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to create link token");
      setLinkToken(data.link_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }, []);

  useEffect(() => {
    createLinkToken();
    loadDashboard();
    loadAccounts();
    loadPlaidStatus();
  }, [createLinkToken, loadDashboard, loadAccounts, loadPlaidStatus]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken) => {
      try {
        const exchangeRes = await fetch("/api/plaid/exchange-public-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_token: publicToken }),
        });
        const exchangeData = await exchangeRes.json();
        if (!exchangeRes.ok || !exchangeData.ok) throw new Error(exchangeData.error || "Failed to exchange public token");
        await fetch("/api/plaid/accounts");
        await fetch("/api/plaid/transactions");
        await fetch("/api/plaid/holdings");
        await loadDashboard();
        await loadAccounts();
        await loadPlaidStatus();
      } catch (err) {
        console.error("Plaid connect flow failed:", err);
        alert("Failed to complete bank connection.");
      }
    },
  });

  async function syncAccounts() {
    setSyncing(true);
    try {
      await fetch("/api/plaid/accounts");
      await fetch("/api/plaid/transactions");
      await fetch("/api/plaid/holdings");
      await loadDashboard();
      await loadAccounts();
      await loadPlaidStatus();
    } catch (err) {
      console.error(err);
      alert("Failed to sync accounts.");
    } finally {
      setSyncing(false);
    }
  }

  const isConnected = plaidStatus?.connected ?? false;
  const usingMockData = !isConnected && manualItems.length === 0;

  const effectiveDashboard = usingMockData ? MOCK_DASHBOARD : dashboard;
  const effectiveAccounts = usingMockData ? MOCK_ACCOUNTS : accounts;
  const effectiveManualItems = usingMockData ? MOCK_MANUAL_ITEMS : manualItems;

  const plaidAssets = (effectiveDashboard?.summary.totalCash ?? 0) + (effectiveDashboard?.summary.totalInvestments ?? 0);
  const plaidDebts = effectiveDashboard?.summary.totalDebt ?? 0;

  const manualAssetItems = effectiveManualItems.filter((m) => m.kind === "asset");
  const manualDebtItems = effectiveManualItems.filter((m) => m.kind === "debt");
  const manualAssetsTotal = manualAssetItems.reduce((s, m) => s + m.balance, 0);
  const manualDebtsTotal = manualDebtItems.reduce((s, m) => s + m.balance, 0);

  const assets = plaidAssets + manualAssetsTotal;
  const debts = plaidDebts + manualDebtsTotal;
  const netWorth = assets - debts;

  const assetAccounts = effectiveAccounts.filter((a) => a.type === "depository" || a.type === "investment");
  const debtAccounts = effectiveAccounts.filter((a) => a.type === "credit" || a.type === "loan");

  const displayedAccounts = activeFilter === "assets" ? assetAccounts : activeFilter === "debts" ? debtAccounts : effectiveAccounts;

  function getRateColor(apr: number, accountType: string): string {
    const isAsset = accountType === "depository" || accountType === "investment";
    const threshold = 4;
    if (isAsset) {
      if (apr >= threshold) {
        const cappedApr = Math.min(apr, 10);
        const intensity = Math.max(0, Math.min(1, (cappedApr - threshold) / (10 - threshold)));
        return `hsl(152, 55%, ${64 - intensity * 30}%)`;
      } else {
        const intensity = Math.max(0, Math.min(1, (threshold - apr) / threshold));
        return `hsl(38, 92%, ${68 - intensity * 16}%)`;
      }
    } else {
      if (apr < benchmarkRate) {
        return `hsl(45, 95%, 72%)`;
      } else {
        const cappedApr = Math.min(apr, 20);
        const intensity = Math.max(0, Math.min(1, (cappedApr - benchmarkRate) / (20 - benchmarkRate)));
        return `hsl(350, 72%, ${66 - intensity * 26}%)`;
      }
    }
  }

  function startEditing(account: Account) {
    setEditingId(account.id);
    setEditValue(account.apr != null ? String(account.apr) : "");
  }
  function cancelEditing() { setEditingId(null); setEditValue(""); }
  async function saveRate(accountId: string) {
    const parsed = parseFloat(editValue);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) { alert("Enter a valid rate between 0 and 100."); return; }
    setSavingId(accountId);
    try {
      const res = await fetch(`/api/accounts/${accountId}/rate`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apr: parsed }) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to save rate");
      await loadAccounts(); setEditingId(null); setEditValue("");
    } catch (err) { console.error(err); alert("Failed to save rate."); } finally { setSavingId(null); }
  }

  function startEditingMinPayment(account: Account) {
    setEditingMinPaymentId(account.id);
    setMinPaymentValue(account.minimumPayment != null ? String(account.minimumPayment) : "");
  }
  function cancelEditingMinPayment() { setEditingMinPaymentId(null); setMinPaymentValue(""); }
  async function saveMinPayment(accountId: string) {
    const parsed = parseFloat(minPaymentValue);
    if (isNaN(parsed) || parsed < 0) { alert("Enter a valid minimum payment amount."); return; }
    setSavingMinPaymentId(accountId);
    try {
      const res = await fetch(`/api/accounts/${accountId}/rate`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minimumPayment: parsed }) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to save minimum payment");
      await loadAccounts(); setEditingMinPaymentId(null); setMinPaymentValue("");
    } catch (err) { console.error(err); alert("Failed to save minimum payment."); } finally { setSavingMinPaymentId(null); }
  }

  function startEditingLastPayment(account: Account) {
    setEditingLastPaymentId(account.id);
    setLastPaymentValue(account.lastPaymentAmount != null ? String(account.lastPaymentAmount) : "");
  }
  function cancelEditingLastPayment() { setEditingLastPaymentId(null); setLastPaymentValue(""); }
  async function saveLastPayment(accountId: string) {
    const parsed = parseFloat(lastPaymentValue);
    if (isNaN(parsed) || parsed < 0) { alert("Enter a valid last payment amount."); return; }
    setSavingLastPaymentId(accountId);
    try {
      const res = await fetch(`/api/accounts/${accountId}/rate`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lastPaymentAmount: parsed }) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to save last payment");
      await loadAccounts(); setEditingLastPaymentId(null); setLastPaymentValue("");
    } catch (err) { console.error(err); alert("Failed to save last payment."); } finally { setSavingLastPaymentId(null); }
  }

  function simulateHousehold(debtsInput: DebtInput[], benchmarkPct: number, horizonMonths: number, mode: "current" | "optimal"): { netWorth: number; totalInterest: number } {
    const ds = debtsInput.map((d) => ({ ...d }));
    const monthlyBenchmark = benchmarkPct / 100 / 12;
    const totalExtra = ds.reduce((s, d) => s + d.overpayment, 0);
    let invested = 0;
    let totalInterest = 0;
    for (let mo = 0; mo < horizonMonths; mo++) {
      for (const d of ds) {
        if (d.balance > 0) { const interest = d.balance * (d.apr / 100 / 12); d.balance += interest; totalInterest += interest; }
      }
      let totalPaidThisMonth = 0;
      let remainingExtra = totalExtra;
      if (mode === "current") {
        for (const d of ds) {
          if (d.balance <= 0) continue;
          const monthlyInterest = d.balance * (d.apr / 100 / 12 / (1 + d.apr / 100 / 12));
          const effectiveMin = Math.max(d.minPayment, monthlyInterest);
          const pay = Math.min(effectiveMin + d.overpayment, d.balance);
          d.balance -= pay; totalPaidThisMonth += pay;
        }
      } else {
        for (const d of ds) {
          if (d.balance <= 0) continue;
          const monthlyInterest = d.balance * (d.apr / 100 / 12 / (1 + d.apr / 100 / 12));
          const effectiveMin = Math.max(d.minPayment, monthlyInterest);
          const pay = Math.min(effectiveMin, d.balance);
          d.balance -= pay; totalPaidThisMonth += pay;
        }
        const highRate = ds.filter((d) => d.balance > 0 && d.apr >= benchmarkPct).sort((a, b) => b.apr - a.apr);
        if (highRate.length > 0 && remainingExtra > 0) {
          const target = highRate[0];
          const pay = Math.min(remainingExtra, target.balance);
          target.balance -= pay; totalPaidThisMonth += pay; remainingExtra -= pay;
        }
      }
      const totalBudget = ds.reduce((s, d) => s + d.minPayment, 0) + totalExtra;
      const leftover = Math.max(0, totalBudget - totalPaidThisMonth);
      invested = invested * (1 + monthlyBenchmark) + leftover;
    }
    const remainingBalance = ds.reduce((s, d) => s + Math.max(0, d.balance), 0);
    return { netWorth: invested - remainingBalance, totalInterest };
  }

  const householdDebtInputs: DebtInput[] = useMemo(() => {
    const plaidDebtInputs = debtAccounts.filter((a) => a.apr != null).map((a) => ({
      id: a.id, name: a.name, balance: a.currentBalance, apr: a.apr as number,
      minPayment: a.minimumPayment ?? 0, overpayment: Math.max(0, (a.lastPaymentAmount ?? 0) - (a.minimumPayment ?? 0)),
    }));
    const manualDebtInputs = manualDebtItems.filter((m) => m.apr != null).map((m) => ({
      id: m.id, name: m.name, balance: m.balance, apr: m.apr as number,
      minPayment: m.minPayment ?? 0, overpayment: Math.max(0, (m.lastPayment ?? 0) - (m.minPayment ?? 0)),
    }));
    return [...plaidDebtInputs, ...manualDebtInputs];
  }, [debtAccounts, manualDebtItems]);

  const totalExtraAcrossDebts = householdDebtInputs.reduce((s, d) => s + d.overpayment, 0);
  const payoffOrder = useMemo(() => [...householdDebtInputs].sort((a, b) => b.apr - a.apr), [householdDebtInputs]);

  const matchGapMonthly = useMemo(() => {
    if (!hasMatch || annualSalary <= 0) return 0;
    const gapPercent = Math.max(0, matchCapPercent - currentContributionPercent);
    return (annualSalary * (gapPercent / 100)) / 12;
  }, [hasMatch, matchCapPercent, currentContributionPercent, annualSalary]);

  const isCapturingFullMatch = !hasMatch || currentContributionPercent >= matchCapPercent;

  const householdImpact = useMemo(() => {
    if (householdDebtInputs.length === 0 || totalExtraAcrossDebts <= 0) return null;
    const horizons = [120, 240, 360];
    const results = horizons.map((months) => {
      const current = simulateHousehold(householdDebtInputs, benchmarkRate, months, "current");
      const optimal = simulateHousehold(householdDebtInputs, benchmarkRate, months, "optimal");
      return { gap: optimal.netWorth - current.netWorth, interestSaved: current.totalInterest - optimal.totalInterest };
    });
    return { gap10: results[0].gap, gap20: results[1].gap, gap30: results[2].gap, interestSaved30: results[2].interestSaved };
  }, [householdDebtInputs, totalExtraAcrossDebts, benchmarkRate]);

  const scoreResult = useMemo(() => {
    if (!effectiveDashboard) return null;
    const plaidScoreDebts = debtAccounts.filter((a) => a.apr != null).map((a) => ({
      apr: a.apr as number, balance: a.currentBalance, minPayment: a.minimumPayment ?? 0, lastPayment: a.lastPaymentAmount ?? 0,
    }));
    const manualScoreDebts = manualDebtItems.filter((m) => m.apr != null).map((m) => ({
      apr: m.apr as number, balance: m.balance, minPayment: m.minPayment ?? 0, lastPayment: m.lastPayment ?? 0,
    }));
    return computeFinOptScore({
      debts: [...plaidScoreDebts, ...manualScoreDebts],
      benchmark: benchmarkRate, hasMatch, matchCapPercent, currentContributionPercent,
      netWorth, assets, totalDebt: debts, age,
    });
  }, [effectiveDashboard, debtAccounts, manualDebtItems, benchmarkRate, hasMatch, matchCapPercent, currentContributionPercent, netWorth, assets, debts, age]);
  const targetYear = new Date().getFullYear() + 30;

  const knownDebts = debtAccounts.filter((a) => a.apr != null);
  const plaidCostlyDebt = knownDebts.filter((a) => (a.apr as number) >= benchmarkRate).reduce((s, a) => s + a.currentBalance, 0);
  const plaidFavorableDebt = knownDebts.filter((a) => (a.apr as number) < benchmarkRate).reduce((s, a) => s + a.currentBalance, 0);
  const plaidUnratedDebt = debtAccounts.filter((a) => a.apr == null).reduce((s, a) => s + a.currentBalance, 0);

  const manualCostlyDebt = manualDebtItems.filter((m) => m.apr != null && (m.apr as number) >= benchmarkRate).reduce((s, m) => s + m.balance, 0);
  const manualFavorableDebt = manualDebtItems.filter((m) => m.apr != null && (m.apr as number) < benchmarkRate).reduce((s, m) => s + m.balance, 0);
  const manualUnratedDebt = manualDebtItems.filter((m) => m.apr == null).reduce((s, m) => s + m.balance, 0);

  const costlyDebt = plaidCostlyDebt + manualCostlyDebt;
  const favorableDebt = plaidFavorableDebt + manualFavorableDebt;
  const unratedDebt = plaidUnratedDebt + manualUnratedDebt;

  const C = 2 * Math.PI * 64;
  const ringTotal = assets + costlyDebt + favorableDebt + unratedDebt;
  const seg = (v: number) => (ringTotal > 0 ? (v / ringTotal) * C : 0);
  const aLen = seg(assets), fLen = seg(favorableDebt), eLen = seg(costlyDebt), uLen = seg(unratedDebt);

  const centerValue = activeFilter === "debts" ? debts : activeFilter === "assets" ? assets : netWorth;
  const centerLabel = activeFilter === "debts" ? "Total debt" : activeFilter === "assets" ? "Total assets" : "Net worth";

  const tabBtn = (key: AccountFilter) =>
    `flex-1 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
      activeFilter === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
    }`;

  const dotColor = (s: string) => (s === "good" ? "bg-emerald-500" : s === "ok" ? "bg-amber-400" : "bg-rose-400");

  const allRankedAssets: RankedItem[] = useMemo(() => {
    const fromPlaid: RankedItem[] = assetAccounts.map((a) => ({ id: a.id, name: a.name, currentBalance: a.currentBalance, apr: a.apr }));
    const fromManual: RankedItem[] = manualAssetItems.map((m) => ({ id: m.id, name: m.name, currentBalance: m.balance, apr: m.apr }));
    return [...fromPlaid, ...fromManual].sort((a, b) => b.currentBalance - a.currentBalance).slice(0, 5);
  }, [assetAccounts, manualAssetItems]);

  const allRankedDebts: RankedItem[] = useMemo(() => {
    const fromPlaid: RankedItem[] = debtAccounts.map((a) => ({ id: a.id, name: a.name, currentBalance: a.currentBalance, apr: a.apr }));
    const fromManual: RankedItem[] = manualDebtItems.map((m) => ({ id: m.id, name: m.name, currentBalance: m.balance, apr: m.apr }));
    return [...fromPlaid, ...fromManual].sort((a, b) => b.currentBalance - a.currentBalance).slice(0, 5);
  }, [debtAccounts, manualDebtItems]);

  const checklistItem = (done: boolean, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 text-left group"
    >
      <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${done ? "bg-emerald-600 border-emerald-600" : "border-gray-300 group-hover:border-slate-400"}`}>
        {done && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </span>
      <span className={`text-xs leading-snug ${done ? "line-through text-slate-400" : "text-slate-600 group-hover:text-slate-900"}`}>{label}</span>
    </button>
  );

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-900">
      <div className="max-w-5xl mx-auto px-5 py-8">

        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold tracking-tight">FinOpt</span>
              <span className="text-lg font-light text-emerald-600 tracking-tight">AI</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">You decide what to spend — we help you see how your money is working.</p>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <button onClick={syncAccounts} disabled={syncing} className="text-sm text-slate-500 hover:text-slate-900 disabled:opacity-50 focus:outline-none">
                {syncing ? "Syncing…" : "Sync"}
              </button>
            )}
            <button onClick={resetDemoData} disabled={resetting} className="text-xs text-slate-400 hover:text-rose-600 disabled:opacity-50 focus:outline-none">
              {resetting ? "Resetting…" : "Reset demo"}
            </button>
          </div>
        </div>

        {error && <div className="rounded-xl bg-rose-50 text-rose-700 px-4 py-3 text-sm mb-5">{error}</div>}

        <div className="flex flex-col lg:flex-row gap-6 items-start lg:justify-center">
          {/* Get started checklist — hidden once all three items are complete */}
          {!(isConnected && manualItems.length > 0 && age !== null) && (
          <div className="w-full lg:w-52 lg:shrink-0 order-first lg:order-last">
            <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 lg:sticky lg:top-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 mb-3">Get started</p>
              <div className="space-y-3">
                {checklistItem(isConnected, ready ? "Connect your accounts" : "Connect your accounts (loading…)", () => { if (ready) open(); })}
                {checklistItem(manualItems.length > 0, "Add off-book assets/debts", () => {
                  setManualExpanded(true);
                  setTimeout(() => manualSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                })}
                {checklistItem(age !== null, "Tell us about yourself", () => {
                  setAssumptionsExpanded(true);
                  setTimeout(() => assumptionsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                })}
              </div>
              {(isConnected && manualItems.length > 0 && age !== null) && (
                <p className="text-[11px] text-emerald-600 font-medium mt-3">All set!</p>
              )}
            </div>
          </div>
          )}{/* end checklist conditional */}

          {/* Main content column */}
          <div className="w-full max-w-2xl min-w-0 space-y-5">

            {usingMockData && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3">
                <span className="text-sm">🔒</span>
                <p className="flex-1 text-xs text-amber-800"><span className="font-semibold">Sample data</span> — this is a preview with realistic numbers. Connect your accounts or add your own to see your real picture.</p>
                <button onClick={() => open()} disabled={!ready} className="shrink-0 rounded-full bg-amber-800 text-white text-xs font-medium px-3 py-1.5 hover:bg-amber-900 disabled:opacity-50 focus:outline-none">
                  {ready ? "Connect" : "…"}
                </button>
              </div>
            )}
          <>
            {/* HERO ring */}
            <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                <div className="relative shrink-0 w-44 h-44">
                  <svg viewBox="0 0 160 160" className="w-44 h-44 -rotate-90">
                    <circle cx="80" cy="80" r="64" fill="none" stroke="#eef0f3" strokeWidth="14" />
                    {ringTotal > 0 && (
                      <>
                        <circle cx="80" cy="80" r="64" fill="none" stroke="#059669" strokeWidth="14" strokeDasharray={`${aLen} ${C}`} />
                        <circle cx="80" cy="80" r="64" fill="none" stroke="#f59e0b" strokeWidth="14" strokeDasharray={`${fLen} ${C}`} strokeDashoffset={`-${aLen}`} />
                        <circle cx="80" cy="80" r="64" fill="none" stroke="#f43f5e" strokeWidth="14" strokeDasharray={`${eLen} ${C}`} strokeDashoffset={`-${aLen + fLen}`} />
                        <circle cx="80" cy="80" r="64" fill="none" stroke="#94a3b8" strokeWidth="14" strokeDasharray={`${uLen} ${C}`} strokeDashoffset={`-${aLen + fLen + eLen}`} />
                      </>
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{centerLabel}</p>
                    <p className="text-[26px] font-bold tracking-tight tabular-nums leading-tight">{money(centerValue)}</p>
                  </div>
                </div>

                <div className="w-full sm:flex-1 min-w-0 space-y-3">
                  {!isConnected && (
                    <div className="flex justify-end">
                      <button onClick={() => open()} disabled={!ready} className="rounded-full bg-slate-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-slate-700 disabled:opacity-50 focus:outline-none whitespace-nowrap">
                        {ready ? "+ Connect accounts" : "Loading…"}
                      </button>
                    </div>
                  )}
                  <div className="flex bg-slate-100 rounded-full p-1">
                    <button onClick={() => setActiveFilter("debts")} className={tabBtn("debts")}>Debts</button>
                    <button onClick={() => setActiveFilter("assets")} className={tabBtn("assets")}>Assets</button>
                    <button onClick={() => setActiveFilter("all")} className={tabBtn("all")}>Net Worth</button>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> Assets</span>
                      <span className="font-medium tabular-nums">{money(assets)}</span>
                    </div>
                    {favorableDebt > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-amber-300 inline-block" /> Favorable debt</span>
                        <span className="font-medium tabular-nums">{money(favorableDebt)}</span>
                      </div>
                    )}
                    {costlyDebt > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Costly debt</span>
                        <span className="font-medium tabular-nums">{money(costlyDebt)}</span>
                      </div>
                    )}
                    {unratedDebt > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" /> Debt (add rate)</span>
                        <span className="font-medium tabular-nums">{money(unratedDebt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-3">
                Green is yours. Amber is low-rate debt that&apos;s smart to keep. Red is debt costing more than the market likely returns.
              </p>

              {(allRankedAssets.length > 0 || allRankedDebts.length > 0) && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setTopAccountsExpanded(!topAccountsExpanded)}
                    className="flex items-center justify-between w-full text-left focus:outline-none"
                  >
                    <span className="text-sm font-semibold">Top accounts</span>
                    <span className="text-xs text-slate-400">{topAccountsExpanded ? "Hide ▲" : "Show ▼"}</span>
                  </button>

                  {topAccountsExpanded && (() => {
                    const orderedDebts = [...allRankedDebts].sort((a, b) => a.currentBalance - b.currentBalance);
                    const allMax = Math.max(
                      ...allRankedAssets.map((a) => a.currentBalance),
                      ...orderedDebts.map((d) => d.currentBalance),
                      1
                    );
                    const MAX_BAR_PCT = 75;

                    const Row = ({ name, amount, color }: { name: string; amount: number; color: string }) => {
                      const pct = Math.max((amount / allMax) * MAX_BAR_PCT, 10);
                      return (
                        <div>
                          <p className="text-xs font-medium text-slate-700 truncate mb-1">{name}</p>
                          <div className="flex items-center gap-2">
                            <div className="h-7 rounded-lg shrink-0" style={{ width: `${pct}%`, backgroundColor: color }} />
                            <span className="text-sm font-semibold text-slate-900 tabular-nums whitespace-nowrap">{money(amount)}</span>
                          </div>
                        </div>
                      );
                    };

                    return (
                      <div className="space-y-3 mt-3">
                        {allRankedAssets.map((a) => (
                          <Row key={a.id} name={a.name} amount={a.currentBalance} color="#3FAE5C" />
                        ))}
                        {orderedDebts.map((d) => {
                          const isFavorable = d.apr != null && d.apr < benchmarkRate;
                          return (
                            <Row key={d.id} name={d.name} amount={d.currentBalance} color={isFavorable ? "#F2C94C" : "#E2574C"} />
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* FINOPT SCORE */}
            {scoreResult && (
              <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">FinOpt Score</p>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-5xl font-bold tracking-tight tabular-nums">{scoreResult.score}</span>
                      <span className="text-slate-400 text-lg">/100</span>
                    </div>
                    <p className="text-sm font-medium mt-0.5">{scoreResult.grade} · <span className="text-slate-500 font-normal">{scoreResult.headline}</span></p>
                  </div>
                  <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
                    <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
                      <circle cx="40" cy="40" r="32" fill="none" stroke="#eef0f3" strokeWidth="8" />
                      <circle cx="40" cy="40" r="32" fill="none" stroke="#059669" strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${(scoreResult.score / 100) * (2 * Math.PI * 32)} ${2 * Math.PI * 32}`} />
                    </svg>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {scoreResult.factors.map((f, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm">
                      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dotColor(f.status)}`} />
                      <span className="flex-1 text-slate-600">{f.detail}</span>
                    </div>
                  ))}
                </div>

                {scoreResult.fastestWin && (
                  <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-sm text-slate-700">
                    <span className="font-semibold text-emerald-700">Fastest win:</span> {scoreResult.fastestWin}
                  </div>
                )}
              </div>
            )}

<CashflowMiniSummary connected={isConnected} />
            {/* THE STAR — reallocation */}
            {householdImpact ? (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-6 space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">The opportunity</p>
                  <p className="text-sm text-slate-700 mt-1.5">
                    You already put <span className="font-semibold">{money(totalExtraAcrossDebts)}/mo</span> toward debt above the minimums. Pointed at the right place, that same money becomes
                  </p>
                  <p className="text-4xl font-bold tracking-tight tabular-nums text-emerald-700 mt-1.5">+{money(householdImpact.gap30)}</p>
                  <p className="text-sm text-slate-600">in net worth by {targetYear} — with no change to your spending.</p>
                </div>

                <div className="rounded-xl bg-white border border-emerald-100 p-4">
                  <p className="text-xs font-semibold text-slate-700 mb-2.5">Where your next dollar goes</p>
                  <ol className="space-y-2">
                    {hasMatch && !isCapturingFullMatch && (
                      <li className="flex items-center gap-3 text-sm">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center shrink-0">1</span>
                        <span className="flex-1">Capture your full employer match</span>
                        <span className="text-xs font-medium text-emerald-700 tabular-nums">~{money(matchGapMonthly)}/mo</span>
                      </li>
                    )}
                    {payoffOrder.map((d, i) => (
                      <li key={d.id} className="flex items-center gap-3 text-sm">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-white text-xs flex items-center justify-center shrink-0">{hasMatch && !isCapturingFullMatch ? i + 2 : i + 1}</span>
                        <span className="flex-1 truncate">{d.name}</span>
                        <span className={`text-xs font-medium tabular-nums ${d.apr >= benchmarkRate ? "text-rose-600" : "text-amber-600"}`}>{d.apr}% {d.apr >= benchmarkRate ? "· pay down" : "· keep, invest instead"}</span>
                      </li>
                    ))}
                    <li className="flex items-center gap-3 text-sm text-emerald-700">
                      <span className="w-5 h-5 rounded-full border border-emerald-300 text-emerald-700 text-xs flex items-center justify-center shrink-0">★</span>
                      <span className="flex-1">Invest the rest in a low-cost S&amp;P 500 index fund <span className="text-slate-400">(e.g. VOO, IVV, or FXAIX)</span></span>
                    </li>
                  </ol>
                </div>

                <button onClick={() => setMathExpanded(!mathExpanded)} className="text-sm font-medium text-emerald-700 hover:text-emerald-800 focus:outline-none">
                  {mathExpanded ? "Hide the math" : "See the 10 / 20 / 30-year math"}
                </button>

                {mathExpanded && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      {([["10 yr", householdImpact.gap10], ["20 yr", householdImpact.gap20], ["30 yr", householdImpact.gap30]] as [string, number][]).map(([label, val]) => (
                        <div key={label} className="rounded-xl bg-white border border-emerald-100 p-3 text-center">
                          <p className="text-[11px] text-slate-400">{label}</p>
                          {isNaN(val) ? <p className="text-xs text-rose-600 mt-1">Check min. payments</p> : <p className="text-base font-semibold text-emerald-700 tabular-nums mt-0.5">+{money(val)}</p>}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500">
                      About <span className="font-medium text-rose-600 tabular-nums">{money(householdImpact.interestSaved30)}</span> of that is interest you never pay; the rest is that money compounding sooner. Estimates use long-run market averages and aren&apos;t guaranteed.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl bg-white border border-gray-200/70 p-6 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Almost there</p>
                <p className="text-sm text-slate-600">Add the rate, minimum payment, and last payment on your debts below, and your reallocation opportunity shows up here.</p>
              </div>
            )}

            {/* Manual assets & debts */}
            <div ref={manualSectionRef} className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <button onClick={() => setManualExpanded(!manualExpanded)} className="w-full flex items-center justify-between px-5 py-4 text-left focus:outline-none">
                <span className="text-sm font-semibold">
                  Other assets &amp; debts
                  <span className="text-slate-400 font-normal"> · {manualItems.length}</span>
                </span>
                <span className="text-xs text-slate-400">{manualExpanded ? "Hide" : "Add or edit"}</span>
              </button>

              {manualExpanded && (
                <div className="px-5 pb-4 border-t border-gray-100 pt-3 space-y-3 text-sm">
                  <p className="text-xs text-slate-500">
                    Add a home, car, or anything else not linked through your bank — including debts like seller
                    financing that don&apos;t show up on a statement.
                  </p>

                  {manualItems.length > 0 && (
                    <div className="space-y-2">
                      {manualItems.map((m) => (
                        <div key={m.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                          <div>
                            <p className="font-medium text-sm">{m.name}</p>
                            <p className="text-xs text-slate-400">
                              {m.kind === "asset" ? "Asset" : "Debt"}
                              {m.apr != null ? ` · ${m.apr}%` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold tabular-nums text-sm">{money(m.balance)}</span>
                            <button onClick={() => removeManualItem(m.id)} className="text-xs text-rose-600 hover:underline">Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setManualKind("asset")}
                        className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium ${manualKind === "asset" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
                      >
                        Asset (home, car, other)
                      </button>
                      <button
                        onClick={() => setManualKind("debt")}
                        className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium ${manualKind === "debt" ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600"}`}
                      >
                        Debt (off-Plaid)
                      </button>
                    </div>

                    <input
                      type="text"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder={manualKind === "asset" ? "e.g. Home, Car, Jewelry" : "e.g. Seller financing on land"}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 w-full text-sm focus:outline-none focus:ring-1 focus:ring-slate-300"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-slate-400 block mb-0.5 text-xs">
                          {manualKind === "asset" ? "Estimated value" : "Balance owed"}
                        </label>
                        <input type="number" value={manualBalance} onChange={(e) => setManualBalance(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 w-full text-sm focus:outline-none" placeholder="0" />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-0.5 text-xs">
                          {manualKind === "asset" ? "Yield % (optional)" : "Interest rate % (optional)"}
                        </label>
                        <input type="number" value={manualApr} onChange={(e) => setManualApr(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 w-full text-sm focus:outline-none" placeholder="—" />
                      </div>
                    </div>

                    {manualKind === "debt" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-slate-400 block mb-0.5 text-xs">Min. payment (optional)</label>
                          <input type="number" value={manualMinPayment} onChange={(e) => setManualMinPayment(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 w-full text-sm focus:outline-none" placeholder="—" />
                        </div>
                        <div>
                          <label className="text-slate-400 block mb-0.5 text-xs">Last payment made (optional)</label>
                          <input type="number" value={manualLastPayment} onChange={(e) => setManualLastPayment(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 w-full text-sm focus:outline-none" placeholder="—" />
                        </div>
                      </div>
                    )}

                    <button onClick={addManualItem} className="w-full rounded-lg bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800">
                      Add {manualKind === "asset" ? "asset" : "debt"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Accounts */}
            <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <button onClick={() => setAccountsExpanded(!accountsExpanded)} className="w-full flex items-center justify-between px-5 py-4 text-left focus:outline-none">
                <span className="text-sm font-semibold">
                  {activeFilter === "debts" ? "Your debts" : activeFilter === "assets" ? "Your assets" : "All accounts"}
                  <span className="text-slate-400 font-normal"> · {displayedAccounts.length}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{accountsExpanded ? "Hide" : "Show"}</span>
                  {(activeFilter === "assets" || activeFilter === "all") && (<Link href="/holdings" onClick={(e) => e.stopPropagation()} className="text-xs text-emerald-700 hover:underline">Holdings</Link>)}
                  <Link href="/transactions" onClick={(e) => e.stopPropagation()} className="text-xs text-emerald-700 hover:underline">Transactions</Link>
                </span>
              </button>

              {accountsExpanded && (
                <div className="px-5 pb-4 space-y-3 border-t border-gray-100 pt-3">
                  {displayedAccounts.map((account) => (
                    <div key={account.id} className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{account.name}</p>
                        <p className="text-xs text-slate-400">{account.type}{account.subtype ? ` · ${account.subtype}` : ""}{account.mask ? ` · ····${account.mask}` : ""}</p>

                        {editingId === account.id ? (
                          <div className="flex items-center gap-1 mt-1.5">
                            <input type="number" step="0.01" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-16 focus:outline-none focus:ring-1 focus:ring-slate-300" autoFocus />
                            <span className="text-xs text-slate-400">%</span>
                            <button onClick={() => saveRate(account.id)} disabled={savingId === account.id} className="text-xs rounded-lg bg-slate-900 text-white px-2 py-1">{savingId === account.id ? "…" : "Save"}</button>
                            <button onClick={cancelEditing} className="text-xs rounded-lg border border-gray-200 px-2 py-1">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {account.apr != null ? (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium text-slate-900" style={{ backgroundColor: getRateColor(account.apr, account.type) }}>
                                {account.type === "depository" || account.type === "investment" ? "Yield" : "APR"} {account.apr}%
                              </span>
                            ) : (<span className="text-[11px] text-slate-400">No rate</span>)}
                            <button onClick={() => startEditing(account)} className="text-[11px] text-emerald-700 hover:underline">{account.apr != null ? "Edit" : "Add rate"}</button>
                          </div>
                        )}

                        {account.apr != null && (account.type === "credit" || account.type === "loan") && (
                          <div className="mt-2 rounded-xl bg-slate-50 p-2.5 text-xs space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Min payment</span>
                              {editingMinPaymentId === account.id ? (
                                <div className="flex items-center gap-1">
                                  <input type="number" step="0.01" value={minPaymentValue} onChange={(e) => setMinPaymentValue(e.target.value)} className="border border-gray-200 rounded px-1 w-16 focus:outline-none" autoFocus />
                                  <button onClick={() => saveMinPayment(account.id)} disabled={savingMinPaymentId === account.id} className="rounded bg-slate-900 text-white px-1.5 py-0.5">{savingMinPaymentId === account.id ? "…" : "Save"}</button>
                                  <button onClick={cancelEditingMinPayment} className="rounded border border-gray-200 px-1.5 py-0.5">✕</button>
                                </div>
                              ) : (
                                <span className="flex items-center gap-1.5">
                                  <span className="font-medium tabular-nums">{account.minimumPayment != null ? money(account.minimumPayment) : "—"}</span>
                                  <button onClick={() => startEditingMinPayment(account)} className="text-emerald-700 hover:underline">{account.minimumPayment != null ? "Edit" : "Add"}</button>
                                </span>
                              )}
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Last payment</span>
                              {editingLastPaymentId === account.id ? (
                                <div className="flex items-center gap-1">
                                  <input type="number" step="0.01" value={lastPaymentValue} onChange={(e) => setLastPaymentValue(e.target.value)} className="border border-gray-200 rounded px-1 w-16 focus:outline-none" autoFocus />
                                  <button onClick={() => saveLastPayment(account.id)} disabled={savingLastPaymentId === account.id} className="rounded bg-slate-900 text-white px-1.5 py-0.5">{savingLastPaymentId === account.id ? "…" : "Save"}</button>
                                  <button onClick={cancelEditingLastPayment} className="rounded border border-gray-200 px-1.5 py-0.5">✕</button>
                                </div>
                              ) : (
                                <span className="flex items-center gap-1.5">
                                  <span className="font-medium tabular-nums">{account.lastPaymentAmount != null ? money(account.lastPaymentAmount) : "—"}</span>
                                  <button onClick={() => startEditingLastPayment(account)} className="text-emerald-700 hover:underline">{account.lastPaymentAmount != null ? "Edit" : "Add"}</button>
                                </span>
                              )}
                            </div>
                            {account.minimumPayment != null && account.lastPaymentAmount != null && (() => {
                              const over = account.lastPaymentAmount > account.minimumPayment;
                              const under = account.lastPaymentAmount < account.minimumPayment;
                              const dwa = debtAccounts.filter((a) => a.apr != null);
                              const highest = dwa.length > 0 ? dwa.reduce((b, c) => (c.apr ?? 0) > (b.apr ?? 0) ? c : b) : null;
                              const isHighest = highest?.id === account.id;
                              let cls = "text-slate-400";
                              if (over) cls = isHighest ? "text-emerald-700" : "text-rose-600";
                              else if (under) cls = isHighest ? "text-rose-600" : "text-slate-400";
                              return (
                                <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                                  <span className="text-slate-400">Above minimum</span>
                                  <span className={`font-semibold tabular-nums ${cls}`}>{over ? `+${money(account.lastPaymentAmount - account.minimumPayment)}` : under ? `−${money(account.minimumPayment - account.lastPaymentAmount)}` : "$0"}</span>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                      <p className="font-semibold text-sm tabular-nums shrink-0">{money(account.currentBalance)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assumptions */}
            <div ref={assumptionsSectionRef} className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <button onClick={() => setAssumptionsExpanded(!assumptionsExpanded)} className="w-full flex items-center justify-between px-5 py-4 text-left focus:outline-none">
                <span className="text-sm font-semibold">About you</span>
                <span className="text-xs text-slate-400">{age != null ? `Age ${age} · ` : ""}{benchmarkRate}% benchmark{hasMatch ? " · match on" : ""} · {assumptionsExpanded ? "Hide" : "Edit"}</span>
              </button>

              {assumptionsExpanded && (
                <div className="px-5 pb-4 space-y-3 border-t border-gray-100 pt-3 text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-slate-500">Your age</span>
                    <input type="number" onChange={(e) => updateAge(e.target.value)} defaultValue={age ?? ""} className="border border-gray-200 rounded-lg px-2 py-1 w-16 focus:outline-none focus:ring-1 focus:ring-slate-300" placeholder="—" />
                    <span className="text-slate-400 text-xs">for peer comparison</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-slate-500">Investment benchmark</span>
                    <input type="number" step="0.1" value={benchmarkRate} onChange={(e) => setBenchmarkRate(parseFloat(e.target.value) || 0)} className="border border-gray-200 rounded-lg px-2 py-1 w-16 focus:outline-none focus:ring-1 focus:ring-slate-300" />
                    <span className="text-slate-400 text-xs">% — historical S&amp;P 500 average</span>
                  </div>
                  <div className="border-t border-gray-100 pt-3 space-y-2.5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={hasMatch} onChange={(e) => setHasMatch(e.target.checked)} className="accent-emerald-600" />
                      <span className="font-medium">I have an employer 401(k) match</span>
                    </label>
                    {hasMatch && (
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div><label className="text-slate-400 block mb-0.5">Annual salary</label><input type="number" value={annualSalary} onChange={(e) => setAnnualSalary(parseFloat(e.target.value) || 0)} className="border border-gray-200 rounded-lg px-2 py-1 w-full focus:outline-none" placeholder="70000" /></div>
                        <div><label className="text-slate-400 block mb-0.5">Match cap %</label><input type="number" value={matchCapPercent} onChange={(e) => setMatchCapPercent(parseFloat(e.target.value) || 0)} className="border border-gray-200 rounded-lg px-2 py-1 w-full focus:outline-none" placeholder="6" /></div>
                        <div><label className="text-slate-400 block mb-0.5">You contribute %</label><input type="number" value={currentContributionPercent} onChange={(e) => setCurrentContributionPercent(parseFloat(e.target.value) || 0)} className="border border-gray-200 rounded-lg px-2 py-1 w-full focus:outline-none" placeholder="3" /></div>
                      </div>
                    )}
                    {hasMatch && !isCapturingFullMatch && matchGapMonthly > 0 && (
                      <p className="text-rose-600 text-xs">You&apos;re leaving ~{money(matchGapMonthly)}/mo in free match on the table — your highest-priority move.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
          </div>{/* end main content */}
        </div>{/* end two-column flex */}
      </div>{/* end max-w-5xl */}
    </main>
  );
}




