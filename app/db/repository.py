"""All SQL lives here so worker / analysis / API share one source of truth."""
from __future__ import annotations

import logging
from typing import Any

from app.db.database import get_conn
from app.search import meili

log = logging.getLogger("repository")


# ---------------------------------------------------------------- channels ---
def upsert_channel(
    *,
    tg_id: int | None,
    username: str | None,
    title: str,
    member_count: int | None,
    discovered_by_keyword: str | None,
) -> int:
    """Insert or update a channel deduped by tg_id (or username). Returns id."""
    with get_conn() as conn:
        row = conn.execute(
            """
            INSERT INTO channels (tg_id, username, title, member_count, discovered_by_keyword)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (tg_id) DO UPDATE SET
                username = COALESCE(EXCLUDED.username, channels.username),
                title = EXCLUDED.title,
                member_count = COALESCE(EXCLUDED.member_count, channels.member_count)
            RETURNING id
            """,
            (tg_id, username, title, member_count, discovered_by_keyword),
        ).fetchone()
        return row["id"]


def mark_channel_crawled(channel_id: int) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE channels SET last_crawled_at = now() WHERE id = %s",
            (channel_id,),
        )


def channels_needing_analysis(limit: int = 50) -> list[dict[str, Any]]:
    """Channels with messages but no (or stale) analysis."""
    with get_conn() as conn:
        return conn.execute(
            """
            SELECT c.id, c.title, c.username, c.member_count
            FROM channels c
            WHERE EXISTS (SELECT 1 FROM messages m WHERE m.channel_id = c.id)
              AND (
                NOT EXISTS (SELECT 1 FROM channel_analysis a WHERE a.channel_id = c.id)
                OR (SELECT analyzed_at FROM channel_analysis a WHERE a.channel_id = c.id)
                     < c.last_crawled_at
              )
            ORDER BY c.last_crawled_at DESC NULLS LAST
            LIMIT %s
            """,
            (limit,),
        ).fetchall()


# ------------------------------------------------------------------- edges ---
def upsert_edges(
    source_id: int, edges: dict[tuple[str, str], int]
) -> int:
    """Record directed reference edges from source_id. `edges` maps
    (target_username, edge_type) -> weight. Accumulates weight on repeat crawls,
    and resolves target_id when the target is a known channel. Returns # edges."""
    if not edges:
        return 0
    with get_conn() as conn:
        with conn.cursor() as cur:
            for (target_username, edge_type), weight in edges.items():
                cur.execute(
                    """
                    INSERT INTO channel_edges
                        (source_id, target_username, target_id, edge_type, weight)
                    VALUES (
                        %(src)s, %(tu)s,
                        (SELECT id FROM channels WHERE lower(username) = %(tu)s),
                        %(et)s, %(w)s
                    )
                    ON CONFLICT (source_id, target_username, edge_type)
                    DO UPDATE SET
                        weight = EXCLUDED.weight,
                        target_id = COALESCE(channel_edges.target_id, EXCLUDED.target_id)
                    """,
                    {"src": source_id, "tu": target_username, "et": edge_type, "w": weight},
                )
    return len(edges)


def backfill_edge_targets() -> int:
    """Resolve target_id for edges whose target username is now a known channel.
    Run before computing graph metrics so newly-crawled channels link up."""
    with get_conn() as conn:
        cur = conn.execute(
            """
            UPDATE channel_edges e
            SET target_id = c.id
            FROM channels c
            WHERE e.target_id IS NULL
              AND lower(c.username) = lower(e.target_username)
            """
        )
        return cur.rowcount


