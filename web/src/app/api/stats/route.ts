import { NextResponse } from "next/server";
import { getStats, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getStats();
    return NextResponse.json(data);
  } catch (err) {
    const status = err instanceof ApiError ? 502 : 500;
    return NextResponse.json({ error: "backend unavailable" }, { status });
  }
}
