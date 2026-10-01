# YouTube Watch Party: Plan & Scope (24h build)

> Detailed low-level design: see [`LLD.md`](./LLD.md).
>
> Goal: be in the top 4–5 submissions. That means **(1) every core requirement works in production with no bugs**, **(2) the sync feels good** (no jitter or echo loops, late joiners land at the right timestamp), **(3) the system design holds up** (OOP server, server-authoritative state, horizontal scaling story backed by a demo), and **(4) we can explain every line** in the walkthrough.

---

## 1. Requirements Checklist (from the brief)

### Core (must work in prod)
- [ ] Create room → creator becomes **Host**; unique code + shareable link
- [ ] Join via link or code → joiner becomes **Participant**
- [ ] Participant list with live roles
- [ ] YouTube IFrame player, synced: **play / pause / seek / change video** (paste any YT URL format)
- [ ] WebSockets for all realtime traffic
- [ ] RBAC: Host, Moderator, Participant, Viewer, **enforced on the server** (reject unauthorized events)
- [ ] Host: assign role, remove participant, transfer host
- [ ] Role updates broadcast so the UI disables controls for restricted users
- [ ] **Participant must request Host/Mod approval for a change to take effect** (easy to miss; we build it as a first-class feature)
- [ ] Deployed publicly; README includes the live URL, setup steps, and an architecture overview

### Bonus (we target all of them)
- [ ] OOP WebSocket server (`Room`, `Participant`, `MessageHandler`, …)
- [ ] Scalability: multi-instance, Redis adapter / pub-sub, load test evidence
- [ ] Persistent rooms (DB)
- [ ] Authentication (login before joining)
- [ ] Text chat
- [ ] Emoji reactions on key moments
- [ ] Transfer host

---

## 2. Tech Stack (decided)

| Layer | Choice | Why |
|---|---|---|
| Monorepo | **pnpm workspaces**: `apps/web`, `apps/server`, `packages/shared` | Shared TS types + zod schemas for every socket event, so client and server can't drift apart |
| Frontend | **React + TypeScript + Vite**, Tailwind + shadcn/ui, Zustand | Matches the recommended stack; quick to build a polished UI |
| Backend | **Node.js + TypeScript + Express + Socket.IO** | Socket.IO provides rooms, acks, auto-reconnect, and the official Redis adapter for the scaling bonus |
| Validation | **zod** (in `packages/shared`) | Every inbound socket payload is validated at runtime |
| Database | **PostgreSQL (Neon)** + **Drizzle ORM** | Rooms, members, chat history, users. Drizzle over Prisma because Prisma's `latest` is an RC (see LLD §2) |
| Cache / fan-out | **Redis (Render Key Value)** | `@socket.io/redis-streams-adapter` (works with connection state recovery) + shared hot room state |
| Auth | **better-auth**: anonymous (guest) sessions + email/password, with guest→account linking | Joining stays low-friction while still covering the "auth" bonus. Cookie session survives refresh and reconnect |
| Video | YouTube IFrame Player API (wrapped in our own hook, no heavy lib) | Full control over events, so echo suppression stays manageable |
| Tests | Vitest (unit + socket integration), Playwright (2-browser e2e smoke) | Shows rigor and catches sync regressions |
| Deploy | **Render or Railway**: one Node web service serving the built SPA + Socket.IO; Neon PG; Render Key Value | Same origin means no CORS or cookie trouble. Long-lived WebSockets don't run on Vercel serverless |
| Local scale demo | `docker-compose`: 2× server + nginx LB + redis + postgres | Shows horizontal scaling working, even if prod runs one instance |

---

## 3. System Architecture

```
 Browser (React SPA)
   ├─ YouTube IFrame Player  ◀── usePlayerSync (applies server state, suppresses echoes)
   └─ Socket.IO client ──────── WebSocket (transports: ['websocket']) ──┐
                                                                         ▼
                                     ┌────────── Load balancer (nginx / platform) ──────────┐
                                     ▼                                                       ▼
                             Server instance A                                       Server instance B
                         ┌──────────────────────┐                               ┌──────────────────────┐
                         │ Express (REST, SPA)  │                               │        same          │
                         │ Socket.IO gateway    │                               │                      │
                         │  └ MessageHandler    │                               │                      │
                         │     └ RoomService    │                               │                      │
                         │        └ Room (OOP)  │                               │                      │
                         └─────────┬────────────┘                               └──────────┬───────────┘
                                   │      Redis: pub/sub adapter + room state + locks      │
                                   └───────────────────────┬───────────────────────────────┘
                                                           ▼
                                                PostgreSQL (durable: rooms, members,
                                                chat, users, state snapshots)
```

