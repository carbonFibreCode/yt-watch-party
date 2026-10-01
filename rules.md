# Engineering Rules

> **These rules are binding** for every line of code, every commit, and every doc in this repository, whether written by a human or by Claude.
> They come from the project owner's explicit directives (§1) plus standard professional practice (§2–§14).
> **"MUST"** = non-negotiable. **"SHOULD"** = default; deviating requires a written reason in the PR/commit body.

---

## 0. Precedence & Source of Truth

1. **`rules.md` > `LLD.md` > `building_plan.md` > `plan.md`.** If they conflict, the higher one wins. Fix the lower document in the same change.
2. **The design is decided up front.** The code MUST implement `LLD.md` as written: class names, interfaces, event names, payloads, constants, error codes.
3. **To change a decision, update the doc first, then the code.**
   - Update `LLD.md` (and `plan.md`/`building_plan.md` if affected) in the same commit as the code change.
   - State *why* in the commit body.
   - Code and docs MUST never disagree.
4. **No "later."**
   - No `TODO`, `FIXME`, `XXX`, or `HACK` comments are merged.
   - No stubbed functions in non-test code.
   - No "we'll handle this edge case later."
   - Anything out of scope is listed in LLD §Non-Goals. Everything else is built completely or not at all.

---

## 1. Owner Directives (non-negotiable)

| # | Directive | What it means in practice |
|---|---|---|
| D1 | **Follow proper LLD patterns** | Use the patterns named in LLD §1.3, in the places named there: Aggregate, Value Object, Command + Registry, Pipeline, Domain Events, Repository, Decorator, Strategy, Adapter, Unit of Work, Factory, Presenter. Never apply a pattern where the LLD doesn't call for it (no speculative abstraction). |
| D2 | **Strictly SOLID** | See §3. Every PR is checked against it. |
| D3 | **DRY, by heart** | See §4. Every piece of knowledge has exactly one home. |
| D4 | **Library or open source first, before writing it ourselves** | See §5. Writing our own code requires a recorded "why not a library" justification. |
| D5 | **Everything known now; nothing left for later** | See §0.4. Phase exit criteria in `building_plan.md` are gates, not suggestions. |
| D6 | **Polished** | Code, UI, and docs ship in a finished state: consistent naming, no dead code, no console noise, no placeholder copy, responsive and accessible UI. |
| D7 | **Build in the planned order** | Follow `building_plan.md` phase order. Never start a phase while the previous gate is red. |

---

## 2. Architecture Rules

1. **Layering** (LLD §1.4), enforced by ESLint `import-x/no-restricted-paths`:
   `shared` ← `domain` ← `application` ← `infrastructure` ← `main.ts`. A layer MUST NOT import from a layer to its right.
   Exception: application **tests** (and `application/test/**` harness code) may import infrastructure adapters, because a test is a composition root. Production application code never may.
2. **Domain purity.** `apps/server/src/domain/**` MUST NOT:
   - perform I/O
   - read `Date.now()` or `new Date()`
   - call `Math.random()` or `crypto`
   - import Node built-ins
   - import any third-party package except `zod` via `shared`

   Time and ids are passed in as arguments.
3. **Ports & adapters.**
   - Application code depends only on interfaces in `application/ports.ts`.
   - Third-party SDKs (better-auth, node-redis, drizzle, youtube-player, timesync, rate-limiter-flexible) are touched **only** inside their adapter file.
4. **Single mutation path.** Room state changes MUST go through `RoomService.mutate()`. There are no direct repository writes for rooms anywhere else.
5. **Single emit path.**
   - Server→client emissions MUST go through `Broadcaster` (domain events) or `ChatService`/side-channel handlers. Handlers never call `io.emit` directly.
   - Client→server commands MUST go through `rpc()`. Components never call `socket.emit` directly.
6. **Server is authoritative.** Clients send intents only. The client never mutates shared state optimistically, and clients never talk peer-to-peer.
7. **Composition root only.** Concrete classes are constructed **only** in `main.ts` (server) or provider/factory modules (client). No module-level singletons holding I/O clients, except the composition root's.
8. **One room per socket.** Joining another room leaves the current one first.

