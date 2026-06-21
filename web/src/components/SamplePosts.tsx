"use client";

import { useState } from "react";
import type { MessageOut } from "@/lib/types";
import { TelegramPost } from "./TelegramPost";
import { relativeTime } from "@/lib/format";

export function SamplePosts({ messages }: { messages: MessageOut[] }) {
  const embeddable = messages.filter((m) => m.tg_url);
  const canEmbed = embeddable.length > 0;
  const [mode, setMode] = useState<"rich" | "text">(canEmbed ? "rich" : "text");

  if (messages.length === 0) {
    return <p className="font-mono text-xs text-muted">{"// no sampled messages"}</p>;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="mono-label">sample posts</span>
        {canEmbed && (
          <div className="flex gap-1 font-mono text-[10px]">
            <button
              onClick={() => setMode("rich")}
              className={`rounded border px-2 py-0.5 transition-colors ${
                mode === "rich"
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border text-muted hover:text-fg"
              }`}
            >
              embeds
            </button>
            <button
              onClick={() => setMode("text")}
              className={`rounded border px-2 py-0.5 transition-colors ${
                mode === "text"
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border text-muted hover:text-fg"
              }`}
            >
              text
            </button>
          </div>
        )}
      </div>

      {mode === "rich" && canEmbed ? (
        <div className="space-y-3">
          {embeddable.slice(0, 10).map((m) => (
            <TelegramPost key={m.tg_message_id} tgUrl={m.tg_url as string} />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => (
            <li
              key={m.tg_message_id}
              className="rounded border border-border bg-surface-2/40 p-3 text-sm text-fg"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                  {m.text ?? <span className="italic text-muted">[media post]</span>}
                </span>
                <div className="flex shrink-0 gap-1 font-mono text-[10px] text-muted">
                  {m.has_image && (
                    <span className="rounded border border-border px-1">img</span>
                  )}
                  {m.has_link && (
                    <span className="rounded border border-border px-1">link</span>
                  )}
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] text-muted/70">
                <span>{relativeTime(m.posted_at)}</span>
                {m.tg_url && (
                  <a
                    href={m.tg_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-accent"
                  >
                    open ↗
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
