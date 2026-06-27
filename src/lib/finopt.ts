// Pure scoring + peer-comparison logic for the FinOpt Score.

export type ScoreDebt = {
  apr: number;
  balance: number;
  minPayment: number;
  lastPayment: number;
};

export type ScoreInput = {
  debts: ScoreDebt[];
  benchmark: number;
  hasMatch: boolean;
  matchCapPercent: number;
  currentContributionPercent: number;
  netWorth: number;
  assets: number;
  totalDebt: number;
  age: number | null;
};

export type ScoreFactor = {
  label: string;
  status: "good" | "ok" | "improve";
  detail: string;
};

export type ScoreResult = {
  score: number;
  grade: string;
  headline: string;
  factors: ScoreFactor[];
  fastestWin: string | null;
  peerMedian: number | null;
};

const m = (n: number) => `$${Math.round(n).toLocaleString()}`;

const PEER_MEDIANS: { maxAge: number; median: number }[] = [
  { maxAge: 24, median: 10000 },
  { maxAge: 29, median: 16000 },
  { maxAge: 34, median: 35000 },
  { maxAge: 39, median: 55000 },
  { maxAge: 44, median: 90000 },
  { maxAge: 49, median: 130000 },
  { maxAge: 54, median: 170000 },
  { maxAge: 59, median: 210000 },
  { maxAge: 64, median: 270000 },
  { maxAge: 200, median: 280000 },
];

export function peerMedian(age: number): number {
  for (const b of PEER_MEDIANS) if (age <= b.maxAge) return b.median;
  return 280000;
}

export function computeFinOptScore(input: ScoreInput): ScoreResult {
  const { debts, benchmark, hasMatch, matchCapPercent, currentContributionPercent, netWorth, assets, totalDebt, age } = input;

  const factors: ScoreFactor[] = [];

  // 1) Employer match (max 20)
  let matchPts = 0;
  if (!hasMatch) {
    matchPts = 20;
    factors.push({ label: "Employer match", status: "good", detail: "No employer match to capture — nothing left on the table here." });
  } else {
    const frac = matchCapPercent > 0 ? Math.min(1, currentContributionPercent / matchCapPercent) : 1;
    matchPts = Math.round(20 * frac);
    if (frac >= 1) {
      factors.push({ label: "Employer match", status: "good", detail: "You're capturing your full employer match — free money, claimed." });
    } else {
      factors.push({ label: "Employer match", status: "improve", detail: `You're only capturing ${Math.round(frac * 100)}% of your employer match.` });
    }
  }

  // 2) Debt allocation (max 30)
  let allocPts = 0;
  const withBal = debts.filter((d) => d.balance > 0);
  const highest = withBal.length ? withBal.reduce((b, c) => (c.apr > b.apr ? c : b)) : null;
  const totalExtra = debts.reduce((s, d) => s + Math.max(0, d.lastPayment - d.minPayment), 0);
  const underpayingHigh = !!highest && highest.lastPayment > 0 && highest.lastPayment < highest.minPayment;

  if (totalDebt === 0) {
    allocPts = 30;
    factors.push({ label: "Debt allocation", status: "good", detail: "You're debt-free — nothing to reallocate." });
  } else if (totalExtra <= 0) {
    allocPts = 20;
    factors.push({ label: "Debt allocation", status: "ok", detail: "You're paying minimums — fine for cheap debt, but extra on your costliest debt would speed things up." });
  } else {
    let good = 0;
    for (const d of debts) {
      const extra = Math.max(0, d.lastPayment - d.minPayment);
      if (extra <= 0) continue;
      const isHighest = highest === d;
      if (d.apr >= benchmark || isHighest) good += extra;
    }
    const frac = totalExtra > 0 ? good / totalExtra : 0;
    allocPts = Math.round(30 * frac);
    if (frac >= 0.9) factors.push({ label: "Debt allocation", status: "good", detail: "Your extra payments are landing on the right debt." });
    else if (frac >= 0.4) factors.push({ label: "Debt allocation", status: "ok", detail: "Some extra is going to lower-rate debt — shifting it to your costliest debt would help." });
    else factors.push({ label: "Debt allocation", status: "improve", detail: "Your extra payments are mostly on low-rate debt — redirect them to your costliest debt." });
  }
  if (underpayingHigh) {
    allocPts = Math.min(allocPts, 10);
  }

  // 3) Costly-debt burden (max 20)
  let burdenPts = 0;
  const expensive = debts.filter((d) => d.apr >= benchmark).reduce((s, d) => s + Math.max(0, d.balance), 0);
  if (expensive <= 0) {
    burdenPts = 20;
    factors.push({ label: "High-interest debt", status: "good", detail: "No high-interest debt dragging you down." });
  } else {
    const ratio = expensive / (assets + expensive);
    burdenPts = Math.round(20 * (1 - ratio));
    const status = ratio < 0.1 ? "good" : ratio < 0.3 ? "ok" : "improve";
    factors.push({ label: "High-interest debt", status, detail: `${m(expensive)} of high-interest debt to clear.` });
  }

  // 4) Net worth vs peers (max 30)
  let worthPts = 0;
  let pMedian: number | null = null;
  if (age != null && age > 0) {
    const median = peerMedian(age);
    pMedian = median;
    const ratio = median > 0 ? netWorth / median : 0;
    let standing: string;
    if (ratio >= 1.5) { worthPts = 30; standing = "well ahead of"; }
    else if (ratio >= 1) { worthPts = 26; standing = "ahead of"; }
    else if (ratio >= 0.5) { worthPts = 18; standing = "building toward"; }
    else if (ratio >= 0) { worthPts = 12; standing = "behind"; }
    else { worthPts = 6; standing = "behind"; }
    const status = ratio >= 1 ? "good" : ratio >= 0.5 ? "ok" : "improve";
    factors.push({ label: "Net worth vs peers", status, detail: `Typical at your age is about ${m(median)} — you're ${standing} that.` });
  } else {
    if (netWorth > 0) {
      worthPts = 20;
      factors.push({ label: "Net worth", status: "ok", detail: "Add your age to see how you stack up against people your age." });
    } else {
      worthPts = 8;
      factors.push({ label: "Net worth", status: "improve", detail: "Your net worth is negative — the plan above is your path up." });
    }
  }

  const score = Math.max(0, Math.min(100, matchPts + allocPts + burdenPts + worthPts));

  let grade: string;
  let headline: string;
  if (score >= 85) { grade = "Excellent"; headline = "You're running a tight ship."; }
  else if (score >= 70) { grade = "Strong"; headline = "You're in great shape."; }
  else if (score >= 55) { grade = "Good"; headline = "Solid foundation, a few easy wins left."; }
  else if (score >= 40) { grade = "Building"; headline = "You're on your way — let's accelerate."; }
  else { grade = "Getting started"; headline = "Every move from here puts you ahead."; }

  const improve = factors.filter((f) => f.status === "improve");
  const fastestWin = improve.length ? improve[0].detail : null;

  return { score, grade, headline, factors, fastestWin, peerMedian: pMedian };
}