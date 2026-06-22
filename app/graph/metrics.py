"""Compute graph metrics over the channel reference network.

Builds a directed weighted graph from channel_edges (between known channels),
then computes per-channel:
  * in_degree   — how many channels reference it (influence)
  * out_degree  — how many it references
  * pagerank    — centrality / hub score
  * betweenness — bridge score (connects otherwise-separate clusters)
  * cluster_id  — community via Louvain (on the undirected projection)

    python -m app.graph.metrics
"""
from __future__ import annotations

import logging

from app.db import repository as repo
from app.db.database import close_pool

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("graph.metrics")


def compute() -> None:
    import networkx as nx

    # Resolve any edges whose target became a known channel since last crawl.
    resolved = repo.backfill_edge_targets()
    log.info("resolved %d edge targets", resolved)

    edges = repo.get_edges_for_metrics()
    log.info("loaded %d edges between known channels", len(edges))
    if not edges:
        log.warning("no resolved edges yet — crawl more so channels link up")
        return

    g = nx.DiGraph()
    for e in edges:
        g.add_edge(e["source_id"], e["target_id"], weight=float(e["weight"]))
    log.info("graph: %d nodes, %d edges", g.number_of_nodes(), g.number_of_edges())

    # Centrality.
    pagerank = nx.pagerank(g, weight="weight")
    # Betweenness is O(V*E); fine for this scale. Use undirected for bridges.
    ug = g.to_undirected()
    betweenness = nx.betweenness_centrality(ug, weight="weight", normalized=True)

    # Community detection (Louvain) on the undirected projection.
    clusters = _louvain(ug)

    in_deg = dict(g.in_degree())
    out_deg = dict(g.out_degree())

    rows = []
    for node in g.nodes():
        rows.append(
            {
                "id": node,
                "in_degree": int(in_deg.get(node, 0)),
                "out_degree": int(out_deg.get(node, 0)),
                "pagerank": float(pagerank.get(node, 0.0)),
                "betweenness": float(betweenness.get(node, 0.0)),
                "cluster_id": clusters.get(node),
            }
        )
    repo.write_graph_metrics(rows)
    n_clusters = len(set(c for c in clusters.values() if c is not None))
    log.info("wrote metrics for %d channels in %d clusters", len(rows), n_clusters)


def _louvain(ug) -> dict[int, int]:
    """Louvain community detection, with graceful fallback if the package or
    a tiny graph makes it unavailable."""
    try:
        import community as community_louvain  # python-louvain

        return community_louvain.best_partition(ug, weight="weight")
    except Exception as e:  # noqa: BLE001
        log.warning("Louvain unavailable (%s) — falling back to connected components", e)
        import networkx as nx

        clusters: dict[int, int] = {}
        for i, comp in enumerate(nx.connected_components(ug)):
            for node in comp:
                clusters[node] = i
        return clusters


def main() -> None:
    try:
        compute()
    finally:
        close_pool()


if __name__ == "__main__":
    main()
