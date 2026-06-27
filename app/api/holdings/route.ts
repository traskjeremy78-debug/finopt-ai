import { NextResponse } from "next/server";
import { db } from "../../../src/lib/db";

export async function GET() {
  try {
    const holdings = await db.holding.findMany({
      orderBy: { currentValue: "desc" },
      select: {
        id: true,
        accountId: true,
        tickerSymbol: true,
        securityName: true,
        securityType: true,
        quantity: true,
        costBasis: true,
        currentValue: true,
        yieldPercentage: true,
        rateSource: true,
      },
    });

    return NextResponse.json({ ok: true, holdings });
  } catch (error) {
    console.error("Failed to fetch holdings:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch holdings" },
      { status: 500 }
    );
  }
}