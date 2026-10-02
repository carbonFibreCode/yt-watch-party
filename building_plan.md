# Building Plan: Phase-by-Phase Build Order

> **Source documents:**
> - [`plan.md`](./plan.md): scope and timeline
> - [`LLD.md`](./LLD.md): every class, contract, and constant
> - [`rules.md`](./rules.md): how code is written
>
> This file decides **in what order** things are built, and **what "done" means** before moving on.

---

## How this order was chosen

1. **Inside-out (dependency order).** Build `shared contract → domain → application → infrastructure → client → UI`. Each layer only depends on layers that already exist and are tested, so we never write code against an imaginary interface.
2. **Pure before I/O.** Most of the logic (RBAC, room state machine, sync math) is pure and gets fully tested before a socket or database exists. Bugs found there cost minutes, not hours.
3. **Vertical slice early.** By Phase 7 two browser tabs play in sync. By Phase 9 it is **deployed**. Everything after that is additive, so the core can't be lost to late-stage problems.
4. **Strategy seams first, scaled implementations later.** In-memory repo, limiter, and adapter come first. Redis versions come in Phase 12 behind the **same interfaces**, verified by the **same contract tests**.
5. **Phase gates.** A phase is finished only when its **Exit Criteria** pass. Code is committed at each gate. The next phase never starts on a red gate.

```
P0 Scaffold ─► P1 Shared Contract ─► P2 Domain ─► P3 Application ─► P4 Realtime Server ─► P5 Identity & Persistence
                                                                                                 │
     P14 Docs & Release ◄─ P13 Observability/E2E/Polish ◄─ P12 Scaling ◄─ P11 Chat/Reactions/Queue │
                                                                    ▲                            ▼
                                     P10 Lifecycle & Hardening ◄─ P9 🚀 Deploy MVP ◄─ P8 Room UI ◄─ P7 Player Sync ◄─ P6 Frontend Foundation
```

| Phase | Name | Est. | Cumulative | LLD refs |
|---|---|---|---|---|
| P0 | Scaffold & Tooling | 1.0h | 1.0h | §3 |
| P1 | Shared Contract | 1.0h | 2.0h | SP-1, SP-3, SP-5, SP-11 |
| P2 | Domain Model | 2.0h | 4.0h | SP-4, SP-5, SP-10, SP-16 |
| P3 | Application Layer | 1.5h | 5.5h | SP-6 (ports/in-memory), SP-7 |
| P4 | Realtime Server | 1.5h | 7.0h | SP-7, SP-8, SP-9 (base), SP-12 (server), SP-20 |
| P5 | Identity & Persistence | 2.0h | 9.0h | SP-2, SP-6, SP-11 (provider), SP-18 |
| P6 | Frontend Foundation | 1.5h | 10.5h | SP-14, SP-21 |
| P7 | Player Sync | 2.0h | 12.5h | SP-12, SP-13 |
| P8 | Room UI | 1.5h | 14.0h | SP-21, SP-10 (UI) |
| P9 | 🚀 Deploy MVP | 1.0h | 15.0h | SP-23 |
| P10 | Lifecycle & Hardening | 1.5h | 16.5h | SP-9, SP-17 |
| P11 | Chat, Reactions, Queue | 1.5h | 18.0h | SP-15, SP-16 |
| P12 | Horizontal Scaling | 2.0h | 20.0h | SP-6 (Redis), SP-19 |
| P13 | Observability, E2E, Polish | 2.0h | 22.0h | SP-20, SP-22, SP-21 |
| P14 | Docs & Release | 2.0h | 24.0h | plan §11 |

**Cut line** (from `plan.md`, applied in this order if behind): queue (P11) → Playwright (P13) → load-test report (P12, keep the code) → email sign-in (P5, keep guests).
**Never cut:** P1–P10.

---

## P0 · Scaffold & Tooling

**Goal:** an empty but fully wired monorepo where lint, typecheck, test, and build all pass.

