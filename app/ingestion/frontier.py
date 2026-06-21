"""Frontier queue repository for link-graph crawling."""
from __future__ import annotations

from typing import Any

from app.db.database import get_conn


def enqueue(
    username: str,
    *,
    depth: int,
    source: str,
    discovered_from: int | None,
) -> None:
    """Add a candidate channel to the frontier (no-op if already present).

    We also skip candidates that are already known channels, so the frontier
    only holds genuinely new leads."""
    with get_conn() as conn:
        # Skip if we already have this channel indexed.
        existing = conn.execute(
            "SELECT 1 FROM channels WHERE lower(username) = %s", (username,)
        ).fetchone()
        if existing:
            return
        conn.execute(
            """
            INSERT INTO channel_frontier (username, depth, source, discovered_from)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (username) DO NOTHING
            """,
            (username, depth, source, discovered_from),
        )


def enqueue_many(refs, *, depth: int, discovered_from: int | None) -> int:
    """Enqueue a set of Reference objects at the given depth. Returns count
    attempted (dedup handled by enqueue)."""
    n = 0
    for r in refs:
        enqueue(
            r.username, depth=depth, source=r.source, discovered_from=discovered_from
        )
        n += 1
    return n


def fetch_pending(max_depth: int, limit: int) -> list[dict[str, Any]]:
    """Get pending candidates within the depth cap, shallowest first."""
    with get_conn() as conn:
        return conn.execute(
            """
            SELECT id, username, tg_id, depth
            FROM channel_frontier
            WHERE status = 'pending' AND depth <= %s
            ORDER BY depth ASC, enqueued_at ASC
            LIMIT %s
            """,
            (max_depth, limit),
        ).fetchall()


def mark(frontier_id: int, status: str) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE channel_frontier
            SET status = %s, processed_at = now()
            WHERE id = %s
            """,
            (status, frontier_id),
        )


def stats() -> dict[str, int]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT status, COUNT(*) AS n FROM channel_frontier GROUP BY status"
        ).fetchall()
    return {r["status"]: r["n"] for r in rows}
