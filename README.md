# Telegram Discovery Engine

Discovers, analyzes, and ranks public Telegram channels by topic and usefulness.

Pipeline: **discover** (keyword search, read-only) → **sample** (recent messages, no join) → **analyze** (local LLM classification, summary, "why recommended" + heuristic scoring) → **search/rank** (Postgres FTS + ranking blend) → **serve** (FastAPI).

```
app/
  config.py              # env-driven settings
  db/
    database.py          # pooled Postgres connection
    repository.py        # all SQL (shared by worker, analysis, API)
  ingestion/
    throttle.py          # structural rate limiter (ban defense)
    telegram_client.py   # read-only Telethon wrapper (no join, FloodWait-safe)
    cleaning.py          # spam/empty filtering
    crawl.py             # crawl entrypoint
  analysis/
    ollama_client.py     # local LLM (Ollama) JSON client
    analyzer.py          # classification + summary + why-recommended
    scoring.py           # activity / member / freshness / final score
    run.py               # analysis entrypoint
  api/
    main.py              # FastAPI: /search /channel/{id} /categories
    schemas.py
migrations/001_init.sql  # schema + FTS + ranking view
```

## ⚠️ Account safety — read first

This crawler uses an MTProto **user account** because the Bot API cannot
discover or read arbitrary public channels. Bans come from *behavior*, not from
using Telethon. The code is built so the risky behaviors are structurally hard:

- **Read-only, never joins.** Discovery and history work on public entities
  without membership. `TG_ALLOW_JOIN` must stay `false` — the worker refuses to
  start otherwise. Mass-joining is the #1 cause of bans, and we never do it.
- **Throttled by construction.** Every Telegram call passes through a rate
  limiter (`TG_MIN_DELAY_SECONDS` + jitter). FloodWait is always honored in full.
- **Use a dedicated, aged account.** Never your personal number. Before crawling:
  set a profile photo, send a few real messages, let it sit ~a week.
- **One residential IP** matching the SIM's country. No datacenter/rotating proxies.
- **Treat the account as disposable.** Keep a spare number; store
  `TG_SESSION_STRING` so swapping in a replacement takes minutes.

Keep volume low at validation stage (`TG_MAX_CHANNELS_PER_RUN`, a handful of
keywords). You do not need speed.

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then fill in values
```

1. **Telegram API creds** — get `api_id`/`api_hash` at https://my.telegram.org
   → API development tools. Put them in `.env` with the dedicated phone number.
2. **Database** — create the schema on your Supabase Postgres:
   ```bash
   psql "$DATABASE_URL" -f migrations/001_init.sql
   ```
   (Or paste the file into the Supabase SQL editor.) Use the connection-pooler
   URI from Supabase → Project Settings → Database.
3. **Local LLM** — install Ollama and pull a model:
   ```bash
   ollama pull llama3.1:8b   # matches OLLAMA_MODEL in .env
   ```

## Run

**One-time: capture the session string** (interactive login, enter the code Telegram sends):

```bash
python -m app.ingestion.crawl --print-session
# copy the printed value into TG_SESSION_STRING in .env
```

**Crawl (discover + sample):**

```bash
# explicit keywords
python -m app.ingestion.crawl --keywords phones addis market crypto jobs
```

**Keyword expansion (DB-driven, recommended for growth):**

Apply the keyword schema once (seeds English + Amharic terms):

```bash
psql "$DATABASE_URL" -f migrations/002_keywords.sql
```

Then let the crawler generate and crawl queries itself. It combines every
enabled *base* term with same-language *modifiers* (cities, brands), picks the
queries most overdue for a crawl, and records each run so repeat invocations
explore new terms instead of re-crawling the same handful:

```bash
python -m app.ingestion.crawl --from-db --max-queries 20 --min-age-hours 24
```

Edit/extend the term sets in the `keyword_terms` table (kind = `base` or
`modifier`, `lang` = `en`/`am`/…). More terms = wider coverage, all under the
same throttle.

**Link-graph crawling (biggest growth lever):**

Telegram's keyword search is capped, but channels constantly link to, mention,
and forward from each other. The crawler harvests those references — `t.me/…`
links, `@mentions`, and forwarded-from channels — from every channel it samples
and queues them in a **frontier** table. A bounded, depth-limited crawl then
drains that queue, so one seed channel snowballs into many.

Apply the frontier schema once:

```bash
psql "$DATABASE_URL" -f migrations/003_frontier.sql
```

Keyword crawls (`--keywords` / `--from-db`) automatically seed the frontier at
depth 1. Then drain it:

```bash
python -m app.ingestion.crawl --link-graph --max-depth 2 --limit 30
```

`--max-depth` caps how many hops from a seed we'll follow (2 is a good start);
`--limit` caps channels per run. Both keep growth under the global throttle.
Already-known channels and bot/reserved usernames are filtered out, so the
frontier only holds genuinely new, valid leads. Run it repeatedly — each pass
goes wider.

**Add a known channel by hand:**

When you already know a channel (no search needed), seed it straight into the
frontier; the next link-graph crawl resolves, samples, and expands from it:

```bash
python -m app.ingestion.add_channel https://t.me/SoloDevChronicles
python -m app.ingestion.crawl --link-graph --max-depth 2 --limit 30
```

This is the best way to bootstrap a new vertical: one good seed channel snowballs
into its neighborhood via the link graph. (Tech keywords + a SoloDevChronicles
seed are included in `migrations/004_tech_vertical.sql`.)

**Analyze (LLM + scoring):**

```bash
python -m app.analysis.run --limit 50
```

**Serve the API:**

```bash
uvicorn app.api.main:app --reload --port 8000
```

Then:
- `GET /search?q=phones%20ethiopia` → ranked channels
- `GET /channel/{id}` → full profile + sample messages + "why recommended"
- `GET /categories` → categories with channel counts

Interactive docs at `http://localhost:8000/docs`.

