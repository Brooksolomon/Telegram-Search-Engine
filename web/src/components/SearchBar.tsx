"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function SearchBar({
  initial = "",
  size = "md",
  autoFocus = false,
}: {
  initial?: string;
  size?: "md" | "lg";
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    startTransition(() => {
      router.push(`/search?q=${encodeURIComponent(q)}`);
    });
  }

  const pad = size === "lg" ? "py-4 text-base" : "py-2.5 text-sm";

  return (
    <form onSubmit={submit} className="w-full">
      <div className="group flex items-center gap-3 rounded-lg border border-border bg-surface px-4 transition-colors focus-within:border-accent/60 focus-within:shadow-glow">
        <span className="font-mono text-accent select-none">{">"}</span>
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="phones ethiopia · crypto signals · addis jobs"
          spellCheck={false}
          className={`flex-1 bg-transparent font-mono text-fg-bright placeholder:text-muted/60 focus:outline-none ${pad}`}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-accent/40 bg-accent/10 px-3 py-1 font-mono text-xs text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
        >
          {pending ? "…" : "search"}
        </button>
      </div>
    </form>
  );
}
