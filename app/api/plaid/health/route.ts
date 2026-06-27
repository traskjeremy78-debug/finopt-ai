import { NextResponse } from "next/server";

export async function GET() {
  const hasClientId = !!process.env.PLAID_CLIENT_ID;
  const hasSecret = !!process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV || "missing";

  return NextResponse.json({
    ok: true,
    plaid: {
      hasClientId,
      hasSecret,
      env,
    },
  });
}
