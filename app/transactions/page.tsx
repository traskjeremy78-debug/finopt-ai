"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Transaction = {
  id: string;
  date: string;
  amount: number;
  merchantName: string | null;
  name: string;
  categoryPrimary: string | null;
  categoryDetailed: string | null;
  pending: boolean;
  plaidTransactionId: string;
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTransactions() {
      try {
        const res = await fetch("/api/transactions");
        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Failed to load transactions");
        }

        setTransactions(data.transactions);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    }

    loadTransactions();
  }, []);

  return (
    <main className="min-h-screen bg-white text-black p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">All Transactions</h1>
          <Link href="/" className="rounded-lg border px-4 py-2 hover:bg-gray-50">
            Back to dashboard
          </Link>
        </div>

        {error && (
          <div className="rounded-md bg-red-100 text-red-800 p-3">
            Error: {error}
          </div>
        )}

        <div className="rounded-lg border p-4">
          <div className="space-y-3">
            {transactions.map((txn) => (
              <div
                key={txn.id}
                className="flex items-center justify-between border-b pb-3"
              >
                <div>
                  <p className="font-medium">{txn.merchantName || txn.name}</p>
                  <p className="text-sm text-gray-500">
                    {txn.categoryPrimary || "Uncategorized"}
                    {txn.categoryDetailed ? ` - ${txn.categoryDetailed}` : ""}
                  </p>
                  <p className="text-sm text-gray-400">{txn.date}</p>
                </div>

                <div className="text-right">
                  <p className="font-semibold">
                    ${txn.amount.toLocaleString()}
                  </p>
                  {txn.pending && (
                    <p className="text-sm text-orange-600">Pending</p>
                  )}
                </div>
              </div>
            ))}

            {transactions.length === 0 && (
              <p className="text-gray-500">No transactions found.</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}