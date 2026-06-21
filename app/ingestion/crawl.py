"""Crawl entrypoint: keyword -> discover -> dedupe -> sample -> clean -> store.

Usage:
    python -m app.ingestion.crawl --keywords phones addis crypto jobs
    python -m app.ingestion.crawl --print-session   # one-time, to capture session
"""
from __future__ import annotations

import argparse
import asyncio
import logging

from app.config import settings
from app.db import repository as repo
from app.db.database import close_pool
from app.ingestion import frontier
from app.ingestion import keywords as keywords_repo
from app.ingestion.cleaning import clean_batch
from app.ingestion.references import extract_from_messages
from app.ingestion.telegram_client import TelegramReader

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ingestion.crawl")


async def _sample_channel(
    reader, ch: dict, *, harvest_depth: int | None, messages_limit: int | None = None
) -> int:
    """Persist a channel, sample+store its messages, and (if harvest_depth is
    set) enqueue any referenced channels into the frontier at that depth.
    `messages_limit` overrides how many recent posts to scan (default from config).
    Returns the channel's db id."""
    channel_id = repo.upsert_channel(
        tg_id=ch["tg_id"],
        username=ch["username"],
        title=ch["title"],
        member_count=ch["member_count"],
        discovered_by_keyword=ch.get("discovered_by_keyword"),
    )
    limit = messages_limit if messages_limit is not None else settings.tg_messages_per_channel
    raws = await reader.fetch_recent_messages(ch, limit=limit)
    cleaned = clean_batch(raws)
    inserted = repo.insert_messages(channel_id, cleaned)
    repo.mark_channel_crawled(channel_id)

    harvested = 0
    if harvest_depth is not None:
        # Harvest from the RAW messages (cleaning may strip link-only posts).
        refs = extract_from_messages(raws, self_username=ch.get("username"))
        harvested = frontier.enqueue_many(
            refs, depth=harvest_depth, discovered_from=channel_id
        )

    log.info(
        "channel %s (%s): %d raw -> %d kept -> %d new%s",
        ch["title"], ch.get("username"), len(raws), len(cleaned), inserted,
        f" -> +{harvested} leads" if harvest_depth is not None else "",
    )
    return channel_id


async def _discover(reader: "TelegramReader", keywords: list[str], record: bool):
    """Search each keyword, dedupe by tg_id. Optionally record per-keyword
    channel counts into keyword_runs (DB-driven mode)."""
    seen: dict[int, dict] = {}
    for kw in keywords:
        found = await reader.search_channels(kw, limit=20)
        log.info("keyword %r -> %d channels", kw, len(found))
        for ch in found:
            if ch["tg_id"] not in seen:
                seen[ch["tg_id"]] = ch
        if record:
            keywords_repo.record_run(kw, len(found))
    return seen


async def crawl(keywords: list[str], *, record_runs: bool = False) -> None:
    reader = TelegramReader()
    await reader.start()
    try:
        # 1) discover, deduping across keywords by tg_id within this run
        seen = await _discover(reader, keywords, record_runs)

        channels = list(seen.values())[: settings.tg_max_channels_per_run]
        log.info("crawling %d unique channels (capped)", len(channels))

        # 2) persist + sample each channel. harvest_depth=1 seeds the frontier
        #    so keyword crawls also feed link-graph discovery.
        for ch in channels:
            await _sample_channel(reader, ch, harvest_depth=1)
    finally:
        await reader.stop()


async def crawl_link_graph(
    max_depth: int, limit: int, messages_limit: int | None = None
) -> None:
    """Drain the frontier: resolve pending candidate channels, sample them, and
    enqueue their references one hop deeper — up to `max_depth`. Bounded by
    `limit` channels per run and the global throttle. `messages_limit` overrides
    how many recent posts to scan per channel (deep history for seeds)."""
    reader = TelegramReader()
    await reader.start()
    try:
        pending = frontier.fetch_pending(max_depth=max_depth, limit=limit)
        log.info("link-graph: %d pending candidates (depth<=%d)", len(pending), max_depth)
        for cand in pending:
            uname = cand["username"]
            if not uname:
                frontier.mark(cand["id"], "skipped")
                continue
            ch = await reader.resolve_channel(uname)
            if ch is None:
                frontier.mark(cand["id"], "failed")
                continue
            # Children go one hop deeper; stop harvesting past max_depth.
            child_depth = cand["depth"] + 1
            harvest = child_depth if child_depth <= max_depth else None
            await _sample_channel(
                reader, ch, harvest_depth=harvest, messages_limit=messages_limit
            )
            frontier.mark(cand["id"], "done")

        s = frontier.stats()
        log.info("frontier now: %s", s)
    finally:
        await reader.stop()


async def crawl_from_db(max_queries: int, min_age_hours: float) -> None:
    """DB-driven keyword expansion: generate bases x modifiers, pick the queries
    most overdue for a crawl, run them (recording results), so repeat runs keep
    exploring new terms instead of re-crawling the same handful."""
    bases, modifiers = keywords_repo.load_terms()
    all_queries = keywords_repo.generate_queries(bases, modifiers)
    log.info(
        "generated %d queries from %d bases x %d modifiers",
        len(all_queries), len(bases), len(modifiers),
    )
    due = keywords_repo.due_queries(
        all_queries, min_age_hours=min_age_hours, limit=max_queries
    )
    if not due:
        log.info("no queries are due (all crawled within %sh)", min_age_hours)
        return
    log.info("crawling %d due queries this run", len(due))
    await crawl(due, record_runs=True)


async def print_session() -> None:
    """Interactive first login; prints the session string to store in .env."""
    reader = TelegramReader()
    await reader.start()
    print("\n=== TG_SESSION_STRING (store this in .env) ===")
    print(reader.export_session_string())
    print("=== end ===\n")
    await reader.stop()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--keywords", nargs="*", default=[],
                   help="explicit keywords to crawl")
    p.add_argument("--from-db", action="store_true",
                   help="generate + crawl keywords from the DB (expansion mode)")
    p.add_argument("--max-queries", type=int, default=20,
                   help="[--from-db] max due queries to crawl this run")
    p.add_argument("--min-age-hours", type=float, default=24.0,
                   help="[--from-db] skip queries crawled within this many hours")
    p.add_argument("--link-graph", action="store_true",
                   help="drain the frontier queue (link-graph discovery)")
    p.add_argument("--max-depth", type=int, default=2,
                   help="[--link-graph] max hops from a seed channel")
    p.add_argument("--limit", type=int, default=30,
                   help="[--link-graph] max candidate channels to crawl this run")
    p.add_argument("--messages", type=int, default=None,
                   help="posts to scan per channel (overrides TG_MESSAGES_PER_CHANNEL; "
                        "use a high value like 1000 for deep history on seeds)")
    p.add_argument("--print-session", action="store_true")
    args = p.parse_args()

    try:
        if args.print_session:
            asyncio.run(print_session())
            return
        if args.link_graph:
            asyncio.run(
                crawl_link_graph(args.max_depth, args.limit, args.messages)
            )
            return
        if args.from_db:
            asyncio.run(crawl_from_db(args.max_queries, args.min_age_hours))
            return
        if not args.keywords:
            p.error("provide --keywords, --from-db, --link-graph, or --print-session")
        asyncio.run(crawl(args.keywords))
    finally:
        close_pool()


if __name__ == "__main__":
    main()
