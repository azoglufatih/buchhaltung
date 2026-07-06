import { NextResponse } from "next/server";
import { clearActivityLog, readActivityLog } from "@/app/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await readActivityLog();
  return NextResponse.json(
    { entries },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function DELETE() {
  await clearActivityLog();
  return NextResponse.json({ entries: [] });
}