**Key principle: the server is the single source of truth.** Clients never broadcast to each other. They send *intents* (`play`, `seek`, …). The server authorizes the intent, mutates the canonical state, bumps a version, and broadcasts the new state.

### 3.1 Backend OOP layout (`apps/server/src`)
```
domain/
  Room.ts              # state, participants, roles, pending requests; pure logic, no I/O
  Participant.ts       # id, name, role, socketIds (multi-tab), joinedAt, connected
  PlaybackState.ts     # videoId, isPlaying, basePosition, updatedAt (server ms), rate, version
  Permissions.ts       # role → capability matrix; can(role, action)
  ActionRequest.ts     # participant change-requests awaiting approval
realtime/
  SocketGateway.ts     # io setup, auth middleware, connection lifecycle
  MessageHandler.ts    # event → validate (zod) → authorize → RoomService → broadcast
  RateLimiter.ts       # token bucket per socket per event type
services/
  RoomService.ts       # load/save Room from store, concurrency control
  RoomStore.ts         # interface; InMemoryRoomStore + RedisRoomStore
  PersistenceService.ts# debounced write-behind snapshots to Postgres
http/
  routes.ts            # POST /rooms, GET /rooms/:code, /auth/*, /health, /metrics
```
`Room` is pure and deterministic, so we can unit-test the entire RBAC and state machine without sockets.

### 3.2 Permission matrix

| Capability | Host | Moderator | Participant | Viewer |
|---|:-:|:-:|:-:|:-:|
| play / pause / seek / change_video / queue edit | ✅ | ✅ | request only | ❌ |
| approve / reject requests | ✅ | ✅ | ❌ | ❌ |
| assign role (≤ Moderator) | ✅ | ❌ | ❌ | ❌ |
| remove participant | ✅ | ✅ (Participants/Viewers only) | ❌ | ❌ |
| transfer host | ✅ | ❌ | ❌ | ❌ |
| chat / react | ✅ | ✅ | ✅ | ✅ (configurable) |

Invariants enforced in `Room`: exactly one Host at all times; nobody can modify the Host; a Moderator can never touch a Host or another Moderator; a role cannot be changed to `host` through `assign_role` (only through `transfer_host`).

Distinguishing Viewer from Participant: a **Participant** may *request* changes, while a **Viewer** is strictly watch-only (no requests). This gives the alias role a real purpose.

---

## 4. Sync Algorithm (where the sync quality comes from)

**Canonical state** (server):
```ts
{ videoId, isPlaying, basePosition, updatedAt /* server epoch ms */, playbackRate, version }
```
Current position = `basePosition + (isPlaying ? (serverNow - updatedAt)/1000 * rate : 0)`.

1. **Clock sync.** On connect, and every 30s after, the client runs an NTP-style ping (`time_sync` with ack, 5 samples, take the min-RTT sample) to estimate `serverOffset`. Every client computes the expected position in *server time*, so latency doesn't accumulate.
2. **Intent → state.** On `play`/`pause`/`seek`, the server computes the new `basePosition` itself, sets `updatedAt = now`, increments `version`, and broadcasts `sync_state`.
3. **Apply on client.** `usePlayerSync` gets the state, computes the expected position, and seeks only if `|drift| > 0.75s`. Then it plays or pauses to match.
4. **Echo suppression by construction.** Native YT controls are disabled (`controls: 0`) and an overlay blocks clicks on the iframe. Intents only come from our own control bar, so player events are never re-emitted as intents and the play/pause ping-pong bug can't happen (LLD SP-13).
5. **Stale event protection.** Clients ignore any `sync_state` with `version <= lastApplied`. Server intents carry the client's `baseVersion`, so a seek issued against outdated state can be detected. Last-writer-wins is acceptable here, but it is explicit.
6. **Drift correction loop.** Every 5s while playing, the client compares its actual position with the expected one and hard-seeks past the threshold. This handles ads, tab throttling, and buffering.
7. **Late joiners / reconnects.** `join_room` acks with a full room snapshot, and the player loads `videoId` at the computed position.
8. **Seek input.** Our scrubber emits `seek` only on release (`onValueCommit`), so dragging sends one event instead of 40. No seek-detection polling is needed.
9. **Autoplay policy.** Browsers block unmuted autoplay. A first-interaction "Click to join the party" overlay unlocks audio, with a muted-autoplay fallback banner.
10. **Video ended.** The server auto-advances to the next item in the queue (if there is one) or marks the room paused at the end.

---

## 5. WebSocket Event Contract (`packages/shared/events.ts`)

All client→server events use **Socket.IO acks** that return `{ ok: true, data } | { ok: false, code, message }`, so the UI can show precise errors such as "Only Host/Moderator can change the video".

