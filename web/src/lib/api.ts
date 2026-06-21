// Server-side client for the FastAPI backend. Used only inside route handlers
// and server components — FASTAPI_URL is never shipped to the browser.

import type { ChannelDetail, ChannelSummary, CategoryOut } from "./types";

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

export { ApiError };
