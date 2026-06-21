import { categoryLabel } from "@/lib/format";

const TONE: Record<string, string> = {
  crypto: "border-info/30 text-info",
  jobs: "border-accent/30 text-accent",
  phones: "border-warn/30 text-warn",
  spam: "border-danger/30 text-danger",
};

export function CategoryBadge({ category }: { category: string | null }) {
  const tone = (category && TONE[category]) || "border-border-bright text-muted";
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${tone}`}
    >
      {categoryLabel(category)}
    </span>
  );
}
