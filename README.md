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
pnpm lint && pnpm typecheck && pnpm test     # unit, integration, Postgres and Redis tests
pnpm e2e                                     # browser end-to-end against the local stack
E2E_BASE_URL=https://watch-party-w4wi.onrender.com pnpm e2e   # same suites against production
```

## Scaling out

Any number of identical instances can serve any room. Room state lives in Redis, with atomic
compare-and-set in Lua; events fan out between instances through the Socket.IO Redis Streams
adapter; and there are no sticky sessions. Setting `REDIS_URL` switches all of it on.

```bash
docker compose --profile scale up -d --build   # 2 server replicas behind nginx on http://localhost:8080
pnpm --filter @watchparty/loadtest start --rooms 20 --users 50 --duration 60
```

On one laptop, two replicas served **5,000 concurrent users with all 150,000 events delivered**
and a fan-out p99 of 6 ms. Method, numbers and limits are in [`docs/loadtest.md`](./docs/loadtest.md).

## Documentation

- [`plan.md`](./plan.md): scope and timeline
- [`LLD.md`](./LLD.md): low-level design (architecture, sync algorithm, roles, persistence, scaling)
- [`building_plan.md`](./building_plan.md): build phases and their exit criteria
- [`rules.md`](./rules.md): engineering rules the code follows
- [`docs/loadtest.md`](./docs/loadtest.md): load test method and results

A full README with architecture overview, screenshots and trade-offs comes with the final release.
