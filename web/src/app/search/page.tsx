import { Suspense } from "react";
import { SearchBar } from "@/components/SearchBar";
import { ChannelCard } from "@/components/ChannelCard";
import { EmptyState } from "@/components/EmptyState";
import { searchChannels } from "@/lib/api";
import type { ChannelSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

async function Results({ q }: { q: string }) {
  let channels: ChannelSummary[] = [];
  let error = false;
  try {
    channels = await searchChannels(q, 30);
  } catch {
    error = true;
  }

  if (error) {
    return (
      <EmptyState
        title="backend unavailable"
        hint="Make sure the FastAPI server is running and reachable from the web app."
      />
    );
  }
  if (channels.length === 0) {
    return (
      <EmptyState
        title={`no channels matched "${q}"`}
        hint="Try a broader term, or crawl more keywords into the index."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="font-mono text-xs text-muted">
        {channels.length} result{channels.length === 1 ? "" : "s"} ·
        ranked by score
      </div>
      {channels.map((c, i) => (
        <ChannelCard key={c.id} channel={c} rank={i + 1} />
      ))}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="panel h-28 animate-pulse" />
      ))}
    </div>
  );
}

export default function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = (searchParams.q ?? "").trim();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="sticky top-0 z-10 -mx-4 bg-bg/80 px-4 pb-4 pt-1 backdrop-blur sm:-mx-6 sm:px-6">
        <SearchBar initial={q} />
      </div>

      {!q ? (
        <div className="mt-6">
          <EmptyState
            title="enter a query to search"
            hint="Search by topic, place, or both — e.g. 'phones addis'."
          />
        </div>
      ) : (
        <div className="mt-6">
          <Suspense key={q} fallback={<ResultsSkeleton />}>
            <Results q={q} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