---

## 3. SOLID Checklist (apply to every class/module)

| Principle | Rule | Red flags that MUST be fixed before merge |
|---|---|---|
| **S** | One reason to change per class/module. Files ≤ ~250 lines. Functions ≤ ~40 lines. | A class name with "And"/"Manager"/"Utils". A handler doing I/O *and* domain logic *and* emitting |
| **O** | Extend via new classes or data entries (handlers, presenters, capability table, rate rules), never by editing a central `switch`/`if` chain | A `switch (event)` anywhere outside the registry. Adding a role requiring edits in > 2 files |
| **L** | Every implementation of a port passes that port's **shared contract test suite** | An implementation throwing "not supported". Behavior differences between InMemory and Redis repos |
| **I** | Ports are small and role-specific. Consumers receive only what they use (`CommandContext`) | Passing the whole container or `io` into a handler. Optional methods on interfaces |
| **D** | High-level code depends on abstractions. Concretions are wired in the composition root | `new RedisRoomRepository()` inside a service. Importing `better-auth` outside `infrastructure/auth` |

---

## 4. DRY Rules

1. **Single sources** (LLD §1.2). These MUST NOT be redefined anywhere:
   - event names and payloads → `shared/contract`
   - permissions → `shared/permissions.ts`
   - position math → `shared/playback.ts`
   - error codes and messages → `shared/errors.ts`
   - numbers and limits → `shared/constants.ts`
   - YouTube parsing → `shared/youtube.ts`
   - channel names → `realtime/channels.ts`
2. **Types derive from schemas.** Use `z.infer` and mapped types. Never hand-write a type that duplicates a zod schema.
3. **No magic numbers or strings.** Any literal with domain meaning lives in `constants.ts` or an enum. Exceptions: `0`, `1`, `-1`, and CSS/Tailwind classes.
4. **One code path per behavior.** Approved requests reuse the original command handler. "Play now" reuses `change_video` + `queue_remove`. Client UI permission checks reuse `PermissionPolicy`.
5. **Rule of three for helpers.** Extract on the second real duplication. Don't pre-abstract on the first.
6. **DRY is about knowledge, not keystrokes.** Two similar-looking test cases are fine. Two places that each decide "who may seek" are not.

---

## 5. Library-First Protocol (D4)

Before writing any non-trivial utility (more than ~20 lines, or anything touching protocol, crypto, time sync, parsing, rate limiting, auth, retries, or caching):

1. **Search**, in this order:
   - LLD §2 (already decided)
   - npm (`npm view <pkg>`)
   - Context7 docs
   - GitHub open source (including the prior-art repos in LLD §2.3)
2. **Evaluate.** A library qualifies if it is:
   - maintained (a release in the last ~24 months, *or* a stable algorithm with no open critical issues)
   - typed (bundled types or `@types/*`)
   - permissively licensed (MIT, Apache-2.0, BSD, ISC)
   - reasonably adopted
   - small relative to the benefit
3. **Decide and record.** Add a row to LLD §2.1 (chosen) or §2.2 (rejected, with the reason) **in the same commit** that introduces the dependency or the in-house code.
4. **Wrap it.** Every third-party library is used through an adapter or port when it touches domain or application logic (§2.3).
5. **Pin it.** Exact versions go in `package.json` (no `^`). `pnpm-lock.yaml` is committed. No new dependency without step 3.
6. **Use current APIs.** Verify against current docs (Context7) before writing integration code. Never code from memory for library APIs.

---

