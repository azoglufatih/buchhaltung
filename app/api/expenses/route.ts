import { NextResponse } from "next/server";
import { readExpenses, writeExpenses } from "@/app/lib/expenses";
import type { ExpensePayload } from "@/app/lib/types";

export async function GET() {
  const payload = await readExpenses();
  return NextResponse.json(payload);
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as ExpensePayload;
    const savedPayload = await writeExpenses(payload);
    return NextResponse.json(savedPayload);
  } catch {
    return NextResponse.json(
      { message: "Die Tabelle konnte nicht gespeichert werden." },
      { status: 400 }
    );
  }
}
