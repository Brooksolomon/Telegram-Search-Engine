"""Deep per-channel analytics computed live from already-collected data
(messages + edges + graph metrics). No LLM, no new crawling."""
from __future__ import annotations

from typing import Any

from app.db.database import get_conn


def channel_analytics(channel_id: int) -> dict[str, Any]:
    with get_conn() as conn:
        # --- cadence + content mix from messages ---
        agg = conn.execute(
            """
            SELECT
                COUNT(*)                                   AS total,
                COUNT(*) FILTER (WHERE has_image)          AS with_image,
                COUNT(*) FILTER (WHERE has_link)           AS with_link,
                AVG(length(coalesce(text, '')))            AS avg_len,
                MIN(posted_at)                             AS first_post,
                MAX(posted_at)                             AS last_post
            FROM messages
            WHERE channel_id = %s
            """,
            (channel_id,),
        ).fetchone()

        total = agg["total"] or 0

        # posts per week over the observed span
        posts_per_week = None
        if agg["first_post"] and agg["last_post"] and total > 1:
            span_days = (agg["last_post"] - agg["first_post"]).total_seconds() / 86400.0
            weeks = max(span_days / 7.0, 0.1)
            posts_per_week = round(total / weeks, 1)

        # most active weekday + hour (0=Sunday)
        dow = conn.execute(
            """
            SELECT EXTRACT(DOW FROM posted_at)::int AS dow, COUNT(*) AS n
            FROM messages WHERE channel_id = %s AND posted_at IS NOT NULL
            GROUP BY dow ORDER BY n DESC LIMIT 1
            """,
            (channel_id,),
        ).fetchone()
        hour = conn.execute(
            """
            SELECT EXTRACT(HOUR FROM posted_at)::int AS hour, COUNT(*) AS n
            FROM messages WHERE channel_id = %s AND posted_at IS NOT NULL
            GROUP BY hour ORDER BY n DESC LIMIT 1
            """,
            (channel_id,),
        ).fetchone()

        # weekly activity timeline (last 12 weeks)
        timeline = conn.execute(
            """
            SELECT to_char(date_trunc('week', posted_at), 'YYYY-MM-DD') AS week,
                   COUNT(*) AS n
            FROM messages
            WHERE channel_id = %s AND posted_at IS NOT NULL
              AND posted_at > now() - interval '12 weeks'
            GROUP BY week ORDER BY week
            """,
            (channel_id,),
        ).fetchall()

        # --- graph position ---
        g = conn.execute(
            "SELECT in_degree, out_degree, pagerank, betweenness, cluster_id "
            "FROM channel_graph WHERE channel_id = %s",
            (channel_id,),
        ).fetchone()

        pagerank_rank = None
        if g and g["pagerank"]:
            rank = conn.execute(
                "SELECT COUNT(*) + 1 AS r FROM channel_graph WHERE pagerank > %s",
                (g["pagerank"],),
            ).fetchone()
            pagerank_rank = rank["r"]

        # top channels THIS channel references (outbound)
        references = conn.execute(
            """
            SELECT e.target_username, e.target_id, SUM(e.weight) AS weight,
                   c.title AS target_title
            FROM channel_edges e
            LEFT JOIN channels c ON c.id = e.target_id
            WHERE e.source_id = %s
            GROUP BY e.target_username, e.target_id, c.title
            ORDER BY weight DESC LIMIT 8
            """,
            (channel_id,),
        ).fetchall()

        # top channels that reference THIS channel (inbound)
        referenced_by = conn.execute(
            """
            SELECT c.id AS source_id, c.title AS source_title, c.username,
                   SUM(e.weight) AS weight
            FROM channel_edges e
            JOIN channels c ON c.id = e.source_id
            WHERE e.target_id = %s
            GROUP BY c.id, c.title, c.username
            ORDER BY weight DESC LIMIT 8
            """,
            (channel_id,),
        ).fetchall()

    return {
        "total_messages": total,
        "image_pct": round(100 * (agg["with_image"] or 0) / total, 0) if total else 0,
        "link_pct": round(100 * (agg["with_link"] or 0) / total, 0) if total else 0,
        "avg_length": round(agg["avg_len"] or 0),
        "posts_per_week": posts_per_week,
        "first_post": agg["first_post"],
        "last_post": agg["last_post"],
        "top_weekday": dow["dow"] if dow else None,
        "top_hour": hour["hour"] if hour else None,
        "timeline": [{"week": t["week"], "count": t["n"]} for t in timeline],
        "in_degree": g["in_degree"] if g else 0,
        "out_degree": g["out_degree"] if g else 0,
        "pagerank_rank": pagerank_rank,
        "cluster_id": g["cluster_id"] if g else None,
        "references": [
            {
                "username": r["target_username"],
                "channel_id": r["target_id"],
                "title": r["target_title"],
                "weight": int(r["weight"]),
            }
            for r in references
        ],
        "referenced_by": [
            {
                "channel_id": r["source_id"],
                "title": r["source_title"],
                "username": r["username"],
                "weight": int(r["weight"]),
            }
            for r in referenced_by
        ],
    }
