-- Graph-centric layer: a real edge list + per-channel graph metrics.
-- Run after 004_tech_vertical.sql.

-- ---------------------------------------------------------------------------
-- channel_edges: directed references between channels.
--   source_id      -> channels.id that did the referencing
--   target_username-> referenced channel handle (may not be a known channel yet)
--   target_id      -> channels.id of the target once known (nullable)
--   edge_type      -> 'tme_link' | 'mention' | 'forward'
--   weight         -> how many times source referenced target (across messages)
-- One row per (source, target_username, edge_type); weight accumulates.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_edges (
    id              BIGSERIAL PRIMARY KEY,
    source_id       BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    target_username TEXT NOT NULL,
    target_id       BIGINT REFERENCES channels(id) ON DELETE SET NULL,
    edge_type       TEXT NOT NULL,
    weight          INTEGER NOT NULL DEFAULT 1,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, target_username, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_edges_source ON channel_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target_username ON channel_edges(lower(target_username));
CREATE INDEX IF NOT EXISTS idx_edges_target_id ON channel_edges(target_id);

-- ---------------------------------------------------------------------------
-- channel_graph: per-channel graph metrics (recomputed by the metrics job).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_graph (
    channel_id      BIGINT PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
    in_degree       INTEGER NOT NULL DEFAULT 0,   -- # channels referencing this one (influence)
    out_degree      INTEGER NOT NULL DEFAULT 0,   -- # channels this one references
    pagerank        REAL NOT NULL DEFAULT 0,      -- centrality / hub score
    betweenness     REAL NOT NULL DEFAULT 0,      -- bridge score
    cluster_id      INTEGER,                      -- community / sub-cluster
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_graph_pagerank ON channel_graph(pagerank DESC);
CREATE INDEX IF NOT EXISTS idx_graph_cluster ON channel_graph(cluster_id);

-- ---------------------------------------------------------------------------
-- Convenience: channel + analysis + graph metrics flattened.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW channel_graph_view AS
SELECT
    c.id, c.username, c.title, c.member_count,
    a.category, a.summary, a.why_recommended, a.final_score,
    g.in_degree, g.out_degree, g.pagerank, g.betweenness, g.cluster_id
FROM channels c
LEFT JOIN channel_analysis a ON a.channel_id = c.id
LEFT JOIN channel_graph g ON g.channel_id = c.id;
