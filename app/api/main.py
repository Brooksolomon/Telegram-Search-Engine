"""FastAPI app exposing search / channel / categories.

Run:
    uvicorn app.api.main:app --reload --port 8000
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query

from app.api.schemas import (
    CategoryOut,
    ChannelDetail,
    ChannelSummary,
    ClusterOut,
    GraphOut,
    HubOut,
    MessageOut,
    StatsOut,
)
from app.db import repository as repo

app = FastAPI(title="Telegram Discovery Engine", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/search", response_model=list[ChannelSummary])
def search(
    q: str = Query(..., min_length=1, description="e.g. 'phones ethiopia'"),
    limit: int = Query(20, ge=1, le=100),
) -> list[ChannelSummary]:
    rows = repo.search_channels(q, limit=limit)
    return [ChannelSummary(**r) for r in rows]


@app.get("/channel/{channel_id}", response_model=ChannelDetail)
def channel(channel_id: int) -> ChannelDetail:
    row = repo.get_channel(channel_id)
    if not row:
        raise HTTPException(status_code=404, detail="channel not found")
    msgs = repo.get_channel_messages(channel_id, limit=20)
    detail = ChannelDetail(**row)
    detail.sample_messages = [
        MessageOut(**m, channel_username=row.get("username")) for m in msgs
    ]
    return detail


@app.get("/categories", response_model=list[CategoryOut])
def categories() -> list[CategoryOut]:
    return [CategoryOut(**r) for r in repo.list_categories()]


@app.get("/stats", response_model=StatsOut)
def stats() -> StatsOut:
    return StatsOut(**repo.get_stats())


@app.get("/graph", response_model=GraphOut)
def graph(
    limit: int = Query(250, ge=1, le=1000),
    cluster_id: int | None = Query(None),
) -> GraphOut:
    data = repo.graph_nodes_edges(limit=limit, cluster_id=cluster_id)
    return GraphOut(**data)


@app.get("/graph/hubs", response_model=list[HubOut])
def graph_hubs(limit: int = Query(20, ge=1, le=100)) -> list[HubOut]:
    return [HubOut(**r) for r in repo.graph_hubs(limit=limit)]


@app.get("/graph/bridges", response_model=list[HubOut])
def graph_bridges(limit: int = Query(20, ge=1, le=100)) -> list[HubOut]:
    return [HubOut(**r) for r in repo.graph_bridges(limit=limit)]


@app.get("/graph/clusters", response_model=list[ClusterOut])
def graph_clusters() -> list[ClusterOut]:
    return [ClusterOut(**r) for r in repo.graph_clusters()]
