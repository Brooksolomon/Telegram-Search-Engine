"use client";

import { useEffect, useState } from "react";

const REPO_URL =
  process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/your/tg-discovery";

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 transition-transform"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15 9 22 9.3 16.5 14 18.3 21 12 17 5.7 21 7.5 14 2 9.3 9 9" />
    </svg>
  );
}

export function StarButton() {
  const [stars, setStars] = useState<number | null>(null);
  const [hover, setHover] = useState(false);
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/stars")
      .then((r) => r.json())
      .then((d) => {
        if (alive && typeof d.stars === "number") setStars(d.stars);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function fmt(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  }

  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => {
        setHover(true);
        setBurst(true);
        window.setTimeout(() => setBurst(false), 500);
      }}
      onMouseLeave={() => setHover(false)}
      className="group relative ml-1 flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-xs text-muted transition-all hover:border-warn/50 hover:text-warn"
      aria-label="Star on GitHub"
    >
      <span
        className={`relative text-warn transition-transform duration-300 ${
          hover ? "rotate-[72deg] scale-110" : ""
        }`}
      >
        <StarIcon filled={hover} />
        {/* sparkle burst */}
        {burst && (
          <>
            <span className="pointer-events-none absolute -right-1 -top-1 h-1 w-1 animate-ping rounded-full bg-warn" />
            <span className="pointer-events-none absolute -bottom-1 -left-1 h-0.5 w-0.5 animate-ping rounded-full bg-warn [animation-delay:120ms]" />
          </>
        )}
      </span>
      <span className="hidden sm:inline">Star</span>
      <span className="min-w-[1.5rem] rounded bg-surface-2 px-1.5 py-0.5 text-center tabular-nums text-fg">
        {stars == null ? "—" : fmt(stars)}
      </span>
    </a>
  );
}
