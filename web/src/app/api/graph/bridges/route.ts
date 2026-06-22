import { NextResponse } from "next/server";
import { getBridges, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getBridges(20));
  } catch (err) {
    const status = err instanceof ApiError ? 502 : 500;
    return NextResponse.json({ error: "backend unavailable" }, { status });
  }
}