# ---------------------------------------------------------------- messages ---
def insert_messages(channel_id: int, msgs: list[dict[str, Any]]) -> int:
    """Bulk insert sampled messages; ignores duplicates. Returns inserted count.

    Uses executemany in batches so a deep scan (hundreds/thousands of messages)
    is a few round-trips, not one per row — keeps the pooled connection from
    being held long enough to time out."""
    if not msgs:
        return 0
    params = [
        (
            channel_id,
            m["tg_message_id"],
            m.get("text"),
            m.get("has_image", False),
            m.get("has_link", False),
            m.get("posted_at"),
        )
        for m in msgs
    ]
    sql = """
        INSERT INTO messages
            (channel_id, tg_message_id, text, has_image, has_link, posted_at)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (channel_id, tg_message_id) DO NOTHING
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS n FROM messages WHERE channel_id = %s",
                (channel_id,),
            )
            before = cur.fetchone()["n"]
            # executemany batches the round-trips; chunk to bound memory.
            for i in range(0, len(params), 500):
                cur.executemany(sql, params[i : i + 500])
            cur.execute(
                "SELECT COUNT(*) AS n FROM messages WHERE channel_id = %s",
                (channel_id,),
            )
            after = cur.fetchone()["n"]
    return after - before


def get_channel_messages(channel_id: int, limit: int = 50) -> list[dict[str, Any]]:
    with get_conn() as conn:
        return conn.execute(
            """
            SELECT tg_message_id, text, has_image, has_link, posted_at
            FROM messages
            WHERE channel_id = %s
            ORDER BY posted_at DESC NULLS LAST
            LIMIT %s
            """,
            (channel_id, limit),
        ).fetchall()


# ---------------------------------------------------------------- analysis ---
def upsert_analysis(channel_id: int, data: dict[str, Any]) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO channel_analysis (
                channel_id, category, is_marketplace, confidence,
                summary, tone, typical_content, why_recommended,
                activity_score, quality_score, freshness_score, final_score,
                analyzed_at
            ) VALUES (
                %(channel_id)s, %(category)s, %(is_marketplace)s, %(confidence)s,
                %(summary)s, %(tone)s, %(typical_content)s, %(why_recommended)s,
                %(activity_score)s, %(quality_score)s, %(freshness_score)s, %(final_score)s,
                now()
            )
            ON CONFLICT (channel_id) DO UPDATE SET
                category = EXCLUDED.category,
                is_marketplace = EXCLUDED.is_marketplace,
                confidence = EXCLUDED.confidence,
                summary = EXCLUDED.summary,
                tone = EXCLUDED.tone,
                typical_content = EXCLUDED.typical_content,
                why_recommended = EXCLUDED.why_recommended,
                activity_score = EXCLUDED.activity_score,
                quality_score = EXCLUDED.quality_score,
                freshness_score = EXCLUDED.freshness_score,
                final_score = EXCLUDED.final_score,
                analyzed_at = now()
            """,
            {"channel_id": channel_id, **data},
        )
        # Refresh the FTS vector now that summary/category may have changed.
        conn.execute(
            "UPDATE channels SET search_tsv = channels_build_tsv(%s) WHERE id = %s",
            (channel_id, channel_id),
        )


# ------------------------------------------------------------------ search ---
def _hydrate_by_ids(ids: list[int]) -> list[dict[str, Any]]:
    """Fetch full channel_ranked rows for the given ids, preserving id order."""
    if not ids:
        return []
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM channel_ranked WHERE id = ANY(%s)", (ids,)
        ).fetchall()
    by_id = {r["id"]: r for r in rows}
    # Preserve the order Meili returned (relevance order).
    return [by_id[i] for i in ids if i in by_id]


def _search_postgres(query: str, limit: int) -> list[dict[str, Any]]:
    """Postgres FTS fallback: text relevance blended with final_score."""
    with get_conn() as conn:
        return conn.execute(
            """
            SELECT r.*,
                   ts_rank(c.search_tsv, websearch_to_tsquery('simple', %(q)s)) AS text_rank
            FROM channel_ranked r
            JOIN channels c ON c.id = r.id
            WHERE c.search_tsv @@ websearch_to_tsquery('simple', %(q)s)
            ORDER BY (COALESCE(r.final_score, 0) * 0.7
                      + ts_rank(c.search_tsv, websearch_to_tsquery('simple', %(q)s)) * 100 * 0.3)
                     DESC
            LIMIT %(limit)s
            """,
            {"q": query, "limit": limit},
        ).fetchall()


