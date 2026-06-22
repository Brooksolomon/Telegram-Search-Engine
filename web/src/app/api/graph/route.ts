import { NextRequest, NextResponse } from "next/server";
import { getGraph, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 250);
  const clusterParam = req.nextUrl.searchParams.get("cluster_id");
  const clusterId = clusterParam != null ? Number(clusterParam) : undefined;
  try {
    const data = await getGraph(Number.isFinite(limit) ? limit : 250, clusterId);
    return NextResponse.json(data);
  } catch (err) {
    const status = err instanceof ApiError ? 502 : 500;
    return NextResponse.json({ error: "backend unavailable" }, { status });
  }
}
