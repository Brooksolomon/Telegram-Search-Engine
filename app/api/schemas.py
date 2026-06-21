"""Pydantic response models for the API."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, computed_field


class ChannelSummary(BaseModel):
    id: int
    username: str | None = None
    title: str
    member_count: int | None = None
    category: str | None = None
    is_marketplace: bool | None = None
    summary: str | None = None
    why_recommended: str | None = None
    final_score: float | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def tg_link(self) -> str | None:
        """Public link to the channel, if it has a username."""
        return f"https://t.me/{self.username}" if self.username else None


class MessageOut(BaseModel):
    tg_message_id: int
    text: str | None = None
    has_image: bool = False
    has_link: bool = False
    posted_at: datetime | None = None
    # Set by the API from the parent channel so we can build the permalink.
    channel_username: str | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def tg_url(self) -> str | None:
        """Permalink to this exact post (public channels only). The frontend
        renders Telegram's official embed from this, which shows the image."""
        if not self.channel_username:
            return None
        return f"https://t.me/{self.channel_username}/{self.tg_message_id}"


class ChannelDetail(ChannelSummary):
    tone: str | None = None
    typical_content: str | None = None
    confidence: float | None = None
    activity_score: float | None = None
    quality_score: float | None = None
    freshness_score: float | None = None
    discovered_by_keyword: str | None = None
    first_seen_at: datetime | None = None
    last_crawled_at: datetime | None = None
    sample_messages: list[MessageOut] = []


class CategoryOut(BaseModel):
    category: str
    channel_count: int


class StatsOut(BaseModel):
    total_channels: int
    analyzed: int
    pending_analysis: int
    total_messages: int
    marketplace: int
    spam: int
    crawled_24h: int
    frontier_pending: int
    frontier_done: int
    frontier_failed: int
    frontier_skipped: int
    keywords_tracked: int
    categories: list[CategoryOut] = []
