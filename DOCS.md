# Telegram Search Engine — Documentation

A self-hosted engine that **discovers, analyzes, ranks, and maps** public
Telegram channels. Use it as a data layer for any app that needs structured
Telegram data, or run the included read-only web UI as a discovery/graph product.

**Table of Contents**
- [Architecture](#architecture)
- [Data model](#data-model)
- [Configuration](#configuration)
- [Pipeline commands](#pipeline-commands)
- [API reference](#api-reference)
- [How search works](#how-search-works)
- [How the graph works](#how-the-graph-works)
- [How scoring works](#how-scoring-works)
- [Account safety / ToS](#account-safety--tos)
- [Deployment](#deployment)

---

## Architecture

```
                       YOUR MACHINE (residential IP + GPU)
  ┌─────────────────────────────────────────────────────────────┐
  │  ingestion (Telethon, read-only)  →  Postgres                │
  │  analysis  (Ollama local LLM)     →  Postgres + Meilisearch  │
  │  graph     (networkx metrics)     →  Postgres                │
  └─────────────────────────────────────────────────────────────┘
                              │ (same database)
                              ▼
                   SERVER (Docker, public demo)
  ┌─────────────────────────────────────────────────────────────┐
  │  Caddy (HTTPS) → web (Next.js) → api (FastAPI, read-only)    │
  │                                    ├─→ Postgres              │
  │                                    └─→ Meilisearch           │
  └─────────────────────────────────────────────────────────────┘
```

Two halves, deliberately separated:

- **The pipeline** (crawl / analyze / graph) runs on *your* machine — it needs a
  residential IP (Telegram bans datacenter IPs) and a GPU for the local LLM. It
  writes into Postgres.
- **The serving layer** (web + read-only API + search) runs anywhere via Docker
  and only *reads* the database.

### Components

| Layer        | Tech                         | Role |
| ------------ | ---------------------------- | ---- |
| Ingestion    | Python + Telethon (MTProto)  | Read-only channel discovery + message sampling |
| Analysis     | Ollama (local LLM)           | Classification, summaries, "why recommended", quality |
| Graph        | networkx + python-louvain    | PageRank, betweenness, community detection |
| Database     | Postgres                     | Source of truth |
| Search       | Meilisearch (+ Postgres FTS fallback) | Typo-tolerant ranked search |
| API          | FastAPI                      | Read-only HTTP endpoints |
| Frontend     | Next.js (App Router, TS)     | Search / channel / graph / dashboard UI |
| Proxy/TLS    | Caddy                        | Automatic HTTPS |

---

## Data model

| Table              | Purpose |
| ------------------ | ------- |
| `channels`         | One row per unique channel (deduped by tg_id / username) |
| `messages`         | Sampled recent messages per channel |
| `channel_analysis` | LLM output + component scores (one row per channel) |
| `channel_frontier` | Link-graph queue of candidate channels to crawl |
| `channel_edges`    | Directed reference edges (link / mention / forward) with weights |
| `channel_graph`    | Per-channel graph metrics (pagerank, betweenness, cluster) |
| `keyword_terms`    | Bases + modifiers for keyword expansion |
| `keyword_runs`     | Tracks which generated queries were crawled when |

Views: `channel_ranked` (channel + analysis flattened), `channel_graph_view`
(channel + analysis + graph metrics).

The schema is created by `migrations/*.sql`, applied automatically on first DB
start (or run manually with `psql`).

---

## Configuration

All configuration is loaded from environment variables. Use `.env` for development and `.env.prod` for production.

### Required variables

| Variable | Type | Description |
|----------|------|-------------|
| `TG_API_ID` | int | Telegram app ID from [my.telegram.org](https://my.telegram.org) |
| `TG_API_HASH` | string | Telegram app hash from [my.telegram.org](https://my.telegram.org) |
| `TG_SESSION_STRING` | string | Saved Telegram session (obtain via `--print-session`) |
| `DATABASE_URL` | string | PostgreSQL connection string (e.g., `postgresql://user:pass@localhost/tg_db`) |

### Optional variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `TG_PHONE` | string | — | Phone number for Telegram account (optional, used for first login) |
| `TG_MIN_DELAY_SECONDS` | float | 4.0 | Minimum delay between Telegram API calls (must respect ToS) |
| `TG_JITTER_SECONDS` | float | 3.0 | Random delay added to `TG_MIN_DELAY_SECONDS` to vary timing |
| `TG_MESSAGES_PER_CHANNEL` | int | 40 | Default number of recent messages to sample per channel |
| `TG_MAX_CHANNELS_PER_RUN` | int | 50 | Maximum channels to crawl per invocation (safety limit) |
| `TG_ALLOW_JOIN` | bool | false | **Must be false**. Crawler refuses to join channels if false. |
| `OLLAMA_BASE_URL` | string | http://localhost:11434 | Ollama local LLM endpoint |
| `OLLAMA_MODEL` | string | llama3.1:8b | Model name running in Ollama |
| `MEILI_URL` | string | http://localhost:7700 | Meilisearch server URL (blank = use Postgres FTS fallback) |
| `MEILI_MASTER_KEY` | string | — | Meilisearch admin API key |
| `MEILI_INDEX` | string | channels | Meilisearch index name |
| `API_HOST` | string | 0.0.0.0 | FastAPI server bind address |
| `API_PORT` | int | 8000 | FastAPI server port |
| `CORS_ORIGINS` | string | — | Comma-separated list of allowed CORS origins (e.g., `https://myapp.com,https://www.myapp.com`). Empty = allow all (dev only). |

## Pipeline commands

All commands are Python modules run from the repo root with the venv activated.

### 0. One-time: Capture a Telegram session

Before running any crawl, you must generate and store a Telegram session string:

```bash
python -m app.ingestion.crawl --print-session
```

This performs an interactive login to your Telegram account. Copy the printed session string into `.env`:

```env
TG_SESSION_STRING=1aabb1234...
```

**Arguments:**
- `--print-session` — Start interactive login and output session string.

---

### 1. Crawl by keywords

#### Explicit keyword search

Discover channels by searching explicit keywords:

```bash
python -m app.ingestion.crawl --keywords phones addis crypto jobs
```

For each keyword, the crawler searches Telegram, deduplicates by `tg_id`, samples recent messages, stores channel data, and enqueues discovered references into the link-graph frontier.

**Arguments:**
- `--keywords WORDS...` — Space-separated keywords to search (required if `--from-db` or `--link-graph` not specified).

**Behavior:**
- Searches up to 20 channels per keyword
- Deduplicates by `tg_id` across the run
- Caps total channels at `TG_MAX_CHANNELS_PER_RUN`
- Samples up to `TG_MESSAGES_PER_CHANNEL` recent messages per channel
- Records each reference (t.me link, @mention, forward) as edges in the graph
- Enqueues discovered channels at depth 1 into the frontier for link-graph crawls

#### DB-driven keyword expansion

Generate keywords from a base × modifier matrix stored in the database. Automatically tracks crawl history and only re-crawls queries older than a threshold:

```bash
python -m app.ingestion.crawl --from-db --max-queries 20 --min-age-hours 24
```

**Arguments:**
- `--from-db` — Generate queries from `keyword_terms` (bases × modifiers) instead of explicit keywords.
- `--max-queries COUNT` — Maximum number of due queries to crawl this run (default: 20).
- `--min-age-hours HOURS` — Skip queries crawled more recently than this threshold (default: 24.0).

**Behavior:**
- Loads bases and modifiers from `keyword_terms` table
- Generates all combinations (cartesian product)
- Finds "due" queries (not crawled or crawled >HOURS ago)
- Runs up to `--max-queries` of them
- Records results in `keyword_runs` to track crawl history
- Enables iterative discovery over time without re-running the same queries

#### Add a known channel manually

Seed a channel into the link-graph frontier by username or t.me URL:

```bash
python -m app.ingestion.add_channel solodevchronicles
python -m app.ingestion.add_channel https://t.me/SoloDevChronicles
python -m app.ingestion.add_channel @SoloDevChronicles https://t.me/other_channel
```

Accepts multiple channels in one invocation. They're queued at frontier depth 0 and picked up by the next `--link-graph` crawl.

**Arguments:**
- `channels CHANNEL...` — One or more usernames (with or without @), or t.me URLs. Accepts any mix.

**Behavior:**
- Parses username from raw input (handles t.me/, /, ?, query params)
- Enqueues each at depth 0 with source="manual"
- Next link-graph run will resolve and sample them

---

### 2. Link-graph discovery

Drain the frontier queue: resolve pending candidate channels, sample them, and enqueue their references to grow the graph outward:

```bash
python -m app.ingestion.crawl --link-graph --max-depth 2 --limit 30
```

For deep history on important seed channels:

```bash
python -m app.ingestion.crawl --link-graph --limit 5 --messages 1000
```

**Arguments:**
- `--link-graph` — Drain the frontier queue instead of searching keywords.
- `--max-depth DEPTH` — Maximum hops from a seed channel (default: 2). Children at this depth don't harvest further references.
- `--limit COUNT` — Maximum candidate channels to resolve and sample this run (default: 30).
- `--messages COUNT` — Override `TG_MESSAGES_PER_CHANNEL` for this run (e.g., 1000 for deep history on seeds).

**Behavior:**
- Fetches up to `--limit` pending candidates from `channel_frontier` with depth ≤ `--max-depth`
- For each candidate:
  - Skips if username is null (marks "skipped")
  - Attempts to resolve the username to a channel (marks "failed" if not found)
  - Samples up to `--messages` recent posts (or `TG_MESSAGES_PER_CHANNEL` if not specified)
  - Stores channel and messages
  - **Always extracts and stores edges**, regardless of depth
  - If child_depth < max_depth, enqueues discovered references at child_depth + 1
- Updates frontier status: "done", "failed", or "skipped"
- Outputs frontier statistics (total pending, done, failed, etc.)

---

### 3. Analyze channels with LLM

Run the LLM analyzer on channels that have messages but no analysis record:

```bash
python -m app.analysis.run --limit 200
```

This classifies each channel, summarizes its content, computes quality and activity scores, and pushes results into Meilisearch (if configured).

**Arguments:**
- `--limit COUNT` — Maximum channels to analyze this run (default: 50).

**Behavior:**
- Fetches up to `--limit` channels with messages but no analysis
- For each channel:
  - Fetches up to 50 recent messages
  - Sends to Ollama for classification (category, summary, why-recommended, quality_score)
  - Computes activity_score, freshness_score, influence_score (from graph metrics, if available)
  - Computes final_score from the scoring formula
  - Upserts analysis into `channel_analysis`
  - Mirrors the full channel record into Meilisearch (non-fatal if Meili is down)
- Logs channel title, category, final score, and confidence for each

---

### 4. Compute graph metrics

Build the directed graph from stored edges and compute centrality, community structure, and influence:

```bash
python -m app.graph.metrics
```

No arguments. This reads all edges from `channel_edges`, computes PageRank, betweenness, and Louvain communities, writes metrics to `channel_graph`, and rescores all channels with influence-based `final_score`. Also re-syncs Meilisearch.

**Behavior:**
- Resolves any edge targets that became known channels since the last crawl
- Loads all edges between known channels
- Builds a directed weighted networkx graph
- Computes:
  - **PageRank** — hub/influence score (normalized per node)
  - **Betweenness centrality** — bridge score (on undirected projection, normalized)
  - **In-degree & out-degree** — how many channels reference it / it references
  - **Louvain clusters** — community detection (on undirected projection); falls back to connected components if unavailable
- Writes metrics to `channel_graph` (one row per channel with graph metrics)
- Rescores all analyzed channels with influence: `final_score = quality·40% + activity·30% + influence·20% + freshness·10%`
- Re-syncs updated scores into Meilisearch (non-fatal if Meili is down)
- Logs cluster count and rescored channel count

---

### 5. Backfill edges from stored messages

Rebuild the edge graph from messages already in the database (no Telegram API calls). Useful after bulk imports or to recover edges that weren't captured on first sample:

```bash
python -m app.graph.backfill_edges
```

No arguments. Reads the `messages` table, extracts t.me links and @mentions, and rebulks edges into `channel_edges`.

**Behavior:**
- Iterates all channels by id
- For each channel with stored messages:
  - Extracts edges from message text (t.me links, @mentions)
  - Upserts edges into `channel_edges` with proper weights
- Resolves extracted usernames to known channels
- Logs edge counts per channel and total edges written

**Note:** Forward edges (from `forwarded_from` metadata) are not recoverable here; they're captured on live crawls. This backfill recovers links and mentions only.

---

### 6. Reindex search (Meilisearch)

Bulk-load all analyzed channels from Postgres into Meilisearch. Use once after standing up Meili or to rebuild the index from scratch:

```bash
python -m app.search.reindex
```

No arguments. Fetches all analyzed channels and pushes them to Meilisearch in 500-channel batches.

**Behavior:**
- Verifies Meilisearch is reachable (aborts if not)
- Ensures the search index exists
- Fetches all channels with final_score IS NOT NULL from `channel_ranked`
- Pushes in batches of 500
- Logs progress per batch
- If Meilisearch is down or unconfigured, search transparently falls back to Postgres FTS — no data loss.

---

### 7. Run the API server

Start the read-only FastAPI server:

```bash
uvicorn app.api.main:app --reload --port 8000
```

Or with production settings:

```bash
uvicorn app.api.main:app --host 0.0.0.0 --port 8000 --workers 4
```

**Environment:**
- `API_HOST` — Bind address (default: 0.0.0.0)
- `API_PORT` — Port (default: 8000)
- `CORS_ORIGINS` — Comma-separated list of allowed frontend origins. Empty in dev (allows all); set in production.

**Behavior:**
- Starts a read-only HTTP server (all endpoints are GET)
- CORS restricted to `CORS_ORIGINS` (or allows all if empty)
- Interactive docs at `/docs` (disabled if `CORS_ORIGINS` is set for production)
- Every endpoint reads from Postgres or Meilisearch; no writes

---

## API reference

All endpoints are **GET** and **read-only**. Base URL is your API server (e.g., `http://localhost:8000`).

### GET /health

Health check endpoint.

**Response:** `{status: "ok"}`

**Example:**
```bash
curl http://localhost:8000/health
```

---

### GET /search

Search channels by query string with typo tolerance and ranking.

**Parameters:**
- `q` (required, string, min_length=1) — Search query (e.g., "phones ethiopia")
- `limit` (optional, int, default=20, range=1-100) — Maximum results

**Response:** Array of `ChannelSummary` objects
```json
[
  {
    "id": 123,
    "tg_id": 1234567890,
    "username": "example_channel",
    "title": "Example Channel",
    "category": "Technology",
    "summary": "A channel about tech",
    "why_recommended": "Active discussions on software",
    "member_count": 5000,
    "final_score": 78.5
  }
]
```

**Examples:**
```bash
curl "http://localhost:8000/search?q=crypto&limit=10"
curl "http://localhost:8000/search?q=phones+addis&limit=50"
```

**Behavior:**
- Searches via Meilisearch (if configured) with typo tolerance, word/proximity ranking, and `final_score` tie-breaking
- Falls back to Postgres full-text search if Meilisearch is unavailable
- Results are ranked by relevance, then by `final_score`

---

### GET /channel/{channel_id}

Get detailed information about a specific channel, including sample messages and analytics.

**Parameters:**
- `channel_id` (required, path, int) — Database ID of the channel

**Response:** `ChannelDetail` object
```json
{
  "id": 123,
  "tg_id": 1234567890,
  "username": "example_channel",
  "title": "Example Channel",
  "category": "Technology",
  "summary": "A channel about tech",
  "why_recommended": "Active discussions on software",
  "member_count": 5000,
  "final_score": 78.5,
  "activity_score": 75.0,
  "quality_score": 82.0,
  "freshness_score": 70.0,
  "influence_score": 65.0,
  "sample_messages": [
    {
      "id": 456,
      "text": "Just launched our new library...",
      "date": "2025-06-20T10:30:00Z",
      "channel_username": "example_channel"
    }
  ],
  "analytics": {
    "message_count": 1250,
    "avg_daily_messages": 15.2,
    "image_ratio": 0.35,
    "repetition_score": 0.12
  }
}
```

**Examples:**
```bash
curl http://localhost:8000/channel/123
```

**Errors:**
- `404 Not Found` — Channel does not exist

---

### GET /categories

List all channel categories with counts.

**Response:** Array of `CategoryOut` objects
```json
[
  {
    "category": "Technology",
    "channel_count": 145
  },
  {
    "category": "Business",
    "channel_count": 89
  }
]
```

**Examples:**
```bash
curl http://localhost:8000/categories
```

---

### GET /stats

Get pipeline statistics and progress.

**Response:** `StatsOut` object
```json
{
  "total_channels": 500,
  "channels_with_analysis": 450,
  "frontier_pending": 75,
  "frontier_done": 200,
  "frontier_failed": 10
}
```

**Examples:**
```bash
curl http://localhost:8000/stats
```

---

### GET /graph

Get nodes and edges for the channel reference graph, optionally filtered by cluster.

**Parameters:**
- `limit` (optional, int, default=250, range=1-1000) — Maximum nodes to include
- `cluster_id` (optional, int) — Filter to a specific Louvain cluster ID

**Response:** `GraphOut` object
```json
{
  "nodes": [
    {
      "id": 123,
      "title": "Example Channel",
      "username": "example_channel",
      "cluster_id": 5,
      "pagerank": 0.0085,
      "betweenness": 0.045
    }
  ],
  "edges": [
    {
      "source": 123,
      "target": 456,
      "weight": 3.2
    }
  ]
}
```

**Examples:**
```bash
curl "http://localhost:8000/graph?limit=500&cluster_id=5"
curl "http://localhost:8000/graph?limit=250"
```

**Behavior:**
- Returns up to `--limit` highest-scoring nodes
- If `cluster_id` is specified, returns only nodes in that cluster
- Edges connect any two nodes in the result set

---

### GET /graph/hubs

List the most influential channels (highest PageRank).

**Parameters:**
- `limit` (optional, int, default=20, range=1-100) — Maximum hubs to return

**Response:** Array of `HubOut` objects
```json
[
  {
    "id": 123,
    "username": "tech_hub",
    "title": "Tech Hub",
    "pagerank": 0.015
  }
]
```

**Examples:**
```bash
curl "http://localhost:8000/graph/hubs?limit=50"
```

---

### GET /graph/bridges

List channels with highest betweenness centrality (most likely to bridge separate communities).

**Parameters:**
- `limit` (optional, int, default=20, range=1-100) — Maximum bridges to return

**Response:** Array of `HubOut` objects
```json
[
  {
    "id": 456,
    "username": "bridge_channel",
    "title": "Bridge Channel",
    "betweenness": 0.12
  }
]
```

**Examples:**
```bash
curl "http://localhost:8000/graph/bridges?limit=20"
```

---

### GET /graph/clusters

List Louvain communities with aggregate statistics.

**Response:** Array of `ClusterOut` objects
```json
[
  {
    "cluster_id": 0,
    "channel_count": 45,
    "avg_pagerank": 0.0045,
    "top_channels": [
      {"id": 123, "username": "example_channel", "title": "Example Channel"}
    ]
  }
]
```

**Examples:**
```bash
curl http://localhost:8000/graph/clusters
```

---

### Response types

#### ChannelSummary
```json
{
  "id": integer,
  "tg_id": integer,
  "username": string,
  "title": string,
  "category": string,
  "summary": string,
  "why_recommended": string,
  "member_count": integer,
  "final_score": float
}
```

#### ChannelDetail
Extends `ChannelSummary` with:
```json
{
  "activity_score": float,
  "quality_score": float,
  "freshness_score": float,
  "influence_score": float,
  "sample_messages": [MessageOut],
  "analytics": ChannelAnalytics
}
```

#### MessageOut
```json
{
  "id": integer,
  "text": string,
  "date": "ISO 8601 datetime",
  "channel_username": string
}
```

#### ChannelAnalytics
```json
{
  "message_count": integer,
  "avg_daily_messages": float,
  "image_ratio": float,
  "repetition_score": float
}
```

---

## How search works

Search runs through **Meilisearch** (typo tolerance, word/proximity ranking) with automatic fallback to Postgres FTS.

**Meilisearch mode:**
- Indexes: title, username, summary, category, why_recommended
- Ranking: Text relevance (typo-tolerant fuzzy match + word/proximity) first, then `final_score` as tie-breaker
- Automatic indexing: New channels pushed by the analyzer; bulk reindex available via `app.search.reindex`
- Graceful degradation: If Meili is down or unconfigured, search transparently falls back to Postgres FTS

**Postgres FTS fallback:**
- Used if `MEILI_URL` is blank/unconfigured or Meilisearch is unreachable
- Searches via GIN full-text indexes on title, username, summary
- Ranks by text relevance (ts_rank), then `final_score`
- Slightly slower than Meili but ensures search always works

---

## How the graph works

The graph represents channel-to-channel references extracted from messages.

**Edge types:**
- **t.me links** — Explicit channel references in message text
- **@mentions** — Channel usernames mentioned in posts
- **forwards** — Message forwarded from another channel (captured on live crawls only)

**Storage:**
- Stored in `channel_edges` with weights (higher weight = more frequent references)
- Only edges between known channels are included in graph metrics

**Computation:**
- `app.graph.metrics` builds a directed weighted networkx graph from all edges
- Computes per channel:
  - **in_degree** — count of channels referencing it
  - **out_degree** — count of channels it references
  - **PageRank** — centrality score (normalized); high = hub
  - **betweenness centrality** — bridge score (normalized on undirected projection); high = connects communities
  - **cluster_id** — Louvain community membership (or connected component fallback)

**Querying:**
- `/graph` — Browse the full graph (paginated by score)
- `/graph/hubs` — Channels with highest PageRank (network hubs)
- `/graph/bridges` — Channels with highest betweenness (community bridges)
- `/graph/clusters` — Community-level statistics

---

## How scoring works

Each channel's importance is distilled into a weighted composite `final_score`:

```
final_score = quality·40% + activity·30% + influence·20% + freshness·10%
```

**Component scores:**

| Score | Source | Meaning |
|-------|--------|---------|
| **quality** | Ollama LLM | Channel usefulness / relevance. Spam heavily penalized; detailed/informative content scores higher. Range: 0–100 |
| **activity** | Message analysis | Message volume, image ratio, low repetition. Range: 0–100 |
| **influence** | PageRank graph metric | Normalized PageRank from the channel reference network. Reflects network centrality, not member count. Range: 0–100 |
| **freshness** | Message timestamps | Recency of the newest sampled message. Recent = higher. Range: 0–100 |

**Recomputation:**
- `app.analysis.run` computes activity, freshness, and quality on first analysis
- `app.graph.metrics` recomputes influence (from updated PageRank) and refreshes final_score for all channels
- Scores are synced into Meilisearch for search ranking

---

## Account safety / ToS

The crawler uses an MTProto **user account** (the Bot API can't discover or read
arbitrary public channels). Bans come from *behavior*, not from using Telethon.
The code is built so the risky behaviors are structurally hard:

- **Read-only, never joins** — `TG_ALLOW_JOIN=false` or the worker refuses to start.
- **Throttled by construction** — every call passes a rate limiter; FloodWait is
  always honored in full.
- **Use a dedicated, aged account** on a **residential IP** matching the SIM country.
- **Treat the account as disposable** — store the session string for fast swaps.

Keep crawl volume modest (`--limit`, `--max-queries`); you don't need speed.

---

## Deployment

See [`DEPLOY.md`](./DEPLOY.md) for the single-VPS Docker deploy (Caddy + HTTPS),
[`MIGRATE_DB.md`](./MIGRATE_DB.md) for moving data into the dockerized Postgres,
and `server-infra/README.md` for hosting multiple projects behind one shared
reverse proxy.
