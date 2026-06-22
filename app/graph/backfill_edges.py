"""Rebuild the edge graph from messages ALREADY stored in the database.

No Telegram access needed — this reads the `messages` table and extracts
t.me links and @mention edges from the stored text. (Forward edges aren't
recoverable here since the forwarded-from handle isn't stored on the message;
those are captured on future crawls.)

    python -m app.graph.backfill_edges
"""
from __future__ import annotations

import logging

from app.db.database import close_pool, get_conn
from app.db import repository as repo
from app.ingestion.references import count_references

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("graph.backfill")


def backfill() -> None:
    with get_conn() as conn:
        channels = conn.execute(
            "SELECT id, username FROM channels ORDER BY id"
        ).fetchall()

    log.info("backfilling edges from stored messages for %d channels", len(channels))
    total_edges = 0
    for ch in channels:
        with get_conn() as conn:
            msgs = conn.execute(
                "SELECT text FROM messages WHERE channel_id = %s", (ch["id"],)
            ).fetchall()
        if not msgs:
            continue
        # count_references expects dicts with a 'text' key (no forward data here).
        edge_counts = count_references(
            [{"text": m["text"]} for m in msgs], self_username=ch["username"]
        )
        if edge_counts:
            repo.upsert_edges(ch["id"], edge_counts)
            total_edges += len(edge_counts)
            log.info("  %s: %d edges", ch["username"] or ch["id"], len(edge_counts))

    resolved = repo.backfill_edge_targets()
    log.info("done — %d edges written, %d resolved to known channels",
             total_edges, resolved)


def main() -> None:
    try:
        backfill()
    finally:
        close_pool()


if __name__ == "__main__":
    main()
