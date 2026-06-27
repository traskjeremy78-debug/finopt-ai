import { NextResponse } from "next/server";
import { db } from "../../../src/lib/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "connected" });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json(
      { ok: false, database: "disconnected" },
      { status: 500 }
    );
  }
}
