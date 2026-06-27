import { NextResponse } from "next/server";
import { db } from "../../../src/lib/db";

export async function GET() {
  try {
    const accounts = await db.account.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        officialName: true,
        type: true,
        subtype: true,
        currentBalance: true,
        availableBalance: true,
        currency: true,
        mask: true,
        apr: true,
        rateSource: true,
        minimumPayment: true,
        lastPaymentAmount: true,
        plaidAccountId: true,
      },
    });

    return NextResponse.json({ ok: true, accounts });
  } catch (error) {
    console.error("Failed to fetch accounts:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}

