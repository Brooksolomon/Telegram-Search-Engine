import { NextRequest, NextResponse } from "next/server";
import { searchChannels, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 20);
  if (!q) {
    return NextResponse.json({ error: "missing query" }, { status: 400 });
  }
  try {
    const data = await searchChannels(q, Number.isFinite(limit) ? limit : 20);
    return NextResponse.json(data);
  } catch (err) {
    const status = err instanceof ApiError ? 502 : 500;
    return NextResponse.json({ error: "backend unavailable" }, { status });
  }
}
