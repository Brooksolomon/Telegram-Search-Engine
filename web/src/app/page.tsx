import Link from "next/link";
import { SearchBar } from "@/components/SearchBar";
import { listCategories } from "@/lib/api";
import { categoryLabel } from "@/lib/format";
import type { CategoryOut } from "@/lib/types";

export const dynamic = "force-dynamic";

const EXAMPLES = ["phones ethiopia", "crypto signals", "addis jobs", "car market"];

export default async function HomePage() {
  let categories: CategoryOut[] = [];
  let backendDown = false;
  try {
    categories = await listCategories();
  } catch {
    backendDown = true;
  }

  return (
    <div className="mx-auto max-w-3xl pt-10 sm:pt-20">
      <div className="mb-2 font-mono text-xs text-accent">
        telegram discovery engine
      </div>
      <h1 className="text-3xl font-semibold leading-tight tracking-tight text-fg-bright sm:text-4xl">
        Find the channels that actually
        <br className="hidden sm:block" /> matter — ranked, not just listed.
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
        Channelscope discovers public Telegram channels, reads what they post,
        and ranks them by activity, quality, and freshness — with a plain-English
        reason for every recommendation.
      </p>

      <div className="mt-8">
        <SearchBar size="lg" autoFocus />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-xs text-muted">
        <span className="text-muted/60">try:</span>
        {EXAMPLES.map((ex) => (
          <Link
            key={ex}
            href={`/search?q=${encodeURIComponent(ex)}`}
            className="rounded border border-border px-2 py-1 transition-colors hover:border-accent/40 hover:text-accent"
          >
            {ex}
          </Link>
        ))}
      </div>

      <div className="mt-16">
        <div className="mb-3 flex items-center justify-between">
          <span className="mono-label">browse by category</span>
          <Link
            href="/categories"
            className="font-mono text-xs text-muted hover:text-accent"
          >
            all →
          </Link>
        </div>

        {backendDown ? (
          <div className="panel px-4 py-6 font-mono text-xs text-danger">
            {"// backend offline — start FastAPI on "}
            {process.env.FASTAPI_URL ?? "http://localhost:8000"}
          </div>
        ) : categories.length === 0 ? (
          <div className="panel px-4 py-6 font-mono text-xs text-muted">
            {"// no analyzed channels yet — run the crawler + analyzer"}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {categories.map((c) => (
              <Link
                key={c.category}
                href={`/categories#${c.category}`}
                className="panel flex items-center justify-between px-3 py-2.5 transition-colors hover:border-border-bright hover:bg-surface-2/60"
              >
                <span className="text-sm text-fg">{categoryLabel(c.category)}</span>
                <span className="font-mono text-xs text-muted">
                  {c.channel_count}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
