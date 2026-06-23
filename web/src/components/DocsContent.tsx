"use client";

import { useEffect, useState } from "react";

const REPO =
  process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/your/telegram-search-engine";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "Architecture" },
  { id: "pipeline", label: "Pipeline" },
  { id: "search", label: "Search" },
  { id: "graph", label: "Graph" },
  { id: "scoring", label: "Scoring" },
  { id: "api", label: "API" },
  { id: "selfhost", label: "Self-host" },
  { id: "safety", label: "Safety / ToS" },
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
        Telegram Search Engine discovers, analyzes, ranks, and maps public
        Telegram channels. This page covers the design; the full reference lives
        in the{" "}
        <a href={REPO} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          repo
        </a>
        .
      </p>

      <div className="mt-8 gap-8 lg:flex">
        {/* Sidebar */}
        <aside className="mb-6 lg:mb-0 lg:w-44 lg:shrink-0">
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
              Most Telegram tools are dumb scrapers. This one{" "}
              <strong className="text-fg-bright">understands and maps</strong>{" "}
              communities: it discovers channels, reads what they post, classifies
              and summarizes them with a local LLM, ranks them by usefulness and
              network influence, and builds an interactive graph of how they
              reference each other.
            </p>
            <p>
              It&apos;s open source and self-hosted — one{" "}
              <code className="rounded bg-surface px-1 font-mono text-[12px] text-accent">
                docker compose up
              </code>{" "}
              runs the whole stack. Use it as a data layer for any app that needs
              structured Telegram data, or run the web UI as a discovery product.
            </p>
            <p className="text-muted">
              This live site is a read-only demo over a frozen snapshot of
              tech-community channels.
            </p>
          </Section>

          <Section id="architecture" title="Architecture">
            <p>Two deliberately separated halves:</p>
            <ul className="ml-4 list-disc space-y-1 text-muted marker:text-accent">
              <li>
                <strong className="text-fg">The pipeline</strong> (crawl →
                analyze → graph) runs on your own machine — it needs a residential
                IP and a GPU for the local LLM. It writes to Postgres.
              </li>
              <li>
                <strong className="text-fg">The serving layer</strong> (web +
                read-only API + search) runs anywhere via Docker and only reads
                the database.
              </li>
            </ul>
            <Code>{`ingestion (Telethon) ─┐
analysis  (Ollama)   ─┼─► Postgres ──► API (FastAPI, read-only) ──► web (Next.js)
graph     (networkx) ─┘        └─────► Meilisearch ──────────────┘`}</Code>
          </Section>

          <Section id="pipeline" title="Pipeline">
            <p>
              The pipeline is a set of CLI commands run on your machine against
              your own Telegram account.
            </p>
            <p className="font-mono text-xs text-muted">discover + sample</p>
            <Code>{`# keyword discovery (with DB-driven expansion)
python -m app.ingestion.crawl --from-db --max-queries 20

# seed a known channel, then snowball via the link graph
python -m app.ingestion.add_channel https://t.me/SomeChannel
python -m app.ingestion.crawl --link-graph --max-depth 2 --limit 30`}</Code>
            <p className="font-mono text-xs text-muted">analyze + rank + index</p>
            <Code>{`python -m app.analysis.run --limit 200   # LLM classify + score
python -m app.graph.metrics              # pagerank, clusters, rescore
python -m app.search.reindex             # sync into Meilisearch`}</Code>
          </Section>

          <Section id="search" title="Search">
            <p>
              Search runs through <strong className="text-fg-bright">Meilisearch</strong>{" "}
              — typo-tolerant, with word and proximity ranking over each
              channel&apos;s title, handle, summary, and category. Results are
              ranked by text relevance first, then by the channel&apos;s quality
              score.
            </p>
            <p className="text-muted">
              If Meilisearch is unavailable, search transparently falls back to
              Postgres full-text search, so it never breaks.
            </p>
          </Section>

          <Section id="graph" title="Graph">
            <p>
              Every reference a channel makes — t.me links, @mentions, and
              forwarded-from channels — becomes a weighted edge. From that graph
              we compute, per channel:
            </p>
            <ul className="ml-4 list-disc space-y-1 text-muted marker:text-accent">
              <li><strong className="text-fg">PageRank</strong> — influence / hubs</li>
              <li><strong className="text-fg">Betweenness</strong> — bridges between communities</li>
              <li><strong className="text-fg">Louvain clusters</strong> — community detection</li>
            </ul>
            <p>
              These power the interactive network visualization on the{" "}
              <a href="/graph" className="text-accent hover:underline">graph page</a>.
            </p>
          </Section>

          <Section id="scoring" title="Scoring">
            <p>Each channel gets a 0–100 score blending four signals:</p>
            <Code>{`final = quality·40%  +  activity·30%  +  influence·20%  +  freshness·10%`}</Code>
            <ul className="ml-4 list-disc space-y-1 text-muted marker:text-accent">
              <li><strong className="text-fg">quality</strong> — LLM usefulness (spam penalized)</li>
              <li><strong className="text-fg">activity</strong> — volume, images, low repetition</li>
              <li><strong className="text-fg">influence</strong> — normalized PageRank (network importance)</li>
              <li><strong className="text-fg">freshness</strong> — recency of the latest post</li>
            </ul>
          </Section>

          <Section id="api" title="API">
            <p>All endpoints are read-only GETs:</p>
            <Code>{`GET /search?q=&limit=     ranked channels
GET /channel/{id}         full profile + analytics
GET /categories           categories + counts
GET /stats                pipeline metrics
GET /graph                nodes + edges
GET /graph/hubs           most influential
GET /graph/bridges        cluster connectors
GET /graph/clusters       community summaries`}</Code>
          </Section>

          <Section id="selfhost" title="Self-host">
            <p>
              Clone the repo, bring your own Telegram account and a machine with a
              GPU (for the local LLM), and run the stack:
            </p>
            <Code>{`git clone ${REPO.replace(/^https?:\/\//, "")}
cp .env.prod.example .env.prod   # fill in values
docker compose --env-file .env.prod up -d --build`}</Code>
            <p>
              Full setup, deployment, and data-migration guides are in the{" "}
              <a href={REPO} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                repository
              </a>{" "}
              (README, DOCS, DEPLOY, CONTRIBUTING).
            </p>
          </Section>

          <Section id="safety" title="Safety / ToS">
            <p>
              The crawler is intentionally <strong className="text-fg-bright">read-only and throttled</strong>.
              It never joins channels, honors Telegram&apos;s rate limits in full,
              and is meant to run on a dedicated, aged account on a residential IP.
            </p>
            <p className="text-muted">
              Bans come from behavior (mass-joining, ignoring rate limits), not
              from reading public channels carefully. Keep crawl volume modest.
            </p>
          </Section>

          <div className="border-t border-border pt-6">
            <a
              href={REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-4 py-2 font-mono text-xs text-accent hover:bg-accent/20"
            >
              View on GitHub ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
