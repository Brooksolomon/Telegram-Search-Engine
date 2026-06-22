// Server-side client for the FastAPI backend. Used only inside route handlers
// and server components — FASTAPI_URL is never shipped to the browser.

import type {
  ChannelDetail,
  ChannelSummary,
  CategoryOut,
  StatsOut,
  GraphOut,
  HubOut,
  ClusterOut,
} from "./types";

const BASE = process.env.FASTAPI_URL ?? "http://localhost:8000";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `backend ${res.status} for ${path}`);
  }
  return (await res.json()) as T;
}

export function searchChannels(q: string, limit = 20): Promise<ChannelSummary[]> {
  const qs = new URLSearchParams({ q, limit: String(limit) });
  return get<ChannelSummary[]>(`/search?${qs.toString()}`);
}

export function getChannel(id: number): Promise<ChannelDetail> {
  return get<ChannelDetail>(`/channel/${id}`);
}

export function listCategories(): Promise<CategoryOut[]> {
  return get<CategoryOut[]>(`/categories`);
}

export function getStats(): Promise<StatsOut> {
  return get<StatsOut>(`/stats`);
}

export function getGraph(limit = 250, clusterId?: number): Promise<GraphOut> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (clusterId != null) qs.set("cluster_id", String(clusterId));
  return get<GraphOut>(`/graph?${qs.toString()}`);
}

export function getHubs(limit = 20): Promise<HubOut[]> {
  return get<HubOut[]>(`/graph/hubs?limit=${limit}`);
}

export function getBridges(limit = 20): Promise<HubOut[]> {
  return get<HubOut[]>(`/graph/bridges?limit=${limit}`);
}

export function getClusters(): Promise<ClusterOut[]> {
  return get<ClusterOut[]>(`/graph/clusters`);
}

export { ApiError };
