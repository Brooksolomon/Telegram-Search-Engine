import Link from "next/link";

export function TopBar() {
  return (
    <header className="flex items-center justify-between border-b border-border py-4">
      <Link href="/" className="group flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded border border-accent/40 bg-accent/10 font-mono text-sm text-accent">
          ▚
        </span>
        <span className="font-mono text-sm font-semibold tracking-tight text-fg-bright">
          channelscope
          <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-px bg-accent align-middle animate-blink" />
        </span>
      </Link>
      <nav className="flex items-center gap-1 font-mono text-xs">
        <Link
          href="/search"
          className="rounded px-3 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg-bright"
        >
          search
        </Link>
        <Link
          href="/categories"
          className="rounded px-3 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg-bright"
        >
          categories
        </Link>
        <Link
          href="/dashboard"
          className="rounded px-3 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg-bright"
        >
          dashboard
        </Link>
      </nav>
    </header>
  );
}