## 6. TypeScript & Code Style

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` are on.
- **No `any`.** Use `unknown` + narrowing. No `as` casts except `as const` and in test builders. No `!` non-null assertions in production code. No `@ts-ignore`; `@ts-expect-error` is allowed only in tests, with a reason.
- Prettier formats. ESLint (`strict-type-checked`) passes with **zero warnings**.
- **Generated code:** `apps/web/src/components/ui/**` is vendored shadcn/ui output. It's added via `shadcn add` and only those two generated-code lint rules (explicit return types, fast-refresh exports) are relaxed there. Edit generated files only when the change is intentional and documented in the file.
- Prefer `readonly` fields, `ReadonlyArray`, and immutable value objects. Mutate only inside aggregates.
- `async`/`await` only. No floating promises (`@typescript-eslint/no-floating-promises`). Every `setInterval`/`setTimeout`/listener has a matching cleanup.
- Named exports only (except where a framework requires default exports). One primary class or component per file. File name = export name.
- Comments explain **why**, not what. No commented-out code.

### Naming

| Kind | Convention | Example |
|---|---|---|
| Classes, types, interfaces, React components | `PascalCase`, no `I` prefix | `RoomService`, `VideoPlayer` |
| Functions, variables | `camelCase`, verbs for functions | `projectPosition`, `pickSuccessor` |
| Constants | `SCREAMING_SNAKE_CASE` | `GRACE_PERIOD_MS` |
| Units in names | Always suffix units | `…Ms`, `…S`, `…Seconds` |
| Wire events | `snake_case` (brief-mandated) | `change_video` |
| Domain events | `PascalCase` past tense | `RoleAssigned` |
| Port implementations | `<Tech><Port>` | `RedisRoomRepository`, `OEmbedMetadataProvider` |
| Hooks | `use<Thing>` | `usePlayerSync` |
| Booleans | `is/has/can/should` | `isPlaying` |

---

## 7. Error Handling

1. **Intentional failures** throw `DomainError(code)` with a code from `shared/errors.ts`. Never throw strings or bare `Error` for expected conditions.
2. **Validate at every boundary** with zod: socket payloads, HTTP bodies, env vars, oEmbed responses. Inside the boundary, trust the types.
3. **Every socket command acks** `AckResult<T>`, success or failure. Unknown errors map to `INTERNAL`, are logged with stack and context, and never leak internals to the client.
4. **Never swallow errors.** An empty `catch` is forbidden. Degradation (e.g. oEmbed timeout → fallback metadata) is explicit, logged at `warn`, and tested.
5. **Client:** `rpc()` is the only place that turns errors into toasts. Components handle the thrown `RpcError` only when they need custom UX.

---

## 8. Realtime & Protocol Rules

1. **Brief-mandated event names** are kept verbatim. New events follow the same `snake_case` style and are added to `shared/contract` first.
2. **Events carry what clients need.** Membership events carry the full `participants` list (as the brief specifies). Playback events carry `serverTime` + `rev`.
3. **Every handler declares** `capability`, `requiresMembership`, `requestable`, and `rateRule`. The pipeline enforces them, never ad-hoc checks.
4. **Idempotency.** Re-sent `play`/`pause`, duplicate `video_ended`, repeated `join_room` from another tab, and double-resolve of a request all have defined no-op or error outcomes, each with a test.
5. **WebSocket transport only** (`transports: ['websocket']`). Ack timeout is `ACK_TIMEOUT_MS`.

---

## 9. Frontend Rules

1. Components are **presentational**. Logic lives in hooks or pure TS modules (`SyncEngine`, store). No business rules in JSX.
2. Server state over REST uses **TanStack Query**. Realtime room state uses the **Zustand store fed by `bindRoomEvents`**. No duplicated state in `useState`.
3. Subscribe with **selectors** (`useRoomStore(s => s.playback)`). Never subscribe to the whole store.
4. Every control is permission-aware through `useCan`. It shows one of three states: enabled, request-mode, or disabled with a tooltip explaining why.
5. UI is built from **shadcn/ui primitives** + Tailwind tokens. No ad-hoc colors (use theme tokens). Dark + light both work.
6. **Accessibility:** every interactive element is keyboard-reachable and labeled. Focus is visible. Toasts don't steal focus. Color isn't the only signal for roles or presence.
7. **Responsive:** works at 360px width (sidebar becomes a sheet) with no horizontal scroll.
8. **Every async UI** has loading, empty, and error states.

---

## 10. Testing Rules

1. **Tests ship with the code,** in the same commit. A phase gate includes its tests (`building_plan.md`).
2. **Coverage floors:** `shared` pure modules 100% lines, `domain/` ≥ 95%, `application/` ≥ 85%.
3. **No mocking frameworks for our own code.** Use fakes that implement ports (`FakeClock`, `FakePlayer`, `InMemory*`, `StaticSessionResolver`). Stub only external I/O (`fetch`).
4. **Contract suites** are mandatory for every port with more than one implementation (LSP proof).
5. **Test names state behavior:** `it('rejects change_video from a participant with FORBIDDEN')`.
6. **Deterministic:** no real timers in unit tests (fake timers or `FakeClock`) and no network except in integration tests against docker-compose services.
7. **A bug fix starts with a failing test** that reproduces it.

---

## 11. Security Rules

1. **Never trust client identity.** `userId`, `name`, and `role` always come from the session or room state, never from payloads.
2. Authorization is enforced server-side on every command (pipeline `authorize` + re-check in `execute`). UI gating is convenience only.
3. **Secrets live only in env vars.** `.env` is git-ignored and `.env.example` is kept current. No secrets in logs, ack errors, or the client bundle.
4. Rate limits per LLD SP-17 on every event and on `POST /api/rooms`.
5. Never render user content as HTML (`dangerouslySetInnerHTML` is forbidden).
6. Helmet CSP as specified. Socket origin check. `maxHttpBufferSize` limit. Secure cookies in production.
7. Dependencies: `pnpm audit --prod` has no high or critical findings at release.

---

## 12. Logging & Observability

- Use `pino` only. **No `console.*`** in committed code (ESLint `no-console`).
- Structured fields, never string interpolation: `log.info({ roomId, event, outcome }, 'command handled')`.
- Levels:
  - `debug`: per-command trace
  - `info`: lifecycle (boot, room created, shutdown)
  - `warn`: rejected/degraded paths (`FORBIDDEN`, `RATE_LIMITED`, oEmbed fallback)
  - `error`: `INTERNAL` only
- Never log chat text, emails, cookies, or tokens.

---

## 13. Git & Workflow

1. **Conventional Commits:** `feat(scope): …`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`. Scopes: `shared`, `domain`, `app`, `server`, `web`, `scale`, `deploy`, `docs`.
2. **Commit at every phase gate** (`building_plan.md` lists the message). Smaller commits within a phase are encouraged. Each commit builds and passes tests.
3. **Never commit** a red build, secrets, `.env`, build output, or generated files that are reproducible (except migrations and the lockfile).
4. A commit that changes a design decision updates `LLD.md` in the same commit (§0.3).
5. `main` must always be deployable from P9 onwards.

---

## 14. Definition of Done (per task, per phase)

A task is done only when **all** of these hold:

- [ ] Implements `LLD.md` exactly (or LLD was updated first, per §0.3)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass with zero warnings
- [ ] Tests added per §10. Coverage floors held.
- [ ] SOLID checklist (§3) and DRY rules (§4) reviewed. No red flags.
- [ ] Any new dependency recorded in LLD §2 (§5)
- [ ] No `TODO`/`console`/`any`/dead code/placeholder copy
- [ ] UI: responsive, accessible, all states (loading/empty/error) present
- [ ] The phase's Exit Criteria in `building_plan.md` are verified, with manual steps actually performed
- [ ] Docs updated if behavior, setup, or env changed

---

## 15. Forbidden (quick reference)

`any` · `@ts-ignore` · `console.*` · `TODO`/`FIXME` · empty `catch` · magic numbers · `switch(event)` dispatch · `socket.emit` outside `rpc()` · `io.emit` outside `Broadcaster` · room writes outside `RoomService.mutate` · I/O or clock or randomness in `domain/` · SDK imports outside adapters · trusting payload identity · `dangerouslySetInnerHTML` · unpinned dependencies · unrecorded dependencies · native YouTube controls · optimistic playback UI · starting a phase on a red gate
