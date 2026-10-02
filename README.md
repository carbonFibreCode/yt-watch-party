# Watch Party

Watch YouTube together, perfectly in sync. Create a room, share the link, and everyone sees the same moment: hosts and moderators control playback, participants ask for changes, and every action reaches the whole room in real time over WebSockets.

**Live:** https://watch-party-w4wi.onrender.com
(free tier: the first visit after a quiet spell can take up to a minute while the server wakes up)

## Quick start (local)

Requires Node 24.11+, pnpm 10 (via Corepack) and Docker.

```bash
docker compose up -d            # Postgres on :5433, Redis on :6380
cp .env.example .env            # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm install
pnpm dev                        # web on http://localhost:5173, server on :3000
```

Database migrations run automatically when the server starts.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test     # unit, integration and Postgres tests
pnpm e2e                                     # browser end-to-end against the local stack
E2E_BASE_URL=https://watch-party-w4wi.onrender.com pnpm e2e   # same suites against production
```

## Documentation

- [`plan.md`](./plan.md): scope and timeline
- [`LLD.md`](./LLD.md): low-level design (architecture, sync algorithm, roles, persistence, scaling)
- [`building_plan.md`](./building_plan.md): build phases and their exit criteria
- [`rules.md`](./rules.md): engineering rules the code follows

A full README with architecture overview, screenshots and trade-offs comes with the final release.
