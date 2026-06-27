import { NextResponse } from "next/server";
import { db } from "../../../src/lib/db";

export async function GET() {
  try {
    const accounts = await db.account.findMany();
    const transactions = await db.transaction.findMany({
      orderBy: {
        date: "desc",
      },
      take: 10,
    });

    const totalCash = accounts
      .filter((a) => a.type === "depository")
      .reduce((sum, a) => sum + a.currentBalance, 0);

    const totalDebt = accounts
      .filter((a) => a.type === "credit" || a.type === "loan")
      .reduce((sum, a) => sum + a.currentBalance, 0);

    const totalInvestments = accounts
      .filter((a) => a.type === "investment")
      .reduce((sum, a) => sum + a.currentBalance, 0);

    const netWorth = totalCash + totalInvestments - totalDebt;

    return NextResponse.json({
      ok: true,
      summary: {
        totalCash,
        totalDebt,
        totalInvestments,
        netWorth,
        accountCount: accounts.length,
        recentTransactionCount: transactions.length,
      },
      recentTransactions: transactions.map((t) => ({
        id: t.id,
        date: t.date,
        name: t.name,
        merchantName: t.merchantName,
        amount: t.amount,
        categoryPrimary: t.categoryPrimary,
      })),
    });
  } catch (error) {
    console.error("Failed to load dashboard:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load dashboard",
      },
      { status: 500 }
    );
  }
}
