import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Health check — used before/after deploys (Vercel + pilot) to verify the
 * app AND the database are reachable. Returns 200 only when a tiny DB query
 * succeeds.
 */
export async function GET() {
  try {
    await db.user.count({ take: 1 });
    return NextResponse.json({ status: "ok", db: "ok", time: new Date().toISOString() });
  } catch (e) {
    console.error("[api:error][health]", e);
    return NextResponse.json(
      { status: "degraded", db: "unreachable", time: new Date().toISOString() },
      { status: 503 }
    );
  }
}
