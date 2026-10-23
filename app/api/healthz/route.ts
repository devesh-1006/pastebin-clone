import { NextResponse } from "next/server";
import { getStorageHealthCheck } from "@/lib/paste-store";

export async function GET() {
  try {
    const healthy = await getStorageHealthCheck();
    if (!healthy) {
      return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  }
}