def search_channels(query: str, limit: int = 20) -> list[dict[str, Any]]:
    """Search via Meilisearch (typo-tolerant, ranked). If Meili is unavailable
    or errors, transparently fall back to Postgres full-text search."""
    hits = meili.search(query, limit=limit)
    if hits is not None:
        ids = [int(h["id"]) for h in hits if "id" in h]
        rows = _hydrate_by_ids(ids)
        if rows:
            return rows
        # Meili up but empty (e.g. not yet indexed) — try Postgres as a safety net.
    return _search_postgres(query, limit)


def get_channel(channel_id: int) -> dict[str, Any] | None:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM channel_ranked WHERE id = %s", (channel_id,)
        ).fetchone()


def list_categories() -> list[dict[str, Any]]:
    with get_conn() as conn:
        return conn.execute(
            """
            SELECT category, COUNT(*) AS channel_count
            FROM channel_analysis
            WHERE category IS NOT NULL
            GROUP BY category
            ORDER BY channel_count DESC
            """
        ).fetchall()


# -------------------------------------------------------------------- stats ---
def get_stats() -> dict[str, Any]:
    """Aggregate metrics for the dashboard. Resilient to optional tables
    (keyword_runs / channel_frontier) not yet existing."""
    with get_conn() as conn:
        total_channels = conn.execute(
            "SELECT COUNT(*) AS n FROM channels"
        ).fetchone()["n"]

        analyzed = conn.execute(
            "SELECT COUNT(*) AS n FROM channel_analysis"
        ).fetchone()["n"]

        total_messages = conn.execute(
            "SELECT COUNT(*) AS n FROM messages"
        ).fetchone()["n"]

        # Channels that have messages but no analysis yet.
        pending_analysis = conn.execute(
            """
            SELECT COUNT(*) AS n
            FROM channels c
            WHERE EXISTS (SELECT 1 FROM messages m WHERE m.channel_id = c.id)
              AND NOT EXISTS (
                SELECT 1 FROM channel_analysis a WHERE a.channel_id = c.id
              )
            """
        ).fetchone()["n"]

        marketplace = conn.execute(
            "SELECT COUNT(*) AS n FROM channel_analysis WHERE is_marketplace"
        ).fetchone()["n"]

        spam = conn.execute(
            "SELECT COUNT(*) AS n FROM channel_analysis WHERE category = 'spam'"
        ).fetchone()["n"]

        # Recently crawled (last 24h).
        crawled_24h = conn.execute(
            """
            SELECT COUNT(*) AS n FROM channels
            WHERE last_crawled_at > now() - interval '24 hours'
            """
        ).fetchone()["n"]

        # Frontier breakdown (optional table).
        frontier: dict[str, int] = {}
        if conn.execute("SELECT to_regclass('public.channel_frontier')").fetchone()[
            "to_regclass"
        ]:
            rows = conn.execute(
                "SELECT status, COUNT(*) AS n FROM channel_frontier GROUP BY status"
            ).fetchall()
            frontier = {r["status"]: r["n"] for r in rows}

        # Keyword coverage (optional table).
        keywords_tracked = 0
        if conn.execute("SELECT to_regclass('public.keyword_runs')").fetchone()[
            "to_regclass"
        ]:
            keywords_tracked = conn.execute(
                "SELECT COUNT(*) AS n FROM keyword_runs WHERE last_crawled_at IS NOT NULL"
            ).fetchone()["n"]

        categories = conn.execute(
            """
            SELECT category, COUNT(*) AS channel_count
            FROM channel_analysis
            WHERE category IS NOT NULL
            GROUP BY category
            ORDER BY channel_count DESC
            LIMIT 10
            """
        ).fetchall()

    return {
        "total_channels": total_channels,
        "analyzed": analyzed,
        "pending_analysis": pending_analysis,
        "total_messages": total_messages,
        "marketplace": marketplace,
        "spam": spam,
        "crawled_24h": crawled_24h,
        "frontier_pending": frontier.get("pending", 0),
        "frontier_done": frontier.get("done", 0),
        "frontier_failed": frontier.get("failed", 0),
        "frontier_skipped": frontier.get("skipped", 0),
        "keywords_tracked": keywords_tracked,
        "categories": categories,
    }


