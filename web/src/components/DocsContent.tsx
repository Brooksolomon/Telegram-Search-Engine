"use client";

import { useEffect, useState } from "react";

const REPO =
  process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/your/telegram-search-engine";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "Architecture" },
  { id: "config", label: "Configuration" },
  { id: "pipeline", label: "Pipeline Commands" },
  { id: "api", label: "API Reference" },
  { id: "search", label: "How Search Works" },
  { id: "graph", label: "How Graph Works" },
  { id: "scoring", label: "How Scoring Works" },
  { id: "safety", label: "Safety / ToS" },
  { id: "deploy", label: "Deployment" },
];

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-surface p-3 font-mono text-[12px] leading-relaxed text-fg">
      <code>{children}</code>
    </pre>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border pt-8 first:border-0 first:pt-0">
      <h2 className="mb-3 font-mono text-lg font-semibold text-fg-bright">
        <span className="text-accent">#</span> {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-fg">{children}</div>
    </section>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 space-y-2">
      <h3 className="font-mono text-sm font-semibold text-fg-bright">{title}</h3>
      <div className="ml-2 space-y-2">{children}</div>
    </div>
  );
}

export function DocsContent() {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 font-mono text-xs text-accent">documentation</div>
      <h1 className="text-2xl font-semibold tracking-tight text-fg-bright">
        How it works
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Complete reference for Telegram Search Engine: architecture, configuration, pipeline
        commands, API endpoints, and how search, graphs, and scoring work.
      </p>

      <div className="mt-8 gap-8 lg:flex">
        {/* Sidebar */}
        <aside className="mb-6 lg:mb-0 lg:w-48 lg:shrink-0">
          <nav className="sticky top-24 flex flex-wrap gap-1.5 lg:flex-col lg:gap-0.5">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`rounded px-2.5 py-1.5 font-mono text-xs transition-colors ${
                  active === s.id
                    ? "bg-surface-2 text-accent"
                    : "text-muted hover:text-fg-bright"
                }`}
              >
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-8">
          <Section id="overview" title="Overview">
            <p>
              A self-hosted engine that <strong className="text-fg-bright">discovers, analyzes, ranks, and maps</strong> public
              Telegram channels. It reads public channels with a residential IP, classifies them with a local LLM, scores by quality + activity + influence + freshness, and builds an interactive graph of how they reference each other.
            </p>
            <p>
              Open source, fully self-hosted. One{" "}
              <code className="rounded bg-surface px-1 font-mono text-[12px] text-accent">
                docker compose up
              </code>{" "}
              runs the whole stack. Use as a data layer for structured Telegram data, or run the web UI as a discovery product.
            </p>
            <p className="text-muted">
              This demo is read-only over a frozen snapshot of tech-community channels.
            </p>
          </Section>

          <Section id="architecture" title="Architecture">
            <p>Two deliberately separated layers:</p>
            <ul className="ml-4 list-disc space-y-1 text-muted marker:text-accent">
              <li>
                <strong className="text-fg">Pipeline</strong> (crawl → analyze → graph): runs on your machine with residential IP + GPU. Writes to Postgres.
              </li>
              <li>
                <strong className="text-fg">Serving layer</strong> (web + API + search): runs anywhere via Docker, reads only.
              </li>
            </ul>
            <Code>{`YOUR MACHINE (residential IP + GPU)
  ingestion (Telethon)  ──┐
  analysis  (Ollama)    ──┼──► Postgres ──► API (FastAPI) ──► web (Next.js)
  graph     (networkx)  ──┘       └─────► Meilisearch`}</Code>
            <p className="text-muted">
              Pipeline reads public channels with Telethon, stores in Postgres, analyzes with Ollama, computes graph metrics with networkx. Serving layer reads Postgres / Meilisearch, exposes HTTP API, serves web UI.
            </p>
          </Section>

          <Section id="config" title="Configuration">
            <p>Set environment variables in <code className="rounded bg-surface px-1 font-mono text-[12px] text-accent">.env</code> (dev) or <code className="rounded bg-surface px-1 font-mono text-[12px] text-accent">.env.prod</code> (production).</p>

            <SubSection title="Required">
              <div className="space-y-2 text-xs">
                <div>
                  <strong className="text-fg">TG_API_ID</strong> (int) — Telegram app ID from{" "}
                  <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">my.telegram.org</a>
                </div>
                <div>
                  <strong className="text-fg">TG_API_HASH</strong> (string) — Telegram app hash from my.telegram.org
                </div>
                <div>
                  <strong className="text-fg">TG_SESSION_STRING</strong> (string) — Saved Telegram session (from <code className="rounded bg-surface px-1 font-mono text-[11px] text-accent">--print-session</code>)
                </div>
                <div>
                  <strong className="text-fg">DATABASE_URL</strong> (string) — PostgreSQL connection (e.g., <code className="rounded bg-surface px-1 font-mono text-[11px] text-accent">postgresql://user:pass@localhost/tg_db</code>)
                </div>
              </div>
            </SubSection>

            <SubSection title="Telegram Crawl">
              <div className="space-y-2 text-xs">
                <div><strong className="text-fg">TG_MIN_DELAY_SECONDS</strong> (float, default 4.0) — Min delay between API calls</div>
                <div><strong className="text-fg">TG_JITTER_SECONDS</strong> (float, default 3.0) — Random jitter added to delay</div>
                <div><strong className="text-fg">TG_MESSAGES_PER_CHANNEL</strong> (int, default 40) — Posts sampled per channel</div>
                <div><strong className="text-fg">TG_MAX_CHANNELS_PER_RUN</strong> (int, default 50) — Safety cap per run</div>
                <div><strong className="text-fg">TG_ALLOW_JOIN</strong> (bool, default false) — **Must be false.** Crawler refuses to join.</div>
              </div>
            </SubSection>

            <SubSection title="LLM & Search">
              <div className="space-y-2 text-xs">
                <div><strong className="text-fg">OLLAMA_BASE_URL</strong> (string, default http://localhost:11434) — Ollama endpoint</div>
                <div><strong className="text-fg">OLLAMA_MODEL</strong> (string, default llama3.1:8b) — Model name</div>
                <div><strong className="text-fg">MEILI_URL</strong> (string, default http://localhost:7700) — Meilisearch endpoint (blank = use Postgres FTS fallback)</div>
                <div><strong className="text-fg">MEILI_MASTER_KEY</strong> (string) — Meilisearch admin key</div>
              </div>
            </SubSection>

            <SubSection title="API Server">
              <div className="space-y-2 text-xs">
                <div><strong className="text-fg">API_HOST</strong> (string, default 0.0.0.0) — Bind address</div>
                <div><strong className="text-fg">API_PORT</strong> (int, default 8000) — Port</div>
                <div><strong className="text-fg">CORS_ORIGINS</strong> (string) — Comma-separated allowed frontend origins. Empty in dev (allows all); set in production.</div>
              </div>
            </SubSection>
          </Section>

          <Section id="pipeline" title="Pipeline Commands">
            <p>All commands run from repo root with venv active. From your machine with residential IP + GPU.</p>

            <SubSection title="0. Capture Telegram Session (one-time)">
              <Code>{`python -m app.ingestion.crawl --print-session`}</Code>
              <p className="text-muted">Interactive login. Copy printed session string into TG_SESSION_STRING in .env.</p>
            </SubSection>

            <SubSection title="1a. Crawl by Keywords">
              <Code>{`python -m app.ingestion.crawl --keywords phones addis crypto jobs`}</Code>
              <p className="text-muted">
                Search each keyword, deduplicate by tg_id, sample ~40 messages, store in Postgres, enqueue discovered refs into frontier (depth 1).
              </p>
              <div className="text-xs text-muted">
                <div>• Caps at TG_MAX_CHANNELS_PER_RUN</div>
                <div>• Records edges (t.me links, @mentions, forwards)</div>
              </div>
            </SubSection>

            <SubSection title="1b. DB-driven Keyword Expansion">
              <Code>{`python -m app.ingestion.crawl --from-db --max-queries 20 --min-age-hours 24`}</Code>
              <p className="text-muted">
                Generate bases × modifiers, pick due queries (crawled >24h ago), run them, record in keyword_runs. Enables iterative discovery without re-crawling.
              </p>
              <div className="text-xs text-muted">
                <div>• --max-queries: limit this run (default 20)</div>
                <div>• --min-age-hours: skip recent crawls (default 24.0)</div>
              </div>
            </SubSection>

            <SubSection title="1c. Seed a Known Channel">
              <Code>{`python -m app.ingestion.add_channel solodevchronicles
python -m app.ingestion.add_channel https://t.me/SoloDevChronicles
python -m app.ingestion.add_channel @channel1 https://t.me/channel2`}</Code>
              <p className="text-muted">
                Add channels to frontier at depth 0. Picked up by next --link-graph crawl. Accepts usernames, @handles, t.me URLs.
              </p>
            </SubSection>

            <SubSection title="2. Link-graph Discovery">
              <Code>{`python -m app.ingestion.crawl --link-graph --max-depth 2 --limit 30
python -m app.ingestion.crawl --link-graph --limit 5 --messages 1000`}</Code>
              <p className="text-muted">
                Drain frontier queue: resolve candidates, sample messages, extract edges, enqueue refs up to max-depth.
              </p>
              <div className="text-xs text-muted">
                <div>• --link-graph: drain frontier instead of keyword search</div>
                <div>• --max-depth: max hops from seed (default 2). Children at max-depth don't harvest further.</div>
                <div>• --limit: max candidates to process (default 30)</div>
                <div>• --messages: override TG_MESSAGES_PER_CHANNEL (high value for deep history on seeds)</div>
              </div>
            </SubSection>

            <SubSection title="3. Analyze with LLM">
              <Code>{`python -m app.analysis.run --limit 200`}</Code>
              <p className="text-muted">
                Pull un-analyzed channels, classify with Ollama, compute quality/activity/freshness scores, upsert analysis, mirror into Meilisearch.
              </p>
              <div className="text-xs text-muted">
                <div>• --limit: max channels per run (default 50)</div>
                <div>• Non-fatal if Meili down — Postgres is source of truth</div>
              </div>
            </SubSection>

            <SubSection title="4. Compute Graph Metrics">
              <Code>{`python -m app.graph.metrics`}</Code>
              <p className="text-muted">
                Build networkx directed graph from edges, compute PageRank/betweenness/Louvain clusters, write to channel_graph, rescore all channels with influence, re-sync Meili.
              </p>
              <div className="text-xs text-muted">
                <div>• No arguments</div>
                <div>• Recomputes: final_score = quality·40% + activity·30% + influence·20% + freshness·10%</div>
              </div>
            </SubSection>

            <SubSection title="5. Backfill Edges">
              <Code>{`python -m app.graph.backfill_edges`}</Code>
              <p className="text-muted">
                Rebuild edges from stored messages (no Telegram API calls). Extracts t.me links and @mentions from message text. Useful after bulk imports.
              </p>
            </SubSection>

            <SubSection title="6. Reindex Search">
              <Code>{`python -m app.search.reindex`}</Code>
              <p className="text-muted">
                Bulk-load all analyzed channels from Postgres into Meilisearch. Use once after setup or to rebuild index.
              </p>
            </SubSection>

            <SubSection title="7. Run API Server">
              <Code>{`uvicorn app.api.main:app --reload --port 8000`}</Code>
              <p className="text-muted">
                Start read-only FastAPI server. All endpoints are GET. CORS restricted to CORS_ORIGINS.
              </p>
            </SubSection>
          </Section>

          <Section id="api" title="API Reference">
            <p>Base: <code className="rounded bg-surface px-1 font-mono text-[12px] text-accent">http://localhost:8000</code>. All endpoints are read-only GET.</p>

            <SubSection title="GET /health">
              <p>Health check.</p>
              <Code>{`curl http://localhost:8000/health
# {"status": "ok"}`}</Code>
            </SubSection>

            <SubSection title="GET /search">
              <p>Search channels by query. Typo-tolerant ranking via Meilisearch (or Postgres FTS fallback).</p>
              <div className="text-xs text-muted">
                <div><strong>q</strong> (required, string): search query</div>
                <div><strong>limit</strong> (optional, int, default 20, max 100): result count</div>
              </div>
              <Code>{`curl "http://localhost:8000/search?q=crypto&limit=10"
curl "http://localhost:8000/search?q=phones+addis&limit=50"`}</Code>
            </SubSection>

            <SubSection title="GET /channel/{channel_id}">
              <p>Full channel detail: metadata, sample messages (20), analytics, all scores.</p>
              <div className="text-xs text-muted">
                <div><strong>channel_id</strong> (required, path, int): database ID</div>
              </div>
              <Code>{`curl http://localhost:8000/channel/123`}</Code>
            </SubSection>

            <SubSection title="GET /categories">
              <p>List all categories with channel counts.</p>
              <Code>{`curl http://localhost:8000/categories`}</Code>
            </SubSection>

            <SubSection title="GET /stats">
              <p>Pipeline statistics: total channels, analyzed, frontier status.</p>
              <Code>{`curl http://localhost:8000/stats`}</Code>
            </SubSection>

            <SubSection title="GET /graph">
              <p>Channel reference graph: nodes + edges. Paginated by score, optionally filtered by cluster.</p>
              <div className="text-xs text-muted">
                <div><strong>limit</strong> (optional, int, default 250, max 1000): max nodes</div>
                <div><strong>cluster_id</strong> (optional, int): filter to Louvain cluster</div>
              </div>
              <Code>{`curl "http://localhost:8000/graph?limit=500"
curl "http://localhost:8000/graph?limit=250&cluster_id=5"`}</Code>
            </SubSection>

            <SubSection title="GET /graph/hubs">
              <p>Most influential channels (highest PageRank).</p>
              <div className="text-xs text-muted">
                <div><strong>limit</strong> (optional, int, default 20, max 100): count</div>
              </div>
              <Code>{`curl "http://localhost:8000/graph/hubs?limit=50"`}</Code>
            </SubSection>

            <SubSection title="GET /graph/bridges">
              <p>Channels bridging communities (highest betweenness centrality).</p>
              <div className="text-xs text-muted">
                <div><strong>limit</strong> (optional, int, default 20, max 100): count</div>
              </div>
              <Code>{`curl "http://localhost:8000/graph/bridges?limit=20"`}</Code>
            </SubSection>

            <SubSection title="GET /graph/clusters">
              <p>Louvain communities with aggregate stats and top channels.</p>
              <Code>{`curl http://localhost:8000/graph/clusters`}</Code>
            </SubSection>
          </Section>

          <Section id="search" title="How Search Works">
            <p>
              Search ranks via <strong className="text-fg-bright">Meilisearch</strong> (typo tolerance, word/proximity), with automatic fallback to Postgres FTS if Meili is down or unconfigured.
            </p>
            <SubSection title="Meilisearch Mode">
              <div className="text-muted text-xs space-y-1">
                <div>• Indexes: title, username, summary, category, why_recommended</div>
                <div>• Ranking: text relevance (fuzzy match + word/proximity) first, then final_score tie-breaker</div>
                <div>• Channels pushed automatically by analyzer; bulk reindex available</div>
              </div>
            </SubSection>
            <SubSection title="Postgres FTS Fallback">
              <div className="text-muted text-xs space-y-1">
                <div>• Used if MEILI_URL blank or Meili unreachable</div>
                <div>• Full-text search via GIN indexes (title, username, summary)</div>
                <div>• Ranked by ts_rank, then final_score</div>
                <div>• Slightly slower but ensures search always works</div>
              </div>
            </SubSection>
          </Section>

          <Section id="graph" title="How Graph Works">
            <p>
              Channel-to-channel references become weighted directed edges. Graph metrics compute influence, bridges, and communities.
            </p>
            <SubSection title="Edge Types">
              <div className="text-muted text-xs space-y-1">
                <div>• t.me links: explicit channel references</div>
                <div>• @mentions: channel usernames in posts</div>
                <div>• forwards: message forwarded from another channel (live crawls only)</div>
              </div>
            </SubSection>
            <SubSection title="Computation">
              <div className="text-muted text-xs space-y-1">
                <div>• PageRank: centrality/hub score</div>
                <div>• Betweenness: bridges communities (on undirected projection)</div>
                <div>• Louvain: community detection (undirected projection); falls back to connected components</div>
                <div>• In/out-degree: reference counts</div>
              </div>
            </SubSection>
          </Section>

          <Section id="scoring" title="How Scoring Works">
            <Code>{`final_score = quality·40% + activity·30% + influence·20% + freshness·10%`}</Code>
            <div className="space-y-2 text-xs">
              <div>
                <strong className="text-fg">quality</strong> (Ollama): channel usefulness. Spam penalized; informative content scores higher. Range 0–100.
              </div>
              <div>
                <strong className="text-fg">activity</strong> (messages): volume, image ratio, low repetition. Range 0–100.
              </div>
              <div>
                <strong className="text-fg">influence</strong> (PageRank): normalized network centrality. Not member count. Range 0–100.
              </div>
              <div>
                <strong className="text-fg">freshness</strong> (timestamps): recency of newest sampled message. Range 0–100.
              </div>
            </div>
            <p className="text-muted mt-2">
              Computed by analyzer on first analysis. Graph metrics recompute influence and refresh final_score for all channels. Scores synced into Meili for search ranking.
            </p>
          </Section>

          <Section id="safety" title="Safety / ToS">
            <p>
              Crawler is <strong className="text-fg-bright">intentionally read-only and throttled</strong>. Never joins, honors rate limits, runs on dedicated aged account on residential IP.
            </p>
            <p className="text-muted">
              Bans come from behavior (mass-join, ignoring limits), not from reading public channels carefully. Keep crawl volume modest. Store session string for fast swaps.
            </p>
            <div className="text-muted text-xs space-y-1">
              <div>✓ Read-only (never joins)</div>
              <div>✓ Throttled by construction (TG_MIN_DELAY_SECONDS + TG_JITTER_SECONDS)</div>
              <div>✓ Residential IP + dedicated account</div>
              <div>✓ TG_ALLOW_JOIN must be false (enforced)</div>
            </div>
          </Section>

          <Section id="deploy" title="Deployment">
            <p>
              See <code className="rounded bg-surface px-1 font-mono text-[12px] text-accent">DEPLOY.md</code> in repo for single-VPS Docker deploy (Caddy + HTTPS), <code className="rounded bg-surface px-1 font-mono text-[12px] text-accent">MIGRATE_DB.md</code> for moving data into dockerized Postgres, and <code className="rounded bg-surface px-1 font-mono text-[12px] text-accent">server-infra/README.md</code> for multi-project reverse proxy setup.
            </p>
            <Code>{`git clone ${REPO.replace(/^https?:\/\//, "")}
cp .env.prod.example .env.prod
# fill in: TG_API_ID, TG_API_HASH, TG_SESSION_STRING, DATABASE_URL, etc.
docker compose --env-file .env.prod up -d --build`}</Code>
          </Section>

          <div className="border-t border-border pt-6">
            <a
              href={REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-4 py-2 font-mono text-xs text-accent hover:bg-accent/20"
            >
              Full Reference on GitHub ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
