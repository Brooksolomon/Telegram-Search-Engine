import { scoreColor } from "@/lib/format";

export function ScoreRing({ score }: { score: number | null }) {
  const s = Math.max(0, Math.min(100, Math.round(score ?? 0)));
  const color = scoreColor(score);
  const stroke =
    s >= 70 ? "#3ddc97" : s >= 45 ? "#f5a623" : "#ff5c5c";
  const circ = 2 * Math.PI * 18;
  const dash = (s / 100) * circ;
  return (
    <div className="relative h-12 w-12 shrink-0">
      <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90">
        <circle cx="22" cy="22" r="18" fill="none" stroke="#222a36" strokeWidth="3" />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-mono text-xs font-semibold ${color}`}
      >
        {s}
      </span>
    </div>
  );
}

export function ScoreBar({
  label,
  score,
}: {
  label: string;
  score: number | null;
}) {
  const s = Math.max(0, Math.min(100, Math.round(score ?? 0)));
  const fill =
    s >= 70 ? "bg-accent" : s >= 45 ? "bg-warn" : "bg-danger";
  return (
    <div className="flex items-center gap-3">
      <span className="mono-label w-20 shrink-0">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full ${fill}`} style={{ width: `${s}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right font-mono text-xs text-fg">{s}</span>
    </div>
  );
}