**Tasks**
- [ ] `git init`, `.gitignore`, `.editorconfig`, `.nvmrc` (Node 24 LTS), `packageManager` pinned in root `package.json`
- [ ] `pnpm-workspace.yaml`: `apps/*`, `packages/*`
- [ ] `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, ES2023 target
- [ ] ESLint 10 (flat config, `typescript-eslint` strict-type-checked, `eslint-plugin-import-x` with **`no-restricted-paths` layer rules** from LLD §1.4) and Prettier. TypeScript pinned to 6.0.3 (LLD §2.1)
- [ ] Vitest workspace config. Root scripts: `dev`, `build`, `test`, `lint`, `typecheck`, `format`
- [ ] Packages scaffolded: `packages/shared` (source-only, no build), `apps/server` (tsx dev, tsdown build), `apps/web` (Vite React TS)
- [ ] `docker-compose.yml` with `postgres:17` and `redis:7` (the scale profile comes in P12)
- [ ] `.env.example` with every var from LLD SP-20
- [ ] GitHub Actions `ci.yml`: install → lint → typecheck → test (Redis service container added in P12)

**Exit Criteria**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all green
- A deliberate import from `apps/server/src/domain` to `infrastructure` makes the lint fail (layer rule works)

**Commit:** `chore: scaffold pnpm monorepo with strict TS, lint layers, CI`

---

## P1 · Shared Contract

**Goal:** the single source of truth for events, permissions, errors, constants, and pure math (LLD §1.2).

**Tasks**
- [ ] `constants.ts`: every value from the LLD Constants table
- [ ] `errors.ts`: `ErrorCode`, `ERROR_MESSAGES`, `AckResult<T>`
- [ ] `contract/primitives.ts`, `contract/client-events.ts` (`ClientEventSchemas`, `RequestableAction`), `contract/server-events.ts`, `contract/views.ts`, `contract/http.ts`, `contract/index.ts` (Socket.IO generics derived from the schemas)
- [ ] `permissions.ts`: `ROLE_RANK`, `ROLE_CAPABILITIES`, `PermissionPolicy.can`, `PermissionPolicy.canActOn`
- [ ] `playback.ts`: `projectPosition`
- [ ] `youtube.ts`: `parseYouTubeId`, `parseStartTime` (wrapping `get-video-id`)

**Tests**
- Permission matrix: 4 roles × 8 capabilities, plus the relational rules
- `parseYouTubeId`: ≥ 12 URL shapes plus garbage input
- `projectPosition`: playing, paused, clamped to duration
- Schema sanity: `RequestableAction` accepts exactly the 5 action types

**Exit Criteria:** tests green, 100% line coverage on `permissions.ts`, `playback.ts`, `youtube.ts`. The package builds and is importable from both apps.

**Commit:** `feat(shared): event contract, permission policy, playback math, YouTube parsing`

---

## P2 · Domain Model

**Goal:** a pure, fully tested `Room` aggregate. No I/O, no `Date.now()`, no randomness (time and ids are passed in).

**Tasks**
- [ ] `DomainError`, `events.ts` (`DomainEvent` union), `VideoRef`, `snapshot.ts`
- [ ] `Participant`, `MemberRegistry` (join/restore role, presence, bans, roleMemory, `pickSuccessor`)
- [ ] `PlaybackState` (immutable; `play`/`pause`/`seek`/`load`; `rev` bumps; idempotent no-ops)
- [ ] `VideoQueue`, `RequestBook` (create/replace-same-type/resolve/expire, max-per-user)
- [ ] `Room` facade: all methods from LLD SP-4, invariants 1–5, `pullEvents`, `toSnapshot`/`fromSnapshot`
- [ ] Test helpers: `FakeClock`, `SeqIdGenerator`, `aRoom()` builder

**Tests** (each LLD invariant and rule gets at least one named test)
- Creator is host. Joiner is participant. A remembered role is restored on rejoin.
- `assignRole`: host only, never targets host or self, never assigns `host`
- `remove`: rank rule (moderator ✓ participant/viewer, ✗ moderator/host). The removed user is banned, and a banned user can't rejoin.
- `transferHost`: target must be online. Old host becomes moderator.
- Succession order: rank, then `joinedAt`. A hostless room makes the next joiner host.
- Playback: `rev` increases monotonically, no-op play/pause doesn't bump it, seek clamps
- `videoEnded`: rev/videoId/tolerance guards, queue advance, idempotency
- Requests: replace same type, max 3, expiry, resolve emits the correct events
- Snapshot round-trip: `fromSnapshot(toSnapshot(r))` deep-equals the original

**Exit Criteria:** ≥ 95% line coverage on `domain/`. ESLint confirms there are zero imports outside `shared` and `domain`.

**Commit:** `feat(domain): Room aggregate with members, playback, queue, requests`

---

## P3 · Application Layer

**Goal:** the Unit of Work and the command pipeline, runnable entirely in memory.

**Tasks**
- [ ] `application/ports.ts`: every port in LLD SP-6, SP-7, SP-9, SP-11, SP-17
- [ ] `InMemoryRoomRepository`, `InMemoryChatRepository`, `InMemoryMembershipRepository`, `MemoryRateLimiter` (wrapping `rate-limiter-flexible`'s `RateLimiterMemory`), `StubVideoMetadataProvider`
- [ ] **Repository contract suite** `describeRoomRepository(factory)`, run against InMemory now (Redis and Tiered reuse it later)
- [ ] `RoomService` (`create`, `read`, `mutate` with `async-mutex` + CAS retry + lazy reap/expire)
- [ ] `RoomPresenter` (snapshot → `RoomView`, `ParticipantView[]`, `PlaybackView`, `RequestView`)
- [ ] `CommandHandler` interface, `CommandRegistry`, `CommandPipeline` + middleware (`validate`, `rateLimit`, `membership`, `authorize`)
- [ ] All handlers: JoinRoom, LeaveRoom, Play, Pause, Seek, ChangeVideo, AssignRole, RemoveParticipant, TransferHost, QueueAdd, QueueRemove, RequestAction, ResolveRequest, ReportDuration, VideoEnded. Side-channel handlers: Chat, Reaction, Timesync.
- [ ] `ChatService`

**Tests**
- Pipeline: each middleware rejects with the correct `ErrorCode`, and the order is enforced
- `mutate`: retries on a CAS conflict (stub repo fails the first N attempts), then gives up with `CONFLICT`
- Approval: `ResolveRequest` executes the *same* handler with the approver as the actor, in one CAS
- The "demoted between authorize and execute" race is rejected by the re-check

**Exit Criteria:** handler tests green. Adding a dummy handler requires **zero edits** to the pipeline or registry code (OCP check).

**Commit:** `feat(app): unit-of-work RoomService and command pipeline with handlers`

---

## P4 · Realtime Server

**Goal:** a running Express + Socket.IO server (in-memory strategies) that real socket clients can drive.

**Tasks**
- [ ] `config.ts` (zod env), `logger.ts` (pino). Metrics are added in P13; no stubs before then (rules.md §0.4)
- [ ] `http/app.ts` (helmet with the CSP from SP-17, pino-http, `/api/health`, SPA static + fallback)
- [ ] `realtime/channels.ts`, `SocketGateway` (auth middleware via `SessionResolver`, origin check, `maxHttpBufferSize`, `connectionStateRecovery`, bind pipeline), `SocketBroadcaster` (presenter table from SP-8, staff channel sync, kick/disconnect), `SocketPresenceProbe`
- [ ] `PresenceService`: base version (markAway/markOnline + grace timer). The full edge-case matrix comes in P10.
- [ ] `StaticSessionResolver` (test/dev only, header-based)
- [ ] `main.ts` composition root (in-memory branch) + graceful shutdown

**Tests** (integration, real `socket.io-client`, in-process server)
- Join returns a full `RoomView`. A second user triggers `user_joined` for the first.
- Participant `change_video` → `FORBIDDEN`. Moderator `seek` → everyone gets `sync_state`.
- `assign_role` → `role_assigned` broadcast. A promoted user starts receiving `action_requested`.
- `remove_participant` → `participant_removed` + `kicked`, and the socket is disconnected. Rejoin → `BANNED`.
- `timesync` ack returns server time

**Exit Criteria:** `pnpm --filter server dev` boots. All integration tests green.

**Commit:** `feat(server): Socket.IO gateway, broadcaster, presence, composition root`

---

## P5 · Identity & Persistence

**Goal:** real users (better-auth), real Postgres, durable rooms, and the REST API.

**Tasks**
- [ ] Drizzle setup (`pg` Pool), `schema.ts` (`rooms`, `room_memberships`, `chat_messages`) plus the better-auth tables (matched to `getAuthTables` of the pinned version, guarded by a drift test), `drizzle-kit` migrations applied at boot under an advisory lock
- [ ] better-auth instance: `emailAndPassword`, `anonymous({ onLinkAccount })`, Drizzle adapter, `cookieCache`
- [ ] `BetterAuthSessionResolver`. Mount `toNodeHandler(auth)` at `/api/auth/*` **before** `express.json()`.
- [ ] `PostgresRoomRepository`, `TieredRoomRepository` (read-through, write-through create, write-behind), `SnapshotFlusher` (+ flush on SIGTERM)
- [ ] `PgChatRepository`, `PgMembershipRepository` (+ `reassign` for account linking)
- [x] `OEmbedMetadataProvider` (+ `lru-cache`, timeout, graceful degrade). *Pulled forward into P4: `change_video` needs it to work at all, and stubs are not allowed in production code*
- [ ] Routes: `POST /api/rooms`, `GET /api/rooms/:code`, `GET /api/me/rooms` (zod-validated, one error shape)

**Tests**
- The contract suite also runs against `Tiered(InMemory, Postgres)` using a docker-compose Postgres
- Flusher monotonic guard: an older version never overwrites a newer one
- oEmbed provider: 200 / 401 / 404 / timeout handling (`fetch` stubbed)
- HTTP: create room → preview → 404 on an unknown code

**Exit Criteria:** a room survives a server restart (create → restart → join works, state intact). Anonymous sign-in → socket connects with the real cookie.

**Commit:** `feat(server): better-auth identity, Postgres persistence, rooms REST API`

---

## P6 · Frontend Foundation

**Goal:** the app shell, auth, and data plumbing. No player yet.

**Tasks**
- [ ] Tailwind v4 + `shadcn init`. Add `button input dialog dropdown-menu slider tabs tooltip sheet badge avatar skeleton`, plus `sonner`.
- [ ] Router: `/`, `/r/:code`, `/removed`, `*`. Providers: QueryClient, Toaster, dark theme.
- [ ] Vite dev proxy for `/api` and `/socket.io` → :3000 (same-origin cookies in dev)
- [ ] `lib/authClient.ts` (better-auth react client + anonymous plugin), `GuestNameDialog`, `SignUpDialog`, `useSession`
- [ ] `lib/socket.ts` (typed factory), `lib/rpc.ts` (the one ack/error path)
- [ ] `features/room/store.ts` (Zustand slices), `bindRoomEvents.ts`, `useRoomConnection.ts`, `useCan.ts`
- [ ] Lobby: `LandingPage`, `CreateRoomForm` (live URL parse preview), `JoinRoomForm` (code or link), `RecentRooms`

**Exit Criteria**
- Create a room in browser A, open the link in browser B as a guest
- The store shows both participants with roles (verified with a temporary debug panel, removed before the gate)

**Commit:** `feat(web): app shell, guest auth, typed socket RPC, room store, lobby`

---

## P7 · Player Sync ⭐ (core quality milestone)

**Goal:** frame-accurate-feeling sync across tabs (LLD SP-12, SP-13).

**Tasks**
- [ ] `VideoPlayer` port + `YouTubePlayerAdapter` (`youtube-player`, `controls:0, disablekb:1, playsinline:1, rel:0`)
- [ ] `ServerClock` port + `TimesyncClock` (socket transport)
- [ ] `SyncEngine` (`apply`, `tick`, `onPlayerState`, `status`), `usePlayerSync`
- [ ] `PlayerSurface` (input-blocking overlay, `AutoplayGate`, `SyncStatusPill`, `EmbedErrorBanner`)
- [ ] `ControlBar`: PlayPause, Scrubber (`onValueCommit`), TimeLabel (rAF 4Hz), VideoUrlInput, keyboard shortcuts. All gated by `useCan` (enabled / request-mode / disabled).

**Tests** (`FakePlayer` + `FakeClock`)
- No seek when drift < threshold. Seek when > threshold. Stale `rev` ignored.
- Video change → `load(id, expectedPos, autoplay)`
- Autoplay-blocked detection → status. Post-seek cooldown respected.

**Exit Criteria** (automated in `e2e/sync.spec.ts` against real YouTube in two browsers; run 4× without flakes)
- Two tabs plus one incognito: play, pause, seek, and change video propagate in < 300ms on localhost
- Drift stays < 1s over 3 minutes
- Throttle one tab (DevTools "Slow 3G") → it reconverges within one `DRIFT_CHECK_MS`
- Late joiner lands within 1s of the others
- Zero play/pause ping-pong

**Commit:** `feat(web): server-clock-anchored SyncEngine and controlled YouTube player`

---

## P8 · Room UI

**Goal:** the complete room page for every role.

**Tasks**
- [ ] `RoomPage` layout (player column + tabbed sidebar, sheet below `md`), `RoomHeader` (copy link, code, `ConnectionBadge`)
- [ ] `ParticipantList` / `ParticipantRow` (role badge, presence dot, "you"), `MemberActionsMenu` (items filtered by `PermissionPolicy.canActOn`: promote/demote, remove, transfer host with confirm dialog)
- [ ] `RequestsPanel` + `RequestCard` (approve/reject, countdown), request toasts with action buttons, requester toasts on resolution
- [ ] Participant "request" affordance on controls. Viewer disabled state with tooltip.
- [ ] `RemovedPage`, `NotFoundPage`, join skeletons

**Exit Criteria** (automated in `e2e/roles.spec.ts`: 3 browsers, host / moderator / participant; stable across repeated runs)
- Every row of the permission matrix behaves in the UI exactly as on the server. No control is clickable that the server would reject.
- The full request → approve → everyone switches flow works. Reject and expiry both toast correctly.

**Commit:** `feat(web): room page, participant management, approval workflow UI`

---

## P9 · 🚀 Deploy MVP

**Goal:** remove deployment risk while there is still time to react.

**Tasks**
- [x] Neon project + **direct** (non-pooler) URL. Render Web Service from the `render.yaml` Blueprint. Redis is added in P12 (`REDIS_URL` unset until then).
- [x] Set env vars (`PUBLIC_ORIGIN`, `BETTER_AUTH_*`, `DATABASE_URL`). Migrations run in the build step.
- [x] Production smoke test: laptop + phone on mobile data, same room, every core action

**Done:** https://watch-party-w4wi.onrender.com. The full Playwright suite passes against it (`E2E_BASE_URL=… pnpm e2e`), twice in a row. Fixed on the way: corepack shims on a read-only `/usr/bin`, and better-auth's shared rate-limit bucket behind Cloudflare.

**Exit Criteria:** the public URL works end-to-end for create, join, sync, roles, and approval. The URL is added to the README stub.

**Commit:** `chore(deploy): Render web service + Neon configuration`

---

## P10 · Lifecycle & Hardening

**Goal:** the full edge-case matrix from LLD SP-9, plus abuse resistance (SP-17).

**Tasks**
- [ ] Multi-tab idempotent join. `socket.recovered` path. Last-socket → away → grace → reap. Lazy reap. Explicit leave on `pagehide`.
- [ ] Host succession on grace expiry and on explicit leave. Role memory on rejoin.
- [ ] Rate-limit rules table wired per handler. HTTP limiter on `POST /api/rooms`.
- [ ] Origin check, buffer limit, and CSP verified in prod headers
- [ ] Request sweeper interval (eager expiry toasts)

**Tests:** integration tests for every row of the SP-9 table, plus rate-limit rejection.

**Done.**
- **Lifecycle tests:** `apps/server/src/test/lifecycle.test.ts` covers host succession by timeout, lazy reaping with no timer, role memory, on-time request expiry, rate limiting over the wire and the oversized-message cut-off. The HTTPS-only production headers are tested too.
- **Chaos run:** `e2e/chaos.spec.ts` runs it in real browsers.
- **Found and fixed:**
  - Players settled about 0.6 s apart → adaptive seek lead (now about 20–100 ms).
  - A silent drop took about 36 s to detect → 10 s / 5 s heartbeat.
  - A network drop during player load left it dead forever → call deadlines, engine recovery, reload on `online`.
  - Request expiry used a polling sweep → precise per-request timers.

**Exit Criteria:** a manual chaos pass (kill wifi for 5s / 30s, close the host tab, open 3 tabs as one user, spam seek) behaves exactly as SP-9 specifies.

**Commit:** `feat: presence grace, host succession, rate limiting, security hardening`

---

## P11 · Chat, Reactions, Queue

**Goal:** the bonus social features (LLD SP-15, SP-16).

**Tasks**
- [x] `ChatPanel` (history from the join ack, system lines from store events, composer with limit counter)
- [x] `ReactionBar`, `ReactionOverlay` (`motion`), `ReactionMarkers` on the scrubber (5s buckets, reset on video change)
- [x] `QueuePanel`, `AddToQueueForm`, "play now" (= `change_video` + `queue_remove`), auto-advance on end

**Done.**
- **Sidebar:** People / Chat (unread badge) / Queue / Requests (staff). A demoted moderator falls back to People.
- **E2E:** `e2e/social.spec.ts` covers chat both ways with the unread badge and history after a reload, reactions with moment markers in both browsers, and a participant's queue request through approval, then auto-advance after the 19 s "Me at the zoo".
- **Found and fixed:** approved queue additions were credited to the approver. They are now credited to the requester.

**Exit Criteria:** chat persists across a reload. Reactions show in all tabs with markers. Queue auto-advances, and a participant's `queue_add` goes through approval.

**Commit:** `feat: persisted chat, emoji reactions with moment markers, video queue`

---

## P12 · Horizontal Scaling

**Goal:** the bonus scaling story, with evidence (LLD SP-19).

**Tasks**
- [x] node-redis client factory. `RedisRoomRepository` + Lua CAS (inline scripts run by `LuaScript`, EVALSHA). `Tiered(Redis, Postgres)` wiring.
- [x] Run the **same repository contract suite** against Redis (CI Redis service container)
- [x] `RateLimiterRedis` strategy. `@socket.io/redis-streams-adapter` strategy. All selected by `REDIS_URL` (the `Backplane` Strategy).
- [x] docker-compose `scale` profile: `server` ×2 + `infra/nginx.conf` (`least_conn`, WS upgrade)
- [x] `tools/loadtest`: guest sign-in per virtual user, rooms × users, fan-out latency p50/p95/p99, error counts
- [x] Enable `REDIS_URL` in prod and re-run the prod smoke test (Render Key Value from the Blueprint; `/api/health` reports `redis: true`; full E2E suite passes against production)

**Exit Criteria**
- Two instances: a user on instance A kicks a user on instance B and the kick works. Sync works across instances.
- Load test of 1,000 users (20 rooms × 50) completes with results saved to `docs/loadtest.md`

**Done.**
- **Two instances in CI:** `test/cluster.redis.test.ts` covers shared state and fan-out, a host on A kicking a user on B, and presence counting a user's tabs on both instances.
- **E2E:** the full Playwright suite passes against the two-replica stack (`E2E_BASE_URL=http://localhost:8080`).
- **Load test** (`docs/loadtest.md`): 1,000 and 5,000 users, every delivery received, fan-out p99 6 ms.
- **Found and fixed:**
  - Cross-instance join storms hit `CONFLICT` about 3% of the time → immediate CAS retries, cap 3 → 20.
  - nginx `worker_connections` too low for 5,000 sockets → 16k.
  - The YouTube API was blocked by the CSP on plain-HTTP deployments → `http:` allowed outside production.

**Commit:** `feat(scale): Redis room store with Lua CAS, streams adapter, load test`

---

## P13 · Observability, E2E, Polish

**Tasks**
- [x] `prom-client` metrics from SP-20, `/metrics` behind `METRICS_TOKEN`. Per-socket child loggers.
- [x] Playwright: the 3 E2E scenarios from SP-22 (Playwright itself and the first two-browser test were pulled forward into P6)
- [x] Polish pass: responsive layout, empty states, focus states, a11y (Radix + labels), loading skeletons, favicon/OG meta, light/dark toggle
- [x] Remove dead code. Final `pnpm lint` with zero warnings.

**Done.**
- **Metrics:** the `Metrics` port with `PrometheusMetrics`, and `/metrics` behind a bearer token (404 when disabled). Production's token is generated by Render.
- **Lighthouse** (production build): accessibility 100 on both the landing page and a room link, best practices 96, SEO 91–92 → robots.txt added.
- **axe-core E2E** (`e2e/a11y.spec.ts`): WCAG 2.1 A/AA on the landing page, the guest prompt and every room tab, in dark and light.
- **Polish:** the sidebar fills the viewport on wide screens (chat uses the full column); favicon, Open Graph image and tags, `robots.txt`; a `HydrateFallback` skeleton for direct room links.
- **Dead code:** knip found two unused components (deleted) and two needlessly exported locals.
- **Found and fixed:**
  - The seek slider's thumb had no accessible name → the label moved to the thumb, plus spoken "1:23 of 3:45" value text.
  - Inactive tabs failed WCAG contrast in the light theme.
  - An empty optional variable (`METRICS_TOKEN=` in `.env.example`) would have stopped the server from booting → empty counts as unset.

**Exit Criteria:** CI green, E2E green locally, Lighthouse a11y ≥ 90 on the landing and room pages.

**Commit:** `chore: metrics, e2e tests, UI polish`

---

## P14 · Docs & Release

**Tasks**
- [x] `README.md`: live URL, feature list, screenshots/GIF, quick start (`docker compose up -d && pnpm i && cp .env.example .env && pnpm dev`), env table, deployment notes, scaling results, trade-offs, known limitations
- [x] `docs/ARCHITECTURE.md`: condensed from LLD (diagram, WebSocket flow, sync algorithm, RBAC, scaling)
- [x] `docs/WALKTHROUGH.md`: talking points per library and per design decision (the brief's "Code Understanding" section)
- [ ] 2–3 min demo video (host / mod / participant split screen). Optional in the brief; to be recorded by the author (narration). Screenshots are in the README.
- [x] Final prod deploy, smoke test, tag `v1.0.0`

**Done.**
- **Fresh clone:** a clone from GitHub following only the README ran locally; its own sync and roles E2E tests passed against it.
- **Production:** all 17 E2E tests pass against production (no restarts during the run). `/metrics` is enabled and token-protected (401 without the token).
- **Found and fixed:** a host was occasionally asked for their name again after creating a room. better-auth rate-limited `/get-session` per IP, and the client kept its stale session after a 429. Session reads are now exempt; covered by a Postgres test.
- **New spec:** `e2e/smoke.spec.ts` covers the two checklist items the suite lacked (refresh keeps role and position; demotion relocks controls).

**Exit Criteria:** a fresh clone following only the README runs locally. The live URL passes the smoke checklist below.

### Final smoke checklist (prod)

All items are automated and passed against production (`E2E_BASE_URL=… pnpm e2e`). Separate browser contexts stand in for second devices; a manual check on a real phone over mobile data is still worthwhile.

- [x] Create room → share link → join as guest on a second device (`room.spec`, `sync.spec`)
- [x] Play / pause / seek / change video sync (< 1s) (`sync.spec`: drift < 1 s asserted)
- [x] Participant blocked → requests → host approves → applied (`roles.spec`, `social.spec`)
- [x] Promote to moderator → controls unlock. Demote → they lock again. (`roles.spec`, `smoke.spec`)
- [x] Remove participant → kicked screen, can't rejoin (`roles.spec`)
- [x] Transfer host. Host closes tab → succession after 15s. (`roles.spec`, `chaos.spec`)
- [x] Chat, reactions, queue auto-advance (`social.spec`)
- [x] Refresh mid-video → same role, same position (`smoke.spec`)
