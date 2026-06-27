import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { plaidClient } from "../../../../src/lib/plaid";

export async function POST() {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: "test-user-1",
      },
      client_name: "FinOpt AI",
      products: [Products.Transactions, Products.Liabilities, Products.Investments],
      country_codes: [CountryCode.Us],
      language: "en",
    });

    return NextResponse.json({
      ok: true,
      link_token: response.data.link_token,
    });
  } catch (error) {
    console.error("Failed to create Plaid link token:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to create link token",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}


