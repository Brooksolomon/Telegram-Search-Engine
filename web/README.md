# Channelscope — Web Frontend

Next.js 14 (App Router, TypeScript, Tailwind) frontend for the Telegram
Discovery Engine. Dark terminal / data-tool aesthetic.

It talks to the FastAPI backend through **Next.js route handlers** (`/api/*`),
so the backend URL is never exposed to the browser and you can add caching or
auth at the proxy layer later.

## Pages

- `/` — landing + search, with category browse
- `/search?q=...` — ranked results, each with score ring + "why recommended"
- `/channel/[id]` — full profile: score breakdown, summary, signal bars,
  sample posts, link to the channel on Telegram
- `/categories` — browse analyzed channels by category

## Setup

```bash
cd web
npm install
cp .env.local.example .env.local   # set FASTAPI_URL if not localhost:8000
```

Make sure the FastAPI backend is running first (see the project root README):

```bash
# from project root, in another terminal
uvicorn app.api.main:app --port 8000
```

## Run

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm run typecheck
```

## Configuration

| Env var       | Default                 | Purpose                          |
| ------------- | ----------------------- | -------------------------------- |
| `FASTAPI_URL` | `http://localhost:8000` | Backend the route handlers proxy |

## Notes

- Fonts (Inter + JetBrains Mono) load via CSS `@import` with system fallbacks,
  so the production build does not depend on network access at build time.
- All data pages are dynamic (`force-dynamic`) since results change as the
  crawler/analyzer run. If you want caching, add `revalidate` to the route
  handlers in `src/app/api/*`.
- The UI degrades gracefully when the backend is offline or the index is empty —
  it shows clear "backend offline / no analyzed channels yet" states.
