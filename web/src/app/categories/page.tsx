import Link from "next/link";
import { listCategories } from "@/lib/api";
import { categoryLabel } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import type { CategoryOut } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  let categories: CategoryOut[] = [];
  let error = false;
  try {
    categories = await listCategories();
  } catch {
    error = true;
  }

  const total = categories.reduce((sum, c) => sum + c.channel_count, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1 font-mono text-xs text-accent">index</div>
      <h1 className="text-2xl font-semibold tracking-tight text-fg-bright">
        Categories
      </h1>
      <p className="mt-2 text-sm text-muted">
        {total} analyzed channel{total === 1 ? "" : "s"} across{" "}
        {categories.length} categor{categories.length === 1 ? "y" : "ies"}.
      </p>

      <div className="mt-8">
        {error ? (
          <EmptyState
            title="backend unavailable"
            hint="Start the FastAPI server to load categories."
          />
        ) : categories.length === 0 ? (
          <EmptyState
            title="no analyzed channels yet"
            hint="Run the crawler and analyzer to populate the index."
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {categories.map((c) => (
              <Link
                key={c.category}
                id={c.category}
                href={`/search?q=${encodeURIComponent(c.category)}`}
                className="group panel flex items-center justify-between p-4 transition-colors hover:border-border-bright hover:bg-surface-2/60"
              >
                <div>
                  <div className="font-medium text-fg-bright group-hover:text-accent">
                    {categoryLabel(c.category)}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted">
                    {c.channel_count} channel{c.channel_count === 1 ? "" : "s"}
                  </div>
                </div>
                <span className="font-mono text-xs text-muted group-hover:text-accent">
                  →
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
