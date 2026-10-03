# Load test

The scaling claim (LLD SP-19) is that any number of identical server instances can serve any
room, sharing state through Redis, with no sticky sessions. This page shows the evidence: two
replicas behind nginx serving up to 5,000 concurrent users with every event delivered.

## Setup

```
load generator (1 Node process, N sockets)
        │  HTTP + WebSocket
        ▼
nginx (least_conn, no stickiness) ──► server ×2 ──► Redis 7.4 (rooms · Lua CAS · limits · streams adapter)
                                                └──► Postgres 17 (users, sessions, chat, room archive)
```

- **Stack:** `docker compose --profile scale up -d --build` (`docker-compose.yml`, `Dockerfile`,
  `infra/nginx.conf`). Each server is the production build with `REDIS_URL` set.
- **Machine:** Apple M4 (10 cores, 16 GB). Docker Desktop VM: 10 CPUs, 7.6 GB. The load generator
  runs on the same machine.
- **Tool:** `tools/loadtest`. Run it with
  `pnpm --filter @watchparty/loadtest start --rooms 20 --users 50 --duration 60`.

## What the load generator does

1. **Sign in.** Every virtual user signs in as a guest over HTTP, using the same two calls as the
   web app (`/api/auth/sign-in/anonymous`, then `/api/auth/update-user`).
2. **Create rooms.** The first user of each room creates it over REST, with a video, and becomes
   its host.
3. **Join.** Everyone opens a WebSocket and sends `join_room`. The join latency is measured.
4. **Measure for 60 s.** Each room's host sends `seek` every 2 s; rooms are staggered across the
   interval. Every member records each `sync_state` as `receivedAt − serverTime`, where
   `serverTime` is the server's publish timestamp.
   - That makes it the **fan-out latency**: from the server committing a change to a client
     receiving it, including the hop through Redis to the other instance.
   - **Delivery** is checked against what should arrive: every acknowledged seek must reach
     every member of its room.

## Results

| Scenario | Users joined | Join ack p50 / p95 / p99 | Seek ack p50 / p99 | Fan-out p50 / p95 / p99 / max | Deliveries | Errors |
|---|---|---|---|---|---|---|
| 20 rooms × 50 ([json](loadtest-1000.json)) | 1,000 / 1,000 | 39 / 189 / 218 ms | 5 / 7 ms | 3 / 5 / 6 / 9 ms | 30,000 / 30,000 | none |
| 100 rooms × 50 ([json](loadtest-5000.json)) | 5,000 / 5,000 | 64 / 220 / 257 ms | 2 / 7 ms | 2 / 4 / 6 / 51 ms | 150,000 / 150,000 | none |
| 1 room × 100, all joining at once | 100 / 100 | 93 / 186 / 189 ms | 7 / 31 ms | 7 / 36 / 39 / 40 ms | 500 / 500 | none |

**Spread.** nginx's access log records the upstream that served each socket. In the 5,000-user
run, the two replicas served 2,502 and 2,498 sockets.

**Resource use.** One `docker stats` sample during the 5,000-user measurement:

| Container | CPU | Memory |
|---|---|---|
| server-1 | ~100% (one core) | 374 MiB |
| server-2 | ~121% | 393 MiB |
| Redis | ~22% | 81 MiB |
| nginx | ~36% | 76 MiB |
| Postgres | ~3% | 79 MiB |

Postgres is idle on the realtime path because room state lives in Redis and is written back to
Postgres in the background.

**Reading the numbers:**
- **Joins are the slow path, by design.** A join mutates the room, and every member of a 50-person
  room joining at once means 50 mutations of one row. Each instance serializes its share of them
  through the per-room mutex, and the two instances arbitrate through Lua compare-and-set.
- **Steady-state traffic is cheap.** One change produces one ~250-byte broadcast. There is no
  periodic state heartbeat, because clients project the position from server-time anchors.

## Defects these runs found (and fixed)

1. **Join storms across instances failed about 3% of the time with `CONFLICT`.**
   - *Cause:* a compare-and-set loser races the other instance's next queued mutation, which is
     roughly a fair coin toss. With `CAS_MAX_RETRIES = 3`, a join failed whenever it lost three
     tosses in a row (1 in 8 when contended).
   - *Why not backoff:* exponential backoff with jitter makes this worse. While the loser sleeps,
     the other instance keeps committing from its queue, and the loser wakes mid-cycle, where it
     always loses.
   - *Fix:* immediate retries with the cap raised to 20, which brings the odds to about 1e-6 for
     two instances. The 100-at-once storm now joins cleanly. See `packages/shared/src/constants.ts`.
2. **nginx refused 9 of 5,000 sockets.**
   - *Cause:* `1024 worker_connections are not enough`. A proxied WebSocket holds two connections
     (client and upstream).
   - *Fix:* `worker_connections 16384` (`infra/nginx.conf`).
3. **The YouTube player never loaded on plain-HTTP deployments.**
   - *Cause:* `youtube-player` loads `iframe_api` with the page's own scheme (`http:`), which our CSP
     blocked. Render is HTTPS, so production was unaffected; the plain-HTTP scale stack hit it.
   - *Fix:* outside production only, the CSP also allows `http://www.youtube.com`.

The cross-instance behavior is also tested deterministically in CI
(`apps/server/src/test/cluster.redis.test.ts`), using two real instances and one Redis:
- shared state and fan-out (a participant on B requests a pause; the host on A approves it);
- a host on instance A kicking a user connected to instance B;
- presence counting a user's tabs on both instances before marking them away.

## Limitations

- **This is the local two-replica stack, not Render.** Production runs one free-tier instance
  (a fraction of one CPU) with a free Key Value instance. It uses the same code path with
  `REDIS_URL`, but much less capacity. Scaling out there means a paid plan with more instances;
  the code needs no change.
- **One machine.** The load generator, nginx and the servers share the same machine, so the
  latencies include no real network. Container and host clocks are the same clock (Docker
  Desktop's VM is synced to the host), so `receivedAt − serverTime` is meaningful only because
  everything is local.
- **The resource figures are one sample**, not a time series. The server exposes Prometheus metrics (`/metrics`) for continuous measurement.
- **No browsers.** The load generator speaks the real protocol but doesn't run browsers, so it
  measures the server and the network path, not YouTube playback. Playback across the two
  instances is covered by the full Playwright suite, which also passes against this stack
  (`E2E_BASE_URL=http://localhost:8080 pnpm e2e`).