**Brief-mandated (exact names kept):** `join_room`, `leave_room`, `sync_state`, `play`, `pause`, `seek`, `change_video`, `assign_role`, `remove_participant`, `user_joined`, `user_left`, `role_assigned`, `participant_removed`.

**Our additions:**
| Event | Dir | Payload | Notes |
|---|---|---|---|
| `transfer_host` / `host_transferred` | C→S / S→C | `{ userId }` | Host only |
| `request_action` | C→S | `{ action: 'play'\|'pause'\|'seek'\|'change_video'\|'queue_add', payload }` | Participant only, rate-limited |
| `action_requested` | S→Host+Mods | `{ request }` | Shown as a toast with Approve/Reject buttons |
| `resolve_request` | C→S | `{ requestId, approve }` | Host/Mod. On approval, the server executes the action |
| `request_resolved` | S→requester (+mods) | `{ requestId, status, by }` | Requests auto-expire after 60s |
| `chat_message` / `chat_history` | both | `{ text }` / `{ messages[] }` | Persisted, last 50 replayed on join |
| `reaction` | both | `{ emoji, videoTime }` | Floating emoji overlay. Pinned to video time for "key moments" |
| `queue_add` / `queue_remove` / `queue_updated` | both | `{ videoId }` | Playlist (stretch) |
| `room_settings` | both | `{ locked, allowViewerChat, requireApproval }` | Host only (stretch) |
| `time_sync` | C→S (ack) | `{ clientSentAt }` → `{ serverNow }` | Clock offset |
| `kicked` | S→C | `{ reason }` | Removed user is redirected. Their userId is banned from rejoining that room |
| `error` | S→C | `{ code, message }` | |

---

## 6. Room Lifecycle & Edge Cases (what separates top submissions)

- **Reconnect without losing role.** Identity is a better-auth session cookie (guest or logged-in), not the socket id. A refresh or network blip restores the same userId and role.
- **Multi-tab.** One `Participant` can have several sockets. They only count as "left" when the last socket closes.
- **Host disconnect.** After a 30s grace period, host is auto-transferred to the longest-present Moderator, falling back to the longest-present Participant. Everyone is notified.
- **Empty room.** In-memory state is evicted after 10 min, and the DB snapshot keeps the room resumable by link (persistent rooms bonus).
- **Kicked user.** All their sockets are disconnected and a per-room ban list blocks rejoin.
- **Input hardening.** zod validation, YouTube URL parser (watch, youtu.be, shorts, embed, `t=` param), 11-char ID regex, chat length limits + sanitization, per-event token-bucket rate limits.
- **Concurrent mutations across instances.** Per-room state mutation goes through a Redis-backed version check (optimistic CAS via a small Lua script). Losers retry once.

---

## 7. Data Model (Drizzle / Postgres)

```
User        id, name, email?, avatarUrl?, isGuest, createdAt
Room        id, code (6-char, unique), name, hostId, createdAt, lastActiveAt,
            stateSnapshot (jsonb), settings (jsonb)
RoomMember  roomId, userId, role, banned, joinedAt          (PK roomId+userId)
ChatMessage id, roomId, userId, text, createdAt               (index roomId, createdAt)
QueueItem   id, roomId, videoId, title, addedBy, position
```
Hot state lives in memory/Redis. Postgres gets **debounced write-behind** (every 5s or on significant change), so the DB never sits on the realtime path.

---

## 8. Frontend Pages & UX

1. **Landing.** Hero, "Create room" (name + optional starting video URL), "Join with code" input, recent rooms (when logged in).
2. **Room page** (`/r/:code`)
   - Left: YouTube player plus our own control bar (play/pause, seek slider, time, URL input). Controls are disabled with a tooltip for users without permission, and turn into "Request" buttons for Participants.
   - Right sidebar tabs: **People** (avatars, role badges, host menu: promote, demote, remove, transfer), **Chat**, **Queue**, **Requests** (Host/Mod only, with badge count).
   - Top bar: room name, copy-link button, room code, connection/latency indicator, sync-status dot (in sync / re-syncing).
   - Floating emoji reactions over the player.
   - Toasts for joins/leaves, role changes, and request outcomes.
3. **Polish.** Dark mode by default, responsive mobile layout (sidebar becomes a bottom sheet), empty states, skeleton loaders, "you were removed" screen, 404 room screen.

---

## 9. Scalability Story (bonus, backed by evidence)

- Stateless server instances. `@socket.io/redis-streams-adapter` handles cross-instance room broadcast. Room state lives in Redis, so any instance can handle any event.
- `transports: ['websocket']` on the client removes the sticky-session requirement for HTTP long-polling. nginx uses `least_conn`.
- `pg` pool against Neon's pooled endpoint.
- **Load test**: `artillery` (socket.io engine) or a small custom `socket.io-client` script simulates **1,000 clients across 100 rooms (50/room)** against the 2-instance docker-compose setup. We measure broadcast latency p50/p95 and put the numbers and a chart in the README.
- `/health` and a `/metrics` endpoint (rooms, sockets, events/sec) for observability.

