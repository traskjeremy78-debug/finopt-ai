import { NextResponse } from "next/server";
import { db } from "../../../src/lib/db";

export async function GET() {
  try {
    const users = await db.user.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ ok: true, users });
  } catch (error) {
    console.error("Fetch users failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