## Ranking

```
final_score = activity*0.30 + member*0.20 + quality*0.40 + freshness*0.10
```

- **activity** — message volume, image ratio, low repetition
- **member** — log-scaled member count
- **quality** — LLM usefulness (spam penalized, richer output scores higher)
- **freshness** — recency of newest sampled message

## Search (Meilisearch + Postgres fallback)

Search runs through **Meilisearch** for typo-tolerance, word/proximity ranking,
and speed. Postgres stays the source of truth; analyzed channels are mirrored
into Meili automatically. **If Meili is unconfigured or down, search falls back
to Postgres full-text search with no errors** — so the app always works.

Meili ranking: text relevance first (`words → typo → proximity → exactness`),
then `final_score` descending as the tie-breaker. The Postgres fallback blends
`final_score` (70%) with text relevance (30%).

### Running Meilisearch

```bash
# Docker (simplest)
docker run -d --name meili -p 7700:7700 \
  -e MEILI_MASTER_KEY=devkey getmeili/meilisearch:v1.10

# then set MEILI_URL / MEILI_MASTER_KEY in .env
```

The analyzer auto-creates the index and syncs each channel as it's scored. To
index channels that were analyzed **before** you stood up Meili, run a one-time
bulk reindex from Postgres:

```bash
python -m app.search.reindex
```

To turn Meili off entirely, leave `MEILI_URL` blank — search uses Postgres.

## Graph layer (community network analysis)

Every reference the crawler harvests (t.me links, @mentions, forwards) is stored
as a weighted edge in `channel_edges`. A metrics job builds the directed graph
and computes, per channel: in/out-degree, **PageRank** (influence/hubs),
**betweenness** (bridges between clusters), and **Louvain community** (cluster).

Apply the schema once:

```bash
psql "$DATABASE_URL" -f migrations/005_graph.sql
```

After crawling + analyzing, compute metrics:

```bash
python -m app.graph.metrics
```

This resolves edge targets to known channels, runs the algorithms, and writes
per-channel metrics. Then the frontend `/graph` page shows an interactive
force-directed network (nodes sized by PageRank, colored by cluster) plus panels
for top hubs, bridges, and community breakdown. API endpoints:

- `GET /graph` — nodes + edges for the viz (optional `?cluster_id=`)
- `GET /graph/hubs` — most influential channels
- `GET /graph/bridges` — channels connecting clusters
- `GET /graph/clusters` — community summaries

Re-run `python -m app.graph.metrics` whenever you've crawled more — the graph
gets richer as channels reference each other.

## Continuous refresh (later)

When channels go stale enough that users notice, schedule the crawl + analysis
on a cron (e.g. every few hours). `channels_needing_analysis` already only
re-analyzes channels crawled since their last analysis, so re-running is cheap.

## Next steps

- Thin frontend (search box → ranked results → channel page with the "why" blurb).
- Add a vendor data-API fallback if you ever hit account bans.
- Move to a hosted LLM if local throughput becomes the bottleneck.
