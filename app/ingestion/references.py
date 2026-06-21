"""Extract channel references from messages for link-graph crawling.

Three sources:
  * t.me/<channel> links in message text
  * forwarded-from channel (message metadata)
  * @username mentions in message text (noisiest — filtered)
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# t.me/<name> or telegram.me/<name>, optionally with /<msg_id> after.
# Excludes reserved paths that are not channels.
_TME_RE = re.compile(
    r"(?:https?://)?(?:t|telegram)\.me/(?:s/)?(@?[A-Za-z][A-Za-z0-9_]{3,31})",
    re.IGNORECASE,
)
_MENTION_RE = re.compile(r"(?<![\w/])@([A-Za-z][A-Za-z0-9_]{3,31})")

# Paths under t.me that are not channel usernames.
_RESERVED = {
    "joinchat", "addstickers", "share", "iv", "proxy", "socks", "bg",
    "setlanguage", "confirmphone", "login", "c", "s",
}
# Obvious bot accounts and noise we don't want to queue as channels.
_BOT_SUFFIX = "bot"


def _normalize(name: str) -> str | None:
    name = name.lstrip("@").lower()
    if not name or name in _RESERVED:
        return None
    if len(name) < 4 or len(name) > 32:
        return None
    if name.endswith(_BOT_SUFFIX):
        return None
    return name


@dataclass(frozen=True)
class Reference:
    username: str
    source: str  # 'tme_link' | 'mention' | 'forward'


def extract_from_text(text: str | None) -> set[Reference]:
    """Pull t.me links and @mentions from a single message's text."""
    refs: set[Reference] = set()
    if not text:
        return refs
    for m in _TME_RE.finditer(text):
        norm = _normalize(m.group(1))
        if norm:
            refs.add(Reference(norm, "tme_link"))
    for m in _MENTION_RE.finditer(text):
        norm = _normalize(m.group(1))
        if norm:
            refs.add(Reference(norm, "mention"))
    return refs


def extract_from_messages(
    messages: list[dict],
    self_username: str | None = None,
) -> set[Reference]:
    """Aggregate references across a channel's sampled messages.

    `messages` items may carry a 'forward_from_username' key (set by the reader)
    for the forwarded-from channel. Self-references are dropped.
    """
    refs: set[Reference] = set()
    for msg in messages:
        refs |= extract_from_text(msg.get("text"))
        fwd = msg.get("forward_from_username")
        if fwd:
            norm = _normalize(fwd)
            if norm:
                refs.add(Reference(norm, "forward"))

    if self_username:
        self_norm = self_username.lstrip("@").lower()
        refs = {r for r in refs if r.username != self_norm}
    return refs
