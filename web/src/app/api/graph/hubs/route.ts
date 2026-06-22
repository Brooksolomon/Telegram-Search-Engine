import { NextResponse } from "next/server";
import { getHubs, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getHubs(20));
  } catch (err) {
    const status = err instanceof ApiError ? 502 : 500;
    return NextResponse.json({ error: "backend unavailable" }, { status });
  }
}
