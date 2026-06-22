import Link from "next/link";
import { getGraph, getHubs, getBridges, getClusters } from "@/lib/api";
import { categoryLabel } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { GraphCanvas } from "@/components/GraphCanvas";
import { CategoryBadge } from "@/components/CategoryBadge";
import type { GraphOut, HubOut, ClusterOut } from "@/lib/types";

export const dynamic = "force-dynamic";

function HubRow({ h, metric }: { h: HubOut; metric: "pagerank" | "betweenness" }) {
  const val =
    metric === "pagerank"
      ? ((h.pagerank ?? 0) * 1000).toFixed(1)
      : ((h.betweenness ?? 0) * 100).toFixed(1);
  return (
    <Link
      href={`/channel/${h.id}`}
      className="flex items-center justify-between rounded px-2 py-1.5 transition-colors hover:bg-surface-2/60"
    >
      <div className="min-w-0">
        <div className="truncate text-sm text-fg-bright">{h.title}</div>
        <div className="font-mono text-[10px] text-muted">
          {h.category ? categoryLabel(h.category) : "—"} · in {h.in_degree ?? 0}
        </div>
      </div>
      <span className="ml-3 shrink-0 font-mono text-xs text-accent">{val}</span>
    </Link>
  );
}

export default async function GraphPage() {
  let graph: GraphOut | null = null;
  let hubs: HubOut[] = [];
  let bridges: HubOut[] = [];
  let clusters: ClusterOut[] = [];
  try {
    [graph, hubs, bridges, clusters] = await Promise.all([
      getGraph(250),
      getHubs(15),
      getBridges(15),
      getClusters(),
    ]);
  } catch {
    graph = null;
  }

  const hasGraph = graph && graph.nodes.length > 0;

  return (
    // Break out of the layout's max-width so the graph can use the full viewport.
    <div className="mx-[calc(50%-50vw)] w-screen px-4 sm:px-6">
      <div className="mb-1 font-mono text-xs text-accent">network</div>
      <h1 className="text-2xl font-semibold tracking-tight text-fg-bright">
        Community Graph
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Channels as nodes, references (links, mentions, forwards) as edges. Node
        size is influence (PageRank); color is community cluster.
      </p>

      {!hasGraph ? (
        <div className="mt-6">
          <EmptyState
            title="no graph yet"
            hint="Crawl channels, then run: python -m app.graph.metrics — once channels reference each other, the network appears here."
          />
        </div>
      ) : (
        <>
          <div className="mt-6">
            <GraphCanvas data={graph!} />
          </div>

          <div className="mx-auto mt-6 grid max-w-5xl gap-4 md:grid-cols-2">
            <div className="panel p-5">
              <div className="mono-label mb-2">top hubs · most influential</div>
              <div className="space-y-0.5">
                {hubs.map((h) => (
                  <HubRow key={h.id} h={h} metric="pagerank" />
                ))}
              </div>
            </div>
            <div className="panel p-5">
              <div className="mono-label mb-2">bridges · connect clusters</div>
              {bridges.length === 0 ? (
                <p className="font-mono text-[11px] text-muted">
                  {"// no bridges yet — graph too sparse"}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {bridges.map((h) => (
                    <HubRow key={h.id} h={h} metric="betweenness" />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mx-auto mt-4 max-w-5xl panel p-5">
            <div className="mono-label mb-3">communities</div>
            {clusters.length === 0 ? (
              <p className="font-mono text-[11px] text-muted">
                {"// no clusters yet"}
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {clusters.map((c) => (
                  <div key={c.cluster_id} className="rounded border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-fg-bright">
                        cluster {c.cluster_id}
                      </span>
                      <span className="font-mono text-[10px] text-muted">
                        {c.size} channels
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <CategoryBadge category={c.top_category} />
                    </div>
                    <div className="mt-2 truncate font-mono text-[10px] text-muted">
                      {c.top_titles.slice(0, 3).join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
