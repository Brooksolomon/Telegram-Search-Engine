# Contributing to Telegram Search Engine

Thanks for your interest! This project is a self-hosted Telegram discovery,
analysis, and graph engine. Contributions of all kinds are welcome — bug fixes,
features, docs, new analysis ideas, and frontend polish.

Please read [`DOCS.md`](./DOCS.md) first for the architecture and data model.

## Ground rules

- **Be respectful of Telegram's ToS.** This project is intentionally read-only
  and throttled. Do **not** submit changes that join channels at scale, remove
  rate limiting, ignore FloodWait, or otherwise increase ban risk. Such PRs will
  be declined. See "Account safety" in DOCS.md.
- **No scraping of private data or circumventing access controls.** Public
  channels only.
- Keep the crawler's safety defaults intact (`TG_ALLOW_JOIN=false`, throttle on).

## Project layout

```
app/
  ingestion/   crawler, frontier, references, throttle, telegram client
  analysis/    Ollama client, analyzer, scoring, run entrypoint
  graph/       networkx metrics, edge backfill
  search/      Meilisearch client + reindex
  db/          connection pool, repository (all SQL), analytics
  api/         FastAPI app + Pydantic schemas
migrations/    SQL schema (numbered, applied in order)
web/           Next.js frontend (App Router, TypeScript, Tailwind)
```

All SQL lives in `app/db/repository.py` (and `migrations/`) — keep it there so
the worker, analysis, and API share one source of truth.

## Local development setup

### Backend / pipeline

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill in values

# database: easiest is the bundled Postgres
docker compose --env-file .env.prod up -d postgres
# (or point DATABASE_URL at your own Postgres and run migrations/*.sql)

# local LLM
ollama pull llama3.1:8b

# run a piece
uvicorn app.api.main:app --reload --port 8000
```

### Frontend

```bash
cd web
npm install
cp .env.local.example .env.local   # set FASTAPI_URL
npm run dev                         # http://localhost:3000
```

## Making changes

1. **Fork** and create a branch: `git checkout -b fix/short-description`.
2. Make focused changes with clear commits.
3. **Verify before pushing:**
   - Backend: `python -m py_compile $(find app -name '*.py')`
   - Frontend: `cd web && npm run typecheck && npm run build`
4. Update docs (`DOCS.md` / `README.md`) if you changed behavior, commands, or
   the API.
5. Open a PR describing **what** changed and **why**, with steps to test.

## Coding conventions

**Python**
- Target 3.11+. Type hints on public functions.
- New SQL goes in `app/db/repository.py`; new tables get a numbered migration in
  `migrations/` (never edit an already-released migration — add a new one).
- Long-running entrypoints should call `close_pool()` in a `finally` block.
- Network/LLM calls should degrade gracefully (return empty/None, log a warning)
  rather than crash a batch.

**TypeScript / React**
- Server components by default; `"use client"` only when needed.
- Types mirror the API in `web/src/lib/types.ts`; the API is proxied via
  `web/src/app/api/*` route handlers (never call the backend directly from the
  browser).
- Tailwind core utilities only.

## Migrations

- One change = one new numbered file (`007_...sql`). Make them idempotent where
  possible (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
- Remember `CREATE OR REPLACE VIEW` can't reorder columns — `DROP VIEW` first if
  you insert a column mid-list.

## Good first contributions

- New analyzer categories / better classification prompts.
- Additional graph metrics or visualization options.
- Search relevance tuning (Meili settings, synonyms).
- More keyword/modifier sets for other niches or languages.
- Frontend polish, accessibility, mobile layout.
- Tests around `references`, `scoring`, `keywords`, and `frontier` (pure logic,
  no live services needed).

## Reporting bugs

Open an issue with: what you ran, what you expected, what happened, and relevant
logs. For pipeline issues, include your throttle/limit settings (never paste
credentials or session strings).

## License

By contributing, you agree your contributions are licensed under the project's
license (see `LICENSE`).
