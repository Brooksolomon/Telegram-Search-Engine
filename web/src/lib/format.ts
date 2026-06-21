export function formatMembers(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function scoreColor(score: number | null): string {
  const s = score ?? 0;
  if (s >= 70) return "text-accent";
  if (s >= 45) return "text-warn";
  return "text-danger";
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export const CATEGORY_LABELS: Record<string, string> = {
  phones: "Phones",
  cars: "Cars",
  crypto: "Crypto",
  jobs: "Jobs",
  real_estate: "Real Estate",
  electronics: "Electronics",
  fashion: "Fashion",
  news: "News",
  mixed: "Mixed",
  spam: "Spam",
};

export function categoryLabel(cat: string | null): string {
  if (!cat) return "Uncategorized";
  return CATEGORY_LABELS[cat] ?? cat;
}
