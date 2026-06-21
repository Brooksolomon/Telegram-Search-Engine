import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md pt-24 text-center">
      <div className="font-mono text-sm text-accent">404</div>
      <h1 className="mt-2 text-2xl font-semibold text-fg-bright">
        channel not found
      </h1>
      <p className="mt-2 text-sm text-muted">
        It may not have been crawled yet, or the id is wrong.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded border border-accent/40 bg-accent/10 px-4 py-2 font-mono text-xs text-accent hover:bg-accent/20"
      >
        ← back to search
      </Link>
    </div>
  );
}
