"""Analysis entrypoint: pull un-analyzed channels, run LLM + scoring, persist.

Usage:
    python -m app.analysis.run --limit 50
"""
from __future__ import annotations

import argparse
import logging

from app.analysis.analyzer import ChannelAnalyzer
from app.analysis import scoring
from app.db import repository as repo
from app.search import meili

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("analysis.run")


def run(limit: int) -> None:
    analyzer = ChannelAnalyzer()
    meili.ensure_index()  # no-op if Meili isn't configured/reachable
    channels = repo.channels_needing_analysis(limit=limit)
    log.info("analyzing %d channels", len(channels))

    for ch in channels:
        messages = repo.get_channel_messages(ch["id"], limit=50)
        if not messages:
            continue

        llm = analyzer.analyze(ch["title"], messages)

        activity = scoring.activity_score(messages)
        freshness = scoring.freshness_score(messages)
        quality = llm.pop("quality_score")
        # Influence comes from the graph (PageRank). If metrics have already run
        # for this channel we reuse it; otherwise it's 0 until `rescore` runs.
        influence = repo.get_influence_score(ch["id"])
        final = scoring.final_score(
            activity=activity, influence=influence, quality=quality, freshness=freshness
        )

        repo.upsert_analysis(
            ch["id"],
            {
                **llm,
                "activity_score": activity,
                "quality_score": quality,
                "freshness_score": freshness,
                "influence_score": influence,
                "final_score": final,
            },
        )

        # Mirror the freshly-analyzed channel into Meilisearch. Non-fatal if
        # Meili is down — Postgres remains the source of truth.
        ranked = repo.get_channel(ch["id"])
        if ranked:
            meili.upsert([ranked])

        log.info(
            "  %s -> %s (score=%.1f conf=%.2f)",
            ch["title"], llm["category"], final, llm["confidence"],
        )


def main() -> None:
    from app.db.database import close_pool

    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=50)
    args = p.parse_args()
    try:
        run(args.limit)
    finally:
        close_pool()


if __name__ == "__main__":
    main()
