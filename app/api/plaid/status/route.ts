import { NextResponse } from "next/server";
import { db } from "../../../../src/lib/db";

export async function GET() {
  try {
    const plaidItem = await db.plaidItem.findFirst({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      ok: true,
      connected: !!plaidItem,
      institutionName: plaidItem?.institutionName ?? null,
      lastSyncedAt: plaidItem?.lastSyncedAt ?? null,
    });
  } catch (error) {
    console.error("Failed to check Plaid status:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to check Plaid status" },
      { status: 500 }
    );
  }
}