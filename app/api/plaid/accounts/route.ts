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

    const accountsResponse = await plaidClient.accountsGet({
      access_token: plaidItem.accessTokenEncrypted,
    });

    const aprByAccountId = new Map<string, number>();
    const minPaymentByAccountId = new Map<string, number>();
    const lastPaymentByAccountId = new Map<string, number>();

    try {
      const liabilitiesResponse = await plaidClient.liabilitiesGet({
        access_token: plaidItem.accessTokenEncrypted,
      });

      const liabilities = liabilitiesResponse.data.liabilities;

      liabilities.credit?.forEach((card) => {
        if (!card.account_id) return;

        if (card.aprs && card.aprs.length > 0) {
          const purchaseEntry = card.aprs.find(
            (a) => a.apr_type === "purchase_apr" && a.apr_percentage != null
          );
          const bestApr =
            purchaseEntry?.apr_percentage ??
            card.aprs.find((a) => a.apr_percentage != null)?.apr_percentage;
          if (bestApr != null) {
            aprByAccountId.set(card.account_id, bestApr);
          }
        }

        if (card.minimum_payment_amount != null) {
          minPaymentByAccountId.set(card.account_id, card.minimum_payment_amount);
        }

        if (card.last_payment_amount != null) {
          lastPaymentByAccountId.set(card.account_id, card.last_payment_amount);
        }
      });

      liabilities.mortgage?.forEach((m) => {
        if (!m.account_id) return;
        if (m.interest_rate?.percentage != null) {
          aprByAccountId.set(m.account_id, m.interest_rate.percentage);
        }
        if (m.next_monthly_payment != null) {
          minPaymentByAccountId.set(m.account_id, m.next_monthly_payment);
        }
        if (m.last_payment_amount != null) {
          lastPaymentByAccountId.set(m.account_id, m.last_payment_amount);
        }
      });

      liabilities.student?.forEach((s) => {
        if (!s.account_id) return;
        if (s.interest_rate_percentage != null) {
          aprByAccountId.set(s.account_id, s.interest_rate_percentage);
        }
        if (s.minimum_payment_amount != null) {
          minPaymentByAccountId.set(s.account_id, s.minimum_payment_amount);
        }
        if (s.last_payment_amount != null) {
          lastPaymentByAccountId.set(s.account_id, s.last_payment_amount);
        }
      });
    } catch (liabilityError) {
      console.warn("Liabilities fetch skipped/failed:", liabilityError);
    }

    for (const account of accountsResponse.data.accounts) {
      const apr = aprByAccountId.get(account.account_id) ?? null;
      const minimumPayment = minPaymentByAccountId.get(account.account_id) ?? null;
      const lastPaymentAmount = lastPaymentByAccountId.get(account.account_id) ?? null;

      const existing = await db.account.findUnique({
        where: { plaidAccountId: account.account_id },
        select: { rateSource: true },
      });
      const userEdited = existing?.rateSource === "user";

      await db.account.upsert({
        where: { plaidAccountId: account.account_id },
        update: {
          name: account.name,
          officialName: account.official_name ?? null,
          type: account.type,
          subtype: account.subtype ?? null,
          currentBalance: account.balances.current ?? 0,
          availableBalance: account.balances.available ?? null,
          currency: account.balances.iso_currency_code ?? "USD",
          mask: account.mask ?? null,
          ...(userEdited ? {} : { apr, minimumPayment, lastPaymentAmount }),
          lastUpdatedAt: new Date(),
        },
        create: {
          userId: plaidItem.userId,
          plaidItemId: plaidItem.id,
          plaidAccountId: account.account_id,
          name: account.name,
          officialName: account.official_name ?? null,
          type: account.type,
          subtype: account.subtype ?? null,
          currentBalance: account.balances.current ?? 0,
          availableBalance: account.balances.available ?? null,
          currency: account.balances.iso_currency_code ?? "USD",
          mask: account.mask ?? null,
          apr: apr,
          minimumPayment: minimumPayment,
          lastPaymentAmount: lastPaymentAmount,
          isLiability: false,
          lastUpdatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      count: accountsResponse.data.accounts.length,
      withApr: aprByAccountId.size,
      withMinimumPayment: minPaymentByAccountId.size,
      withLastPayment: lastPaymentByAccountId.size,
    });
  } catch (error) {
    console.error("Failed to fetch/store accounts:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to fetch/store accounts",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
