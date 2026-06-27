"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Holding = {
  id: string;
  accountId: string;
  tickerSymbol: string | null;
  securityName: string | null;
  securityType: string | null;
  quantity: number;
  costBasis: number | null;
  currentValue: number;
  yieldPercentage: number | null;
  rateSource: string | null;
};

export default function HoldingsPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadHoldings() {
      try {
        const res = await fetch("/api/holdings");
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Failed to load holdings");
        }
        setHoldings(data.holdings);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    }
    loadHoldings();
  }, []);

  return (
    <main className="min-h-screen bg-white text-black p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Holdings</h1>
          <Link href="/" className="rounded-lg border px-4 py-2 hover:bg-gray-50">
            Back to dashboard
          </Link>
        </div>

        {error && (
          <div className="rounded-md bg-red-100 text-red-800 p-3">Error: {error}</div>
        )}

        <div className="rounded-lg border p-4">
          <div className="space-y-3">
            {holdings.map((holding) => (
              <div key={holding.id} className="flex items-center justify-between border-b pb-3">
                <div>
                  <p className="font-medium">
                    {holding.tickerSymbol || holding.securityName || "Unknown security"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {holding.securityName && holding.tickerSymbol ? holding.securityName : ""}
                    {holding.securityType ? ` - ${holding.securityType}` : ""}
                  </p>
                  <p className="text-sm text-gray-400">
                    {holding.quantity} shares
                    {holding.costBasis != null && ` · cost basis $${holding.costBasis.toLocaleString()}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">${holding.currentValue.toLocaleString()}</p>
                  {holding.yieldPercentage != null && (
                    <p className="text-sm text-gray-500">Yield: {holding.yieldPercentage}%</p>
                  )}
                </div>
              </div>
            ))}

            {holdings.length === 0 && (
              <p className="text-gray-500">No holdings found.</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}