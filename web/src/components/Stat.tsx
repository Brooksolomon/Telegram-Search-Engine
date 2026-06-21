export function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="panel px-4 py-3">
      <div className="mono-label">{label}</div>
      <div
        className={`mt-1 font-mono text-lg font-semibold ${
          accent ? "text-accent" : "text-fg-bright"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
