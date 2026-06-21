import Link from "next/link";
import { notFound } from "next/navigation";
import { getChannel, ApiError } from "@/lib/api";
import { CategoryBadge } from "@/components/CategoryBadge";
import { ScoreRing, ScoreBar } from "@/components/ScoreBar";
import { Stat } from "@/components/Stat";
import { formatMembers, relativeTime } from "@/lib/format";
import type { ChannelDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ChannelPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();

  let channel: ChannelDetail;
  try {
    channel = await getChannel(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return (
      <div className="panel px-4 py-10 text-center font-mono text-sm text-danger">
        {"// backend unavailable"}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/search"
        className="font-mono text-xs text-muted hover:text-accent"
      >
        ← back to search
      </Link>

      {/* Header */}
      <div className="mt-4 panel p-6">
        <div className="flex items-start gap-5">
          <ScoreRing score={channel.final_score} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-fg-bright">
                {channel.title}
              </h1>
              {channel.is_marketplace && (
                <span className="rounded border border-accent/30 px-2 py-0.5 font-mono text-[10px] uppercase text-accent">
                  marketplace
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-xs text-muted">
              {channel.username && (
                <a
                  href={`https://t.me/${channel.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-accent"
                >
                  @{channel.username} ↗
                </a>
              )}
              <span className="text-border-bright">·</span>
              <span>{formatMembers(channel.member_count)} members</span>
              <span className="text-border-bright">·</span>
              <span>crawled {relativeTime(channel.last_crawled_at)}</span>
            </div>
            <div className="mt-3">
              <CategoryBadge category={channel.category} />
            </div>
          </div>
        </div>

        {channel.why_recommended && (
          <div className="mt-5 rounded-md border border-accent/20 bg-accent/5 p-4">
            <div className="mono-label mb-1 text-accent/80">why recommended</div>
            <p className="text-sm leading-relaxed text-fg">
              {channel.why_recommended}
            </p>
          </div>
        )}
      </div>

      {/* Score breakdown */}
      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <Stat
          label="final score"
          value={Math.round(channel.final_score ?? 0)}
          accent
        />
        <Stat label="activity" value={Math.round(channel.activity_score ?? 0)} />
        <Stat label="quality" value={Math.round(channel.quality_score ?? 0)} />
        <Stat label="freshness" value={Math.round(channel.freshness_score ?? 0)} />
      </div>

      {/* Summary + meta */}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="panel p-5 md:col-span-2">
          <div className="mono-label mb-2">summary</div>
          <p className="text-sm leading-relaxed text-fg">
            {channel.summary ?? "No summary generated yet."}
          </p>
          {channel.typical_content && (
            <>
              <div className="mono-label mb-2 mt-4">typical content</div>
              <p className="text-sm leading-relaxed text-fg">
                {channel.typical_content}
              </p>
            </>
          )}
        </div>
        <div className="panel space-y-4 p-5">
          <div>
            <div className="mono-label mb-2">signal breakdown</div>
            <div className="space-y-2">
              <ScoreBar label="activity" score={channel.activity_score} />
              <ScoreBar label="quality" score={channel.quality_score} />
              <ScoreBar label="freshness" score={channel.freshness_score} />
            </div>
          </div>
          <div className="space-y-1.5 border-t border-border pt-3 font-mono text-[11px] text-muted">
            <div className="flex justify-between">
              <span>tone</span>
              <span className="text-fg">{channel.tone ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span>confidence</span>
              <span className="text-fg">
                {channel.confidence != null
                  ? `${Math.round(channel.confidence * 100)}%`
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>found via</span>
              <span className="text-fg">
                {channel.discovered_by_keyword ?? "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sample messages */}
      <div className="mt-4 panel p-5">
        <div className="mono-label mb-3">sample posts</div>
        {channel.sample_messages.length === 0 ? (
          <p className="font-mono text-xs text-muted">{"// no sampled messages"}</p>
        ) : (
          <ul className="space-y-2">
            {channel.sample_messages.map((m) => (
              <li
                key={m.tg_message_id}
                className="rounded border border-border bg-surface-2/40 p-3 text-sm text-fg"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                    {m.text ?? (
                      <span className="text-muted italic">[media post]</span>
                    )}
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
                <div className="mt-1.5 font-mono text-[10px] text-muted/70">
                  {relativeTime(m.posted_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
