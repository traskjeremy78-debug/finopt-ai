import { NextResponse } from "next/server";
import { db } from "../../../src/lib/db";

export async function GET() {
  try {
    const user = await db.user.create({
      data: {
        email: "test@example.com",
      },
    });

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error("Create test user failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create test user" },
      { status: 500 }
    );
  }
}
