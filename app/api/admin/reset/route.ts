import { NextResponse } from "next/server";
import { db } from "../../../../src/lib/db";

export async function POST() {
  try {
    // Deleting PlaidItems cascades to Accounts, which cascades to
    // Transactions, Holdings, and Liabilities tied to them.
    await db.plaidItem.deleteMany({});

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to reset demo data:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to reset demo data" },
      { status: 500 }
    );
  }
}