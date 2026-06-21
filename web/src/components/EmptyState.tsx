export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="font-mono text-sm text-muted">
        <span className="text-accent">{"//"}</span> {title}
      </div>
      {hint && <p className="max-w-sm text-xs text-muted/70">{hint}</p>}
    </div>
  );
}
