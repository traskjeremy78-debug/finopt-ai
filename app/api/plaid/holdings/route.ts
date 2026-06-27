import { NextResponse } from "next/server";
import { db } from "../../../../src/lib/db";
import { plaidClient } from "../../../../src/lib/plaid";

export async function GET() {
  try {
    const plaidItem = await db.plaidItem.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (!plaidItem) {
      return NextResponse.json(
        { ok: false, error: "No Plaid item found" },
        { status: 404 }
      );
    }

    const response = await plaidClient.investmentsHoldingsGet({
      access_token: plaidItem.accessTokenEncrypted,
    });

    console.log("HOLDINGS RAW:", JSON.stringify(response.data, null, 2));

    const securitiesById = new Map(
      response.data.securities.map((s) => [s.security_id, s])
    );

    let savedCount = 0;

    for (const holding of response.data.holdings) {
      const account = await db.account.findUnique({
        where: { plaidAccountId: holding.account_id },
      });

      if (!account) continue;

      const security = securitiesById.get(holding.security_id);

      await db.holding.upsert({
        where: {
          plaidSecurityId_accountId: {
            plaidSecurityId: holding.security_id,
            accountId: account.id,
          },
        },
        update: {
          tickerSymbol: security?.ticker_symbol ?? null,
          securityName: security?.name ?? null,
          securityType: security?.type ?? null,
          quantity: holding.quantity,
          costBasis: holding.cost_basis ?? null,
          currentValue: holding.institution_value,
        },
        create: {
          userId: account.userId,
          accountId: account.id,
          plaidSecurityId: holding.security_id,
          tickerSymbol: security?.ticker_symbol ?? null,
          securityName: security?.name ?? null,
          securityType: security?.type ?? null,
          quantity: holding.quantity,
          costBasis: holding.cost_basis ?? null,
          currentValue: holding.institution_value,
        },
      });

      savedCount++;
    }

    return NextResponse.json({ ok: true, savedCount });
  } catch (error) {
    console.error("Failed to fetch/store holdings:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to fetch/store holdings",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}