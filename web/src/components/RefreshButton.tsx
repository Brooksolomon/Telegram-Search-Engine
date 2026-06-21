"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spun, setSpun] = useState(0);

  function refresh() {
    setSpun((n) => n + 1);
    startTransition(() => router.refresh());
  }

  return (
    <button
      onClick={refresh}
      disabled={pending}
      className="flex items-center gap-2 rounded border border-border px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
    >
      <span
        key={spun}
        className={pending ? "inline-block animate-spin" : "inline-block"}
      >
        ↻
      </span>
      {pending ? "refreshing" : "refresh"}
    </button>
  );
}
