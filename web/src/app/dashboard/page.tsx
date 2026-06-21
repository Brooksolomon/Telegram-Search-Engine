import { getStats } from "@/lib/api";
import { categoryLabel } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { RefreshButton } from "@/components/RefreshButton";
import type { StatsOut } from "@/lib/types";

export const dynamic = "force-dynamic";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function BigStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "accent" | "warn" | "info" | "danger";
}) {
  const color =
    accent === "warn"
      ? "text-warn"
      : accent === "info"
        ? "text-info"
        : accent === "danger"
          ? "text-danger"
          : "text-accent";
  return (
    <div className="panel p-5">
      <div className="mono-label">{label}</div>
      <div className={`mt-2 font-mono text-3xl font-semibold ${color}`}>
        {value}
      </div>
      {sub && <div className="mt-1 font-mono text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function Bar({
  label,
  value,
  total,
  tone = "bg-accent",
}: {
  label: string;
  value: number;
  total: number;
  tone?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="mono-label w-24 shrink-0 normal-case">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right font-mono text-xs text-fg">
        {fmt(value)}
      </span>
    </div>
  );
}

export default async function DashboardPage() {
  let stats: StatsOut | null = null;
  try {
    stats = await getStats();
  } catch {
    stats = null;
  }

  if (!stats) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold text-fg-bright">Dashboard</h1>
        <div className="mt-6">
          <EmptyState
            title="backend unavailable"
            hint="Start the FastAPI server to load pipeline stats."
          />
        </div>
      </div>
    );
  }

  const frontierTotal =
    stats.frontier_pending +
    stats.frontier_done +
    stats.frontier_failed +
    stats.frontier_skipped;
  const analyzeTotal = stats.analyzed + stats.pending_analysis;
  const catTotal = stats.categories.reduce((s, c) => s + c.channel_count, 0);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="mb-1 font-mono text-xs text-accent">pipeline</div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg-bright">
            Dashboard
          </h1>
        </div>
        <RefreshButton />
      </div>

      {/* Headline numbers */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BigStat label="channels indexed" value={fmt(stats.total_channels)} />
        <BigStat
          label="analyzed"
          value={fmt(stats.analyzed)}
          sub={`${stats.pending_analysis} pending`}
          accent="info"
        />
        <BigStat
          label="queued (frontier)"
          value={fmt(stats.frontier_pending)}
          sub="link-graph leads"
          accent="warn"
        />
        <BigStat
          label="messages sampled"
          value={fmt(stats.total_messages)}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <BigStat
          label="crawled 24h"
          value={fmt(stats.crawled_24h)}
          accent="accent"
        />
        <BigStat label="marketplaces" value={fmt(stats.marketplace)} accent="info" />
        <BigStat
          label="flagged spam"
          value={fmt(stats.spam)}
          accent="danger"
        />
      </div>

      {/* Progress panels */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="panel p-5">
          <div className="mono-label mb-3">analysis progress</div>
          <div className="space-y-2">
            <Bar label="analyzed" value={stats.analyzed} total={analyzeTotal} />
            <Bar
              label="pending"
              value={stats.pending_analysis}
              total={analyzeTotal}
              tone="bg-warn"
            />
          </div>
          <p className="mt-3 font-mono text-[11px] text-muted">
            {analyzeTotal > 0
              ? `${Math.round((stats.analyzed / analyzeTotal) * 100)}% of channels with messages are analyzed`
              : "no channels with messages yet"}
          </p>
        </div>

        <div className="panel p-5">
          <div className="mono-label mb-3">frontier queue</div>
          {frontierTotal === 0 ? (
            <p className="font-mono text-[11px] text-muted">
              {"// empty — run a keyword crawl to seed it"}
            </p>
          ) : (
            <div className="space-y-2">
              <Bar
                label="pending"
                value={stats.frontier_pending}
                total={frontierTotal}
                tone="bg-warn"
              />
              <Bar
                label="done"
                value={stats.frontier_done}
                total={frontierTotal}
                tone="bg-accent"
              />
              <Bar
                label="failed"
                value={stats.frontier_failed}
                total={frontierTotal}
                tone="bg-danger"
              />
              <Bar
                label="skipped"
                value={stats.frontier_skipped}
                total={frontierTotal}
                tone="bg-border-bright"
              />
            </div>
          )}
          <p className="mt-3 font-mono text-[11px] text-muted">
            {stats.keywords_tracked} keyword queries crawled
          </p>
        </div>
      </div>

      {/* Category distribution */}
      <div className="mt-4 panel p-5">
        <div className="mono-label mb-3">channels by category</div>
        {stats.categories.length === 0 ? (
          <p className="font-mono text-[11px] text-muted">
            {"// no analyzed channels yet"}
          </p>
        ) : (
          <div className="space-y-2">
            {stats.categories.map((c) => (
              <Bar
                key={c.category}
                label={categoryLabel(c.category)}
                value={c.channel_count}
                total={catTotal}
                tone={c.category === "spam" ? "bg-danger" : "bg-accent"}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
