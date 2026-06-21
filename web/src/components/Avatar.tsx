"use client";

import { useState } from "react";

/**
 * Channel avatar. Public Telegram channels expose a profile image at
 * https://t.me/i/userpic/320/<username>.jpg — we use that, and fall back to a
 * generated letter tile for private channels or when the image fails to load.
 */
export function Avatar({
  username,
  title,
  size = 44,
}: {
  username: string | null;
  title: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const letter = (title.trim()[0] ?? "?").toUpperCase();
  const src = username
    ? `https://t.me/i/userpic/320/${username}.jpg`
    : null;

  if (!src || failed) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 font-mono font-semibold text-muted"
        style={{ width: size, height: size, fontSize: size * 0.42 }}
        aria-hidden
      >
        {letter}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${title} avatar`}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-md border border-border object-cover"
      style={{ width: size, height: size }}
    />
  );
}
