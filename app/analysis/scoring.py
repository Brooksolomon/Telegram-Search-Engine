"""Heuristic component scores + final ranking blend.

final_score = activity*0.3 + member*0.2 + quality*0.4 + freshness*0.1
(member contribution folded into activity-side normalization below)
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any


def _now() -> datetime:
    return datetime.now(timezone.utc)


def activity_score(messages: list[dict[str, Any]]) -> float:
    """0..100 from posting volume + image presence + low repetition."""
    if not messages:
        return 0.0
    n = len(messages)
    volume = min(n / 40.0, 1.0)  # 40+ sampled msgs => full marks

    with_images = sum(1 for m in messages if m.get("has_image"))
    image_ratio = with_images / n

    texts = [(m.get("text") or "").strip().lower() for m in messages]
    unique_ratio = len(set(t for t in texts if t)) / max(1, sum(1 for t in texts if t))

    raw = 0.5 * volume + 0.25 * image_ratio + 0.25 * unique_ratio
    return round(raw * 100, 1)


def member_score(member_count: int | None) -> float:
    """0..100, log-scaled so 100k members isn't 100x a 1k channel."""
    if not member_count or member_count <= 0:
        return 0.0
    return round(min(math.log10(member_count) / 5.0, 1.0) * 100, 1)  # 10^5 => 100


def freshness_score(messages: list[dict[str, Any]]) -> float:
    """0..100 from how recent the newest sampled message is."""
    dates = [m.get("posted_at") for m in messages if m.get("posted_at")]
    if not dates:
        return 0.0
    newest = max(dates)
    if newest.tzinfo is None:
        newest = newest.replace(tzinfo=timezone.utc)
    age_days = (_now() - newest).total_seconds() / 86400.0
    if age_days <= 1:
        return 100.0
    if age_days >= 30:
        return 0.0
    return round((1 - (age_days - 1) / 29) * 100, 1)


def final_score(
    *, activity: float, influence: float, quality: float, freshness: float
) -> float:
    """Blend the four signals. `influence` is normalized PageRank (0..100) —
    a channel's importance in the reference network — replacing raw member
    count, which fits the community-graph model and doesn't penalize channels
    whose member count couldn't be read."""
    blended = (
        activity * 0.30
        + influence * 0.20
        + quality * 0.40
        + freshness * 0.10
    )
    return round(blended, 1)


def influence_score(pagerank: float, max_pagerank: float) -> float:
    """Normalize a channel's PageRank to 0..100 (sqrt-scaled so mid-tier
    channels aren't crushed by a few dominant hubs)."""
    if not pagerank or not max_pagerank or max_pagerank <= 0:
        return 0.0
    import math

    return round(min(1.0, math.sqrt(pagerank / max_pagerank)) * 100, 1)
