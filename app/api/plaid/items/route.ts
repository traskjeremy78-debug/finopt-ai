import { NextResponse } from "next/server";
import { db } from "../../../../src/lib/db";

export async function GET() {
  try {
    const items = await db.plaidItem.findMany({
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        plaidItemId: true,
        institutionName: true,
        lastSyncedAt: true,
        createdAt: true,
        userId: true,
      },
    });

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error("Failed to fetch Plaid items:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to fetch Plaid items",
      },
      { status: 500 }
    );
  }
}