# ------------------------------------------------------------------- graph ---
def get_edges_for_metrics() -> list[dict[str, Any]]:
    """All edges between KNOWN channels (target resolved), for metric compute."""
    with get_conn() as conn:
        return conn.execute(
            """
            SELECT source_id, target_id, SUM(weight) AS weight
            FROM channel_edges
            WHERE target_id IS NOT NULL AND target_id <> source_id
            GROUP BY source_id, target_id
            """
        ).fetchall()


def all_channel_ids() -> list[int]:
    with get_conn() as conn:
        rows = conn.execute("SELECT id FROM channels").fetchall()
    return [r["id"] for r in rows]


def write_graph_metrics(rows: list[dict[str, Any]]) -> None:
    """Upsert per-channel graph metrics."""
    if not rows:
        return
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO channel_graph
                    (channel_id, in_degree, out_degree, pagerank, betweenness,
                     cluster_id, computed_at)
                VALUES (%(id)s, %(in_degree)s, %(out_degree)s, %(pagerank)s,
                        %(betweenness)s, %(cluster_id)s, now())
                ON CONFLICT (channel_id) DO UPDATE SET
                    in_degree = EXCLUDED.in_degree,
                    out_degree = EXCLUDED.out_degree,
                    pagerank = EXCLUDED.pagerank,
                    betweenness = EXCLUDED.betweenness,
                    cluster_id = EXCLUDED.cluster_id,
                    computed_at = now()
                """,
                rows,
            )


def graph_nodes_edges(
    limit: int = 300, cluster_id: int | None = None
) -> dict[str, Any]:
    """Nodes (top by pagerank) + edges among them, for the viz."""
    with get_conn() as conn:
        if cluster_id is not None:
            nodes = conn.execute(
                """
                SELECT * FROM channel_graph_view
                WHERE cluster_id = %s
                ORDER BY pagerank DESC NULLS LAST
                LIMIT %s
                """,
                (cluster_id, limit),
            ).fetchall()
        else:
            nodes = conn.execute(
                """
                SELECT * FROM channel_graph_view
                WHERE pagerank IS NOT NULL
                ORDER BY pagerank DESC NULLS LAST
                LIMIT %s
                """,
                (limit,),
            ).fetchall()
        ids = [n["id"] for n in nodes]
        edges = []
        if ids:
            edges = conn.execute(
                """
                SELECT source_id, target_id, SUM(weight) AS weight
                FROM channel_edges
                WHERE target_id = ANY(%(ids)s) AND source_id = ANY(%(ids)s)
                  AND target_id <> source_id
                GROUP BY source_id, target_id
                """,
                {"ids": ids},
            ).fetchall()
    return {"nodes": nodes, "edges": edges}


def graph_hubs(limit: int = 20) -> list[dict[str, Any]]:
    with get_conn() as conn:
        return conn.execute(
            """
            SELECT * FROM channel_graph_view
            WHERE pagerank IS NOT NULL
            ORDER BY pagerank DESC
            LIMIT %s
            """,
            (limit,),
        ).fetchall()


def graph_bridges(limit: int = 20) -> list[dict[str, Any]]:
    with get_conn() as conn:
        return conn.execute(
            """
            SELECT * FROM channel_graph_view
            WHERE betweenness > 0
            ORDER BY betweenness DESC
            LIMIT %s
            """,
            (limit,),
        ).fetchall()


def graph_clusters() -> list[dict[str, Any]]:
    """Cluster summaries: size + dominant category + a few representative titles."""
    with get_conn() as conn:
        return conn.execute(
            """
            SELECT
                g.cluster_id,
                COUNT(*) AS size,
                MODE() WITHIN GROUP (ORDER BY a.category) AS top_category,
                (array_agg(c.title ORDER BY g.pagerank DESC))[1:3] AS top_titles
            FROM channel_graph g
            JOIN channels c ON c.id = g.channel_id
            LEFT JOIN channel_analysis a ON a.channel_id = g.channel_id
            WHERE g.cluster_id IS NOT NULL
            GROUP BY g.cluster_id
            ORDER BY size DESC
            """
        ).fetchall()
