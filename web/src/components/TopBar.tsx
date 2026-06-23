"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { StarButton } from "./StarButton";

const LINKS = [
  { href: "/search", label: "search" },
  { href: "/categories", label: "categories" },
  { href: "/graph", label: "graph" },
  { href: "/dashboard", label: "dashboard" },
  { href: "/docs", label: "docs" },
];

export function TopBar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="relative border-b border-border py-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-2.5"
          onClick={() => setOpen(false)}
        >
          <Image
            src="/logo.png"
            alt="Telegram Search Engine"
            width={44}
            height={44}
            priority
            className="h-9 w-9 shrink-0 rounded object-contain sm:h-11 sm:w-11"
          />
          <span className="truncate font-mono text-sm font-semibold tracking-tight text-fg-bright sm:text-base">
            telegram search engine
            <span className="ml-0.5 hidden h-3.5 w-1.5 translate-y-px bg-accent align-middle animate-blink sm:inline-block" />
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 font-mono text-xs md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded px-3 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg-bright"
            >
              {l.label}
            </Link>
          ))}
          <StarButton />
        </nav>

        {/* Mobile: star + hamburger */}
        <div className="flex items-center gap-1.5 md:hidden">
          <StarButton />
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={open}
            className="flex h-9 w-9 items-center justify-center rounded border border-border text-fg-bright"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {open && (
        <nav className="absolute left-0 right-0 top-full z-30 mt-px flex flex-col gap-1 border-b border-border bg-bg/95 p-3 font-mono text-sm backdrop-blur md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="rounded px-3 py-2.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg-bright"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