---

## 10. Testing Plan
- **Unit (Vitest):** `Permissions`, `Room` (role invariants, transfer, removal, request approval flow, position math), YouTube URL parser.
- **Integration:** spin up the server in-process and connect 3 `socket.io-client`s (host/mod/participant). Assert that unauthorized `change_video` is rejected, that state is broadcast, that requests are approved and executed, and that a kicked user can't rejoin.
- **E2E (Playwright, smoke):** two browser contexts. Host creates a room, guest joins, host pauses, guest sees paused.
- GitHub Actions CI: lint + typecheck + tests.

---

## 11. Deliverables
- `README.md`: live URL, features, screenshots/GIF, local setup (`pnpm i && pnpm dev`, docker-compose), env vars, deployment notes, trade-offs.
- `docs/ARCHITECTURE.md`: diagram, sync algorithm, event contract, RBAC, scaling design, trade-offs and known limitations.
- Demo video (2–3 min) and screenshots.
- Clean commit history in a public GitHub repo.

---

## 12. 24-Hour Timeline

| Hours | Phase | Output |
|---|---|---|
| 0–1 | **Scaffold** | pnpm monorepo, TS configs, ESLint/Prettier, shared zod event schemas, Express + Socket.IO hello, Vite app, Tailwind/shadcn |
| 1–4 | **Domain core** | `Room`, `Participant`, `PlaybackState`, `Permissions`, `ActionRequest` + unit tests. In-memory store. `MessageHandler` with validate → authorize → apply → broadcast |
| 4–7 | **Player sync** | YT IFrame hook, clock sync, `usePlayerSync` (apply, echo-guard, drift loop, seek detection), URL parser. **Milestone: 2 tabs in sync** |
| 7–9 | **Room UI** | Landing, create/join, room page, participants panel with host actions, disabled controls by role, toasts |
| 9–10 | **🚀 Deploy MVP early** | Render/Railway + env vars. Verify in prod with 2 devices. *(Removes deployment risk early)* |
| 10–12 | **Approval flow + host lifecycle** | request/approve/reject UI, expiry, transfer host, host-disconnect auto-transfer, kick + ban, reconnect identity |
| 12–14 | **Persistence + auth** | Drizzle + Neon schema, write-behind snapshots, resumable rooms, better-auth guest sessions + email sign-in |
| 14–16 | **Chat + reactions** (+ queue if on track) | Persisted chat with history, floating reactions pinned to video time |
| 16–18 | **Scaling** | Redis adapter + RedisRoomStore + CAS, docker-compose (2 instances + nginx), load test script and results |
| 18–20 | **Hardening + tests** | Rate limits, integration tests, Playwright smoke, CI, edge-case sweep (multi-tab, refresh, kicked, host leaves) |
| 20–22 | **Polish** | Responsive layout, empty/error states, sync indicator, latency badge, a11y pass |
| 22–24 | **Ship** | Final prod deploy + prod QA, README, ARCHITECTURE.md, screenshots, demo video, walkthrough prep notes |

**Cut line if behind schedule** (drop in this order): playlist/queue → Playwright → room settings → email sign-in (keep guest sessions) → load-test chart (keep the scaling code + compose). **We never cut:** core sync, RBAC enforcement, the approval flow, the prod deploy, or the README.

---

## 13. Risks & Mitigations
| Risk | Mitigation |
|---|---|
| Echo loops / jittery sync | Server-authoritative state, versioning, echo guard, drift threshold. Build this first and test it hard |
| Browser autoplay blocking | Click-to-join overlay, muted fallback |
| Free-tier cold starts (Render sleeps) | Prefer Railway, or keep Render warm with a cron ping. Document it in the README |
| YouTube embed-disabled videos | Detect the `onError` 101/150 codes, show "This video can't be embedded", keep the previous video |
| Ads desyncing clients | The drift loop re-seeks after the ad ends |
| Running out of time | Deploy at hour 10, keep the cut line above |

---

## 14. Open Decisions (defaults chosen unless you say otherwise)
1. **Hosting:** Railway (no sleep, has Redis) vs Render (named first in the brief). *Decided: Render web service + Neon + Render Key Value, with Railway as fallback.*
2. **Sign-in method:** *Decided: better-auth anonymous guests + email/password. No OAuth.*
3. **Moderator powers:** *Default: Mods control playback, approve requests, and remove Participants/Viewers, but can't assign roles.*
