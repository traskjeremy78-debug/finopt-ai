import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../src/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const dataToUpdate: {
      apr?: number;
      rateSource?: string;
      minimumPayment?: number;
      lastPaymentAmount?: number;
    } = {};

    if (body.apr !== undefined) {
      const rate = body.apr;
      if (typeof rate !== "number" || isNaN(rate) || rate < 0 || rate > 100) {
        return NextResponse.json(
          { ok: false, error: "APR must be a number between 0 and 100" },
          { status: 400 }
        );
      }
      dataToUpdate.apr = rate;
    }

    if (body.minimumPayment !== undefined) {
      const minPayment = body.minimumPayment;
      if (typeof minPayment !== "number" || isNaN(minPayment) || minPayment < 0) {
        return NextResponse.json(
          { ok: false, error: "Minimum payment must be a positive number" },
          { status: 400 }
        );
      }
      dataToUpdate.minimumPayment = minPayment;
    }

    if (body.lastPaymentAmount !== undefined) {
      const lastPayment = body.lastPaymentAmount;
      if (typeof lastPayment !== "number" || isNaN(lastPayment) || lastPayment < 0) {
        return NextResponse.json(
          { ok: false, error: "Last payment amount must be a positive number" },
          { status: 400 }
        );
      }
      dataToUpdate.lastPaymentAmount = lastPayment;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid fields provided" },
        { status: 400 }
      );
    }

    // Mark as user-edited whenever any financial field is manually set
    dataToUpdate.rateSource = "user";

    const account = await db.account.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json({ ok: true, account });
  } catch (error) {
    console.error("Failed to update account:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update account" },
      { status: 500 }
    );
  }
}