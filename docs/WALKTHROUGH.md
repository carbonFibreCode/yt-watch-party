# Code walkthrough

The brief's "Code Understanding" section asks for five things. This page answers each one with
pointers into the code. For the overall picture, read [`ARCHITECTURE.md`](./ARCHITECTURE.md)
first.

1. [How each library and tool is used](#1-how-each-library-and-tool-is-used)
2. [How WebSockets enable real-time sync](#2-how-websockets-enable-real-time-sync-one-pause-end-to-end)
3. [How the role-based logic works on the backend](#3-how-the-role-based-logic-works-on-the-backend)
4. [Deployment choices](#4-deployment-choices)
5. [Trade-offs and issues we ran into](#5-trade-offs-and-issues-we-ran-into)

Plus: [how the brief's suggested events map to ours](#6-the-briefs-events-and-ours).

---

## 1. How each library and tool is used

### Realtime and server

| Library | Where | What it does here |
|---|---|---|
| **Socket.IO** 4.8 | `apps/server/src/infrastructure/realtime/`, `apps/web/src/lib/socket.ts` | **WebSocket-only** transport (no long-polling, so no sticky sessions). **Acks** for every command (`emitWithAck`) make each one a request/response with a typed result. **Rooms as channels** route events: the room, staff only, or one user's tabs (`channels.ts`). **Connection state recovery** replays missed events after short drops. The typed event maps come from the shared contract |
| **@socket.io/redis-streams-adapter** + **redis** | `infrastructure/backplane.ts`, `infrastructure/redis/` | Fan-out between server instances. Chosen over the pub/sub adapter because it supports connection state recovery. The same node-redis client also runs the room store's Lua scripts and the rate limiter |
| **Express 5** + **helmet** | `infrastructure/http/` | REST: create a room, preview a room, recent rooms, health, metrics. It also serves the built SPA. Helmet sets a CSP that allows exactly the YouTube origins the player needs |
| **better-auth** | `infrastructure/auth/` | Guest sessions (anonymous plugin) and optional email/password accounts, stored in Postgres via Drizzle. The session cookie rides on the WebSocket handshake, and `BetterAuthSessionResolver` turns it into a user. Guest history carries over when a guest creates an account |
| **zod** | `packages/shared/src/contract/` | One schema per client event, used by the server to validate every payload *and* by both sides as the TypeScript type. REST responses are validated on the client with the same schemas |
| **Drizzle ORM** + **pg** | `infrastructure/db/`, `repositories/Pg*.ts`, `PostgresRoomRepository.ts` | Tables for users, sessions, chat, memberships and the room archive. Migrations run at boot under an advisory lock, so concurrently starting instances can't race |
| **rate-limiter-flexible** | `infrastructure/ratelimit/` | Token buckets per user per kind of action, in memory or in Redis. The Redis version falls back to memory if Redis is unreachable |
| **async-mutex** | `application/KeyedMutex.ts` | Serializes mutations of one room within one instance |
| **get-video-id** | `packages/shared/src/youtube.ts` | Parses every YouTube URL shape (watch, `youtu.be`, shorts, embed, `?si=`). Shared by server and client |
| **lru-cache** | `infrastructure/video/OEmbedMetadataProvider.ts` | Caches YouTube oEmbed lookups (title, thumbnail, "embedding allowed?") |
| **nanoid** | `infrastructure/ids/` | Room codes from an alphabet without look-alike characters, plus entity ids |
| **pino** / **prom-client** | `infrastructure/logger.ts`, `infrastructure/metrics/` | Structured logs (one line per command) and Prometheus metrics behind a token |

### Client

| Library | Where | What it does here |
|---|---|---|
| **React 19** + **Vite 8** | `apps/web` | The SPA. The room route is lazy-loaded |
| **React Router 8** | `apps/web/src/app/router.tsx` | Routes `/`, `/r/:code` and `/removed`, with a skeleton while the room code loads |
| **Zustand** | `features/room/store.ts` | One store per room visit, fed by socket events (`bindRoomEvents.ts`). Components subscribe to slices, so a chat message doesn't re-render the player |
| **TanStack Query** | `features/lobby`, `lib/api.ts` | REST calls: room preview, recent rooms, create room |
| **youtube-player** | `features/player/YouTubePlayerAdapter.ts` | A promise-based wrapper over the YouTube IFrame API. Our adapter adds call deadlines and a readiness signal, and hides the library behind a `VideoPlayer` port, so `SyncEngine` is testable with a fake player |
| **timesync** | `features/player/TimesyncClock.ts` | Estimates the offset to the server clock with NTP-style sampling over Socket.IO acks |
| **Tailwind 4**, **shadcn/ui** (Radix), **lucide**, **sonner**, **motion** | `components/ui`, features | Accessible primitives (menus, dialogs, tabs, slider), toasts with Approve/Reject buttons, and floating reaction animations |

### Tooling

pnpm workspaces · TypeScript 6 (strict) · ESLint with type-aware rules and **layer boundaries
enforced by lint** · Prettier · Vitest · Playwright with axe-core · tsdown (server bundle) ·
Docker Compose (Postgres, Redis and the two-replica scale stack) · GitHub Actions.

## 2. How WebSockets enable real-time sync: one pause, end to end

Follow a moderator pressing **Pause** while two other people watch.

1. **Click → intent.**
   - `ControlBar.tsx` calls `send({ type: 'pause' })` from `usePlaybackCommand`.
   - For a moderator the mode is `direct`, so it emits `pause` through the typed RPC helper
     (`lib/rpc.ts`).
   - The UI does **not** pause yet. It waits for the room's answer.
2. **Gateway.** `SocketGateway.ts` authenticated this socket at the handshake from its session
   cookie, so `socket.data.user` is trusted. It passes the event to `CommandRegistry.dispatch`.
3. **Pipeline** (`CommandPipeline.ts`):
   - zod-validate `{}` against the `pause` schema;
   - consume a token from the `playback` bucket;
   - confirm the user is a member of the room;
   - check the `playback.control` capability.
4. **Handler.** `Pause` is a 10-line `PlaybackCommand`. Its base class (`RoomCommand.ts`) runs
   `RoomService.mutate`, which does five things:
   - takes the room's lock on this instance;
   - loads the room;
   - re-checks the actor's role on that fresh state;
   - calls `room.pause(now)`. `PlaybackState` re-anchors (`anchorPosition` = position now,
     `isPlaying: false`) and bumps `rev`;
   - commits with compare-and-set on the room's version (atomic Lua in Redis).
5. **Broadcast.** The domain raised `PlaybackChanged`. `SocketBroadcaster` turns it into one
   `sync_state` for the room channel: `{ videoId, playState: 'paused', currentTime, serverTime,
   rev, … }`. With Redis, the streams adapter carries it to the other instances.
6. **Ack.** The moderator's `emitWithAck` resolves `{ ok: true }`. Failures come back as
   `{ ok: false, error: { code, message } }` and become a toast.
7. **Every client applies it.**
   - `bindRoomEvents.ts` puts the state in the store; out-of-order revisions are ignored.
   - `SyncEngine.ts` reconciles. It projects the expected position with the server-synced clock
     (`TimesyncClock.ts`, shared `projectPosition`), pauses the YouTube player, and seeks only if
     the player is more than 0.3 s off.
8. **Later joiners** get the same state in the `join_room` ack, plus a drift check every 2 s, so
   nobody depends on having received every message.

**Why WebSockets.**
- One long-lived connection carries intents up and state down, with acks, in about one round
  trip.
- The server *pushes* changes the moment they commit. Polling would add latency and load for
  every viewer.
- Because the server sends **state** (with server time and a revision) rather than "pause
  happened", a dropped or reordered message can't put a viewer in the wrong place. The next
  state or drift check corrects it.

## 3. How the role-based logic works on the backend

**The data.** `packages/shared/src/permissions.ts`:
- `ROLE_CAPABILITIES` maps each role to a set of capabilities such as `playback.control`,
  `member.assignRole` and `request.create`.
- `ROLE_RANK` orders the roles (viewer < participant < moderator < host).
- `PermissionPolicy.can(role, capability)` answers "may this role do X at all?".
- `PermissionPolicy.canActOn(actor, target, sameUser)` answers "may this actor do X to that
  person?": only strictly lower ranks, never yourself.

**Where it's enforced:**
1. **Declared by the handler.** Each handler states its `capability`; `Pause` inherits
   `playback.control` from `PlaybackCommand`. The pipeline's `authorize` step
   (`middleware/authorize.ts`) rejects with `FORBIDDEN` before any work happens. A participant's
   `change_video` stops here, which is exactly the brief's example.
2. **Re-checked in the transaction.** `RoomCommand` calls `authorizeIn` again on the fresh room
   state inside `mutate`, so a demotion that lands mid-command still wins.
3. **Relational rules in the domain.** `Room.remove` and `Room.assignRole` (`domain/Room.ts`)
   check `canActOn`. For example, a moderator can remove participants and viewers but not
   another moderator or the host. Nobody can act on the host, whose role changes only through
   `transfer_host` or automatic succession.
4. **Broadcast so the UI follows.** A role change emits `role_assigned` with the full participant
   list. It also moves that user's sockets in or out of the staff channel on every instance,
   which is how they start or stop receiving requests. The client's `useCan()` reads the same
   table to disable or relabel controls; participants see "Ask to pause" instead of "Pause".

**Participants asking for changes** (`RequestAction.ts`, `ResolveRequest.ts`,
`RequestedActions.ts`):
1. A participant's control sends `request_action`. The server validates and *prepares* the
   action now (a requested video is checked for embeddability up front), then stores a pending
   request with a 60 s expiry.
2. Staff get `action_requested`, shown as a toast with Approve/Reject and in the Requests tab.
3. On approval, one transaction marks the request resolved and runs `RequestedActions.apply`,
   **the same function a moderator's direct command uses**. "Do it" and "approve it" can't
   behave differently.
4. The requester gets `request_resolved`: approved, declined or expired.

## 4. Deployment choices

**Platform.** One **Render** web service, from the Blueprint in [`render.yaml`](../render.yaml):
- SPA, API and WebSockets share one origin, so cookies are first-party and there's no CORS.
- **Neon** provides Postgres.
- A free **Render Key Value** instance provides Redis.

**Build and start.**
- **Build:** `corepack pnpm install --frozen-lockfile --prod=false && corepack pnpm build`.
  - Corepack runs the pnpm version pinned in `package.json`.
  - `corepack enable` fails on Render because `/usr/bin` is read-only.
  - Dev dependencies are needed to build (Vite, tsdown) even though `NODE_ENV=production`.
- **Start:** `node apps/server/dist/main.mjs`. No package manager at runtime.
- Migrations run at boot under a Postgres advisory lock. The health check is `/api/health`,
  which reports `db` and `redis`.

**Environment variables** (validated by zod at boot; the server refuses to start on bad config):

| Variable | Purpose |
|---|---|
| `PUBLIC_ORIGIN` | The public URL; also the WebSocket origin check |
| `DATABASE_URL` | Neon's **direct** URL. The pooler can't hold the session-level lock that migrations use |
| `BETTER_AUTH_SECRET` | Generated by Render |
| `REDIS_URL` | From the Key Value instance. Switches the room store, rate limits and adapter to Redis |
| `CLIENT_IP_HEADERS` | `cf-connecting-ip`, because Render sits behind Cloudflare (see §5) |
| `METRICS_TOKEN` | Generated by Render; enables `/metrics` |

**Free-tier limits.**
- **Cold starts:** the service sleeps after about 15 minutes idle, so the first request then
  takes up to a minute. An uptime ping avoids this during reviews.
- **One instance:** the code scales out (two replicas tested locally with 5,000 users), but the
  free plan runs a single small instance.

## 5. Trade-offs and issues we ran into

### Trade-offs

These are covered in [ARCHITECTURE §10](./ARCHITECTURE.md#10-trade-offs-worth-knowing). The short
version:
- **Server-authoritative, no optimistic UI:** one round trip before a click shows, in exchange
  for one code path.
- **YouTube's own controls disabled:** no echo loops, but we provide the controls.
- **Optimistic compare-and-set instead of distributed locks:** retries under contention, but no
  lock leases.
- **Guest-first identity:** joining takes only a name.

### Issues found and fixed

Each was found by a test, a trace or production, and each now has a test.

| Symptom | Cause | Fix |
|---|---|---|
| Two viewers settled about 0.6 s apart | A YouTube player resumes slightly behind where it's sent (buffering time), and drift settled just under the threshold | The engine learns each client's lag and aims ahead of it: 20–100 ms apart, measured with real YouTube |
| A dropped connection took about 36 s to notice | Socket.IO's default heartbeat (25 s + 20 s) | 10 s + 5 s heartbeat: detected within 15 s |
| A network drop while the player loaded left it dead for good | The YouTube API loader never retries, and queued player calls never settle | Deadlines on player calls, engine recovery, an unavailable overlay, and a reload when the network returns. Covered by chaos E2E tests |
| Guests in production got "Too many requests" | Behind Cloudflare, `X-Forwarded-For` has several hops, so better-auth couldn't resolve the IP and put **everyone in one rate-limit bucket** | Trust `cf-connecting-ip` (set by Cloudflare), plus a guest-specific limit; covered by a Postgres test |
| A host was occasionally asked for their name again right after creating a room (production only) | better-auth rate-limited `get-session` per IP. Under a shared IP the client's session refetch got a 429 and kept the stale "Anonymous" session | Session reads are exempt from rate limiting (cheap, cookie-cached, own session only). Found from the network log of a production E2E run; covered by a Postgres test |
| The first Render deploy failed with `EROFS` | `corepack enable` writes to the read-only `/usr/bin` | Run `corepack pnpm …` without enabling |
| An approved queue item said "Added by" the host, not the participant | Approval credited the approver | Credit the requester; caught by the social E2E test |
| About 3% of joins failed with `CONFLICT` when everyone joined at once across two servers | The compare-and-set loser races the other instance's next queued mutation; 3 retries weren't enough. Backoff would make it *worse*, because the other instance keeps committing while the loser sleeps | Immediate retries, capped at 20. 100 simultaneous joins now all succeed |
| nginx refused 9 of 5,000 sockets | A proxied WebSocket holds two connections; the default limit was 1,024 per worker | `worker_connections 16384` |
| The player never loaded on a plain-HTTP deployment | `youtube-player` loads the API over the page's scheme (`http:`), which our CSP blocked | Allow it outside production (production is HTTPS) |
| CI lint ran out of memory | Type-aware lint needs about 2.9 GB; private-repo runners give Node about 2 GB by default | A 4 GB heap for the lint step |
| The seek slider had no accessible name; inactive tabs failed contrast in light mode | Radix puts `role="slider"` on the thumb; generated tab colours were too faint | Found by the axe E2E audit and fixed in the components |

### Version pins worth explaining

- **TypeScript 6.0.3**, not 7: typescript-eslint requires `< 6.1`, and type-aware lint is a
  project rule.
- **jsdom 29**, not 30: jsdom 30 needs Node ≥ 24.15, and the project runs on Node 24.12.
- **Our own theme provider**, not `next-themes`: its inline script is blocked by our CSP.

## 6. The brief's events and ours

The brief's suggested event names are kept **verbatim**. Payload differences are deliberate:

| Brief | Ours | Why |
|---|---|---|
| `join_room { roomId, username }` | `join_room { roomId }` | The name comes from the session, so a client can't claim someone else's name. It's set once with the sign-in |
| `change_video { videoId }` | `change_video { url }` | Accepts any YouTube URL **or** a bare video id. The server parses and validates it (including "is embedding allowed?") in one place |
| `sync_state { playState, currentTime, videoId }` | Same fields, plus `serverTime`, `rev`, `duration` and video details | `serverTime` lets clients correct for latency; `rev` discards stale updates |
| `user_left { username, userId, participants }` | Plus `reason: 'left' \| 'timeout'` | The UI can say "left" vs "lost connection" |
| — | `transfer_host`, `request_action`, `resolve_request`, `chat_message`, `reaction`, `queue_add` / `queue_remove`, `kicked`, `presence_changed`, `host_transferred`, … | Bonus features and the approval workflow |
