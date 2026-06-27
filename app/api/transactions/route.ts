import { NextResponse } from "next/server";
import { db } from "../../../src/lib/db";

export async function GET() {
  try {
    const since = new Date();
    since.setMonth(since.getMonth() - 12);

    const txns = await db.transaction.findMany({
      where: { date: { gte: since } },
      orderBy: { date: "desc" },
      include: { account: { select: { name: true, type: true, mask: true } } },
      take: 3000,
    });

    const transactions = txns.map((t) => ({
      id: t.id,
      date: t.date.toISOString().slice(0, 10),
      amount: t.amount,
      merchantName: t.merchantName,
      name: t.name,
      pfcPrimary: t.pfcPrimary,
      pfcDetailed: t.pfcDetailed,
      categoryPrimary: t.categoryPrimary,
      paymentChannel: t.paymentChannel,
      logoUrl: t.logoUrl,
      pending: t.pending,
      accountName: t.account?.name ?? null,
      accountType: t.account?.type ?? null,
      accountMask: t.account?.mask ?? null,
    }));

    return NextResponse.json({ ok: true, transactions });
  } catch (error) {
    console.error("Failed to load transactions:", error);
    return NextResponse.json({ ok: false, error: "Failed to load transactions" }, { status: 500 });
  }
}