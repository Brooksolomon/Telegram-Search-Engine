-- Link-graph crawling: a frontier queue of candidate channels discovered from
-- the messages of channels we've already sampled. Run after 002_keywords.sql.

CREATE TABLE IF NOT EXISTS channel_frontier (
    id              BIGSERIAL PRIMARY KEY,
    -- A candidate is identified by username (preferred) or tg_id.
    username        TEXT,
    tg_id           BIGINT,
    depth           INTEGER NOT NULL DEFAULT 1,   -- hops from a seed channel
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'done', 'failed', 'skipped')),
    source          TEXT,            -- 'tme_link' | 'forward' | 'mention'
    discovered_from BIGINT,          -- channels.id that referenced this candidate
    enqueued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at    TIMESTAMPTZ,
    -- Dedupe: at most one frontier row per username and per tg_id.
    UNIQUE (username),
    UNIQUE (tg_id)
);

CREATE INDEX IF NOT EXISTS idx_frontier_status_depth
    ON channel_frontier(status, depth);
