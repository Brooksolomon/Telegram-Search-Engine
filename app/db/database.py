"""Postgres connection pool shared across worker, analysis, and API."""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row

from app.config import settings

_pool: ConnectionPool | None = None


def _configure(conn) -> None:
    """Run once per new connection: fail fast on lock contention instead of
    hanging until the server statement_timeout (which strands locks on crash).

    The pool requires this callback to leave the connection OUT of a transaction,
    so we run the SETs in autocommit and restore the default afterwards."""
    conn.autocommit = True
    conn.execute("SET lock_timeout = '5s'")
    conn.execute("SET idle_in_transaction_session_timeout = '15s'")
    conn.autocommit = False


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        if not settings.database_url:
            raise RuntimeError("DATABASE_URL is not set")
        # prepare_threshold=None disables prepared statements, which is REQUIRED
        # when connecting through Supabase's transaction pooler (port 6543).
        # Pool kept small so a bad credential can't trip the auth circuit breaker.
        _pool = ConnectionPool(
            settings.database_url,
            min_size=1,
            max_size=5,
            kwargs={"row_factory": dict_row, "prepare_threshold": None},
            configure=_configure,
            open=True,
        )
    return _pool


def close_pool() -> None:
    """Close the pool cleanly. Call at process exit to avoid the noisy
    'cannot join thread at interpreter shutdown' finalizer error."""
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def get_conn() -> Iterator:
    """Yield a pooled connection; commits on success, rolls back on error."""
    pool = get_pool()
    with pool.connection() as conn:
        yield conn
