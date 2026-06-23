# Telegram Search Engine — Documentation

A self-hosted engine that **discovers, analyzes, ranks, and maps** public
Telegram channels. Use it as a data layer for any app that needs structured
Telegram data, or run the included read-only web UI as a discovery/graph product.

- [Architecture](#architecture)
- [Data model](#data-model)
- [The pipeline (commands)](#the-pipeline)
- [Configuration](#configuration)
- [How search works](#how-search-works)
- [How the graph works](#how-the-graph-works)
- [How scoring works](#how-scoring-works)
- [HTTP API reference](#http-api-reference)
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

## The pipeline

All commands are Python modules run from the repo root with the venv active.

### 0. One-time: capture a Telegram session

```bash
python -m app.ingestion.crawl --print-session
# paste the printed string into TG_SESSION_STRING in .env
```

### 1. Discover + sample

```bash
# explicit keywords
python -m app.ingestion.crawl --keywords phones addis crypto jobs

# DB-driven keyword expansion (bases × modifiers, skips recently-crawled)
python -m app.ingestion.crawl --from-db --max-queries 20 --min-age-hours 24

# add a known channel by hand (or a t.me link)
python -m app.ingestion.add_channel https://t.me/SoloDevChronicles

# link-graph: drain the frontier, snowball outward
python -m app.ingestion.crawl --link-graph --max-depth 2 --limit 30
# deep history scan (for important seeds)
python -m app.ingestion.crawl --link-graph --limit 5 --messages 1000
```

### 2. Analyze (local LLM + scoring)

```bash
python -m app.analysis.run --limit 200
```

Classifies, summarizes, scores each channel with messages but no analysis, and
mirrors it into Meilisearch.

### 3. Graph metrics

```bash
python -m app.graph.metrics       # pagerank, betweenness, clusters + rescore
python -m app.graph.backfill_edges  # rebuild edges from already-stored messages
```

`metrics` also recomputes influence-based `final_score` and re-syncs Meili.

### 4. Search index

```bash
python -m app.search.reindex      # bulk-load Postgres → Meilisearch (one-time / rebuild)
```

### 5. Serve the API

```bash
uvicorn app.api.main:app --port 8000
```

---

## Configuration

Pipeline config lives in `.env` (see `.env.example`); deployment config in
`.env.prod` (see `.env.prod.example`). Key variables:

| Variable                   | Meaning |
| -------------------------- | ------- |
| `TG_API_ID` / `TG_API_HASH`| Telegram app creds (my.telegram.org) |
| `TG_SESSION_STRING`        | Saved login (from `--print-session`) |
| `TG_MIN_DELAY_SECONDS` / `TG_JITTER_SECONDS` | Throttle between API calls |
| `TG_MESSAGES_PER_CHANNEL`  | Default messages sampled per channel |
| `TG_MAX_CHANNELS_PER_RUN`  | Per-run channel cap |
| `TG_ALLOW_JOIN`            | Must stay `false` — crawler refuses to join |
| `DATABASE_URL`             | Postgres connection (URL or keyword form) |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | Local LLM endpoint + model |
| `MEILI_URL` / `MEILI_MASTER_KEY` | Meilisearch (blank URL → Postgres FTS fallback) |
| `CORS_ORIGINS`             | Allowed frontend origin(s) for the API |

---

## How search works

Search runs through **Meilisearch** (typo tolerance, word/proximity ranking).
Documents are built from title, username, summary, category, and
why-recommended. Ranking is text relevance first, then `final_score` as a
tie-breaker. **If Meilisearch is unconfigured or down, search transparently
falls back to Postgres full-text search** — the app never breaks. New channels
are pushed into Meili automatically by the analyzer; `reindex` backfills.

## How the graph works

Every harvested reference (t.me link, @mention, forwarded-from channel) is stored
as a weighted edge in `channel_edges`. The metrics job builds a directed graph
and computes per channel:

- **in/out-degree** — how referenced / how referencing
- **PageRank** — centrality / influence (hubs)
- **betweenness** — bridges between communities
- **cluster** — Louvain community detection

These power the `/graph` API and the interactive frontend visualization.

## How scoring works

```
final = quality·40% + activity·30% + influence·20% + freshness·10%
```

- **quality** — LLM usefulness (spam penalized, richer output scores higher)
- **activity** — message volume, image ratio, low repetition
- **influence** — normalized PageRank (network importance), replaces raw member count
- **freshness** — recency of the newest sampled message

Influence comes from the graph, so `app.graph.metrics` recomputes `final_score`
after each run.

---

## HTTP API reference

All endpoints are **GET** and **read-only**. Base path is the API server.

| Endpoint                | Returns |
| ----------------------- | ------- |
| `GET /health`           | `{status: ok}` |
| `GET /search?q=&limit=` | Ranked channel summaries |
| `GET /channel/{id}`     | Full channel detail + sample messages + analytics |
| `GET /categories`       | Categories with channel counts |
| `GET /stats`            | Pipeline metrics (channels, frontier, analysis progress) |
| `GET /graph?limit=&cluster_id=` | Nodes + edges for the viz |
| `GET /graph/hubs`       | Most influential channels (PageRank) |
| `GET /graph/bridges`    | Channels connecting clusters (betweenness) |
| `GET /graph/clusters`   | Community summaries |

Interactive docs at `/docs` (disabled in production via `CORS_ORIGINS`).

The Next.js frontend proxies these under `/api/*`, so the FastAPI service never
needs public exposure.

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
