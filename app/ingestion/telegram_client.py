"""Read-only, throttled Telethon wrapper.

Design rules (all enforced here, not by discipline):
  * Every API call goes through `self.throttle.wait()` first.
  * FloodWaitError is always honored in full (we sleep the requested seconds).
  * We NEVER join channels. Discovery + history both work on public entities
    without membership, so joining is simply not implemented.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from telethon import TelegramClient, functions
from telethon.sessions import StringSession
from telethon.errors import FloodWaitError, RPCError

from app.config import settings
from app.ingestion.throttle import Throttle

log = logging.getLogger("ingestion.telegram")


def _forward_username(msg) -> str | None:
    """Best-effort extraction of the forwarded-from channel's @username."""
    fwd = getattr(msg, "forward", None)
    if not fwd:
        return None
    chat = getattr(fwd, "chat", None)
    if chat is not None:
        uname = getattr(chat, "username", None)
        if uname:
            return uname
    return None


class TelegramReader:
    def __init__(self) -> None:
        if settings.tg_allow_join:
            raise RuntimeError(
                "TG_ALLOW_JOIN is true — refusing to start. This crawler is "
                "read-only by design. Set TG_ALLOW_JOIN=false."
            )
        session = StringSession(settings.tg_session_string or None)
        self.client = TelegramClient(session, settings.tg_api_id, settings.tg_api_hash)
        self.throttle = Throttle(
            settings.tg_min_delay_seconds, settings.tg_jitter_seconds
        )

    async def start(self) -> None:
        await self.client.start(phone=settings.tg_phone)
        me = await self.client.get_me()
        log.info("Logged in as %s (id=%s)", getattr(me, "username", "?"), me.id)

    async def stop(self) -> None:
        await self.client.disconnect()

    def export_session_string(self) -> str:
        """Print this once after first login and store it in TG_SESSION_STRING."""
        return self.client.session.save()

    async def _call(self, coro):
        """Wrap a Telethon coroutine with throttle + FloodWait handling."""
        await self.throttle.wait()
        try:
            return await coro
        except FloodWaitError as e:
            wait = int(e.seconds) + 1
            log.warning("FloodWait: sleeping %ss as instructed by Telegram", wait)
            await asyncio.sleep(wait)
            await self.throttle.wait()
            return await coro  # single retry after honoring the wait

    # ------------------------------------------------------------- discovery
    async def search_channels(self, keyword: str, limit: int = 20) -> list[dict[str, Any]]:
        """Global public search by keyword. Returns channel dicts (no join)."""
        try:
            res = await self._call(
                self.client(functions.contacts.SearchRequest(q=keyword, limit=limit))
            )
        except RPCError as e:
            log.error("search failed for %r: %s", keyword, e)
            return []

        channels: list[dict[str, Any]] = []
        for chat in getattr(res, "chats", []):
            # Only broadcast channels / megagroups, skip users & basic groups.
            if not getattr(chat, "broadcast", False) and not getattr(chat, "megagroup", False):
                continue
            channels.append(
                {
                    "tg_id": chat.id,
                    "username": getattr(chat, "username", None),
                    "title": getattr(chat, "title", "") or "",
                    "member_count": getattr(chat, "participants_count", None),
                    "discovered_by_keyword": keyword,
                }
            )
        return channels

    # --------------------------------------------------------------- history
    async def fetch_recent_messages(
        self, channel: dict[str, Any], limit: int
    ) -> list[dict[str, Any]]:
        """Pull recent messages from a public channel WITHOUT joining it."""
        entity_ref = channel.get("username") or channel.get("tg_id")
        if entity_ref is None:
            return []
        try:
            entity = await self._call(self.client.get_entity(entity_ref))
        except RPCError as e:
            log.warning("cannot resolve %r: %s", entity_ref, e)
            return []

        raws: list[dict[str, Any]] = []
        await self.throttle.wait()
        try:
            async for msg in self.client.iter_messages(entity, limit=limit):
                raws.append(
                    {
                        "tg_message_id": msg.id,
                        "text": msg.message,
                        "has_image": bool(msg.photo) or bool(getattr(msg, "media", None) and msg.photo),
                        "is_forward": bool(msg.forward),
                        "forward_from_username": _forward_username(msg),
                        "posted_at": msg.date,
                    }
                )
        except FloodWaitError as e:
            wait = int(e.seconds) + 1
            log.warning("FloodWait during history: sleeping %ss", wait)
            await asyncio.sleep(wait)
        except RPCError as e:
            log.warning("history failed for %r: %s", entity_ref, e)
        return raws

    async def resolve_channel(self, username: str) -> dict[str, Any] | None:
        """Resolve a username to a channel dict (read-only, no join). Returns
        None if it isn't a public channel or can't be resolved."""
        try:
            entity = await self._call(self.client.get_entity(username))
        except (RPCError, ValueError) as e:
            log.info("could not resolve @%s: %s", username, e)
            return None
        # Only accept broadcast channels / megagroups, not users or basic groups.
        if not getattr(entity, "broadcast", False) and not getattr(entity, "megagroup", False):
            return None
        return {
            "tg_id": entity.id,
            "username": getattr(entity, "username", None),
            "title": getattr(entity, "title", "") or "",
            "member_count": getattr(entity, "participants_count", None),
            "discovered_by_keyword": None,
        }
