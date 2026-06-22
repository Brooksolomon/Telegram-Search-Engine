-- Replace member-count weighting with graph influence (PageRank).
-- Run after 005_graph.sql.

ALTER TABLE channel_analysis
    ADD COLUMN IF NOT EXISTS influence_score REAL NOT NULL DEFAULT 0;

-- Expose influence_score in the ranked view used by search/API.
-- DROP first: CREATE OR REPLACE can't insert a column mid-list (Postgres reads
-- it as renaming an existing column and errors).
DROP VIEW IF EXISTS channel_ranked;
CREATE VIEW channel_ranked AS
SELECT
    c.id, c.tg_id, c.username, c.title, c.member_count,
    c.discovered_by_keyword, c.first_seen_at, c.last_crawled_at,
    a.category, a.is_marketplace, a.confidence, a.summary, a.tone,
    a.typical_content, a.why_recommended,
    a.activity_score, a.quality_score, a.freshness_score,
    a.influence_score, a.final_score
FROM channels c
LEFT JOIN channel_analysis a ON a.channel_id = c.id;
