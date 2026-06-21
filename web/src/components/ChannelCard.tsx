import Link from "next/link";
import type { ChannelSummary } from "@/lib/types";
import { formatMembers } from "@/lib/format";
import { CategoryBadge } from "./CategoryBadge";
import { ScoreRing } from "./ScoreBar";
import { Avatar } from "./Avatar";

export function ChannelCard({
  channel,
  rank,
}: {
  channel: ChannelSummary;
  rank?: number;
}) {
  return (
    <Link
      href={`/channel/${channel.id}`}
      className="group block animate-fade-up panel p-4 transition-colors hover:border-border-bright hover:bg-surface-2/60"
    >
      <div className="flex items-start gap-4">
        <Avatar username={channel.username} title={channel.title} size={44} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {rank != null && (
              <span className="font-mono text-[11px] text-muted">
                {String(rank).padStart(2, "0")}
              </span>
            )}
            <h3 className="truncate font-semibold text-fg-bright group-hover:text-accent">
              {channel.title}
            </h3>
            {channel.is_marketplace && (
              <span className="rounded border border-accent/30 px-1.5 py-px font-mono text-[9px] uppercase text-accent">
                market
              </span>
            )}
          </div>

          <div className="mt-0.5 flex items-center gap-3 font-mono text-[11px] text-muted">
            {channel.username ? (
              <span className="truncate">@{channel.username}</span>
            ) : (
              <span className="text-muted/60">private</span>
            )}
            <span className="text-border-bright">·</span>
            <span>{formatMembers(channel.member_count)} members</span>
          </div>

          {channel.why_recommended && (
            <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-fg">
              {channel.why_recommended}
            </p>
          )}

          <div className="mt-3">
            <CategoryBadge category={channel.category} />
          </div>
        </div>

        <ScoreRing score={channel.final_score} />
      </div>
    </Link>
  );
}
