import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "../../../../src/lib/plaid";
import { db } from "../../../../src/lib/db";

export async function POST(req: NextRequest) {
  try {
const body = await req.json();
const publicToken = body.public_token;

    if (!publicToken) {
      return NextResponse.json(
        { ok: false, error: "Missing public_token" },
        { status: 400 }
      );
    }

    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;

    const user = await db.user.upsert({
      where: {
        email: "test@example.com",
      },
      update: {},
      create: {
        email: "test@example.com",
      },
    });

    const plaidItem = await db.plaidItem.upsert({
      where: {
        plaidItemId: itemId,
      },
      update: {
        accessTokenEncrypted: accessToken,
        lastSyncedAt: new Date(),
      },
      create: {
        userId: user.id,
        plaidItemId: itemId,
        accessTokenEncrypted: accessToken,
        institutionName: "Plaid Sandbox",
        lastSyncedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      item_id: itemId,
      plaid_item_id: plaidItem.id,
    });
  } catch (error) {
    console.error("Failed to exchange public token:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to exchange public token",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

