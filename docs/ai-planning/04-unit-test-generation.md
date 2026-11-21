# 04 — Unit Test Generation Plan & Verification Matrix

> **Stage:** Stage 4 — Backend Unit & Integration Testing Strategy  
> **Status:** Planned & Implemented (49 Unit Tests + 5 E2E Tests Passing)  
> **Scope:** Test runner alignment, mocking boundaries, mandatory test matrices across all 5 required backend areas + supporting modules, execution commands, and actionable TODO checklist.

---

## 1. Testing Architecture & Runner Strategy

### 1.1 Test Runner Alignment (Vitest 4 vs. Jest)
- **Project Environment:** The scaffolded NestJS 12 backend (`backend/package.json`) uses pure ESM (`"type": "module"`), TypeScript 6, and **Prisma ORM 8** (`@prisma/orm-postgres` with ESM JSON import attributes `with { type: 'json' }`), pre-configured with **Vitest 4** (`vitest run`, `globals: true`).
- **Compatibility:** Vitest exposes a Jest-compatible authoring API (`describe`, `it`, `expect`, `beforeEach`, `afterAll`) with native ESM/TypeScript execution (`vi.fn()`, `vi.spyOn()`), requiring zero brittle experimental Node VM flags.
- **Commands:**
  - Unit tests: `npm run test` (`vitest run`, matches `src/**/*.spec.ts`)
  - Coverage report: `npm run test:cov` (`vitest run --coverage`)
  - E2E tests: `npm run test:e2e` (`vitest run --config ./vitest.config.e2e.ts`, matches `test/**/*.e2e-spec.ts`)

### 1.2 Testing Pyramid & Isolation Rules

| Layer | File Pattern | External Dependencies | Purpose |
|---|---|---|---|
| **Unit Tests** | `backend/src/**/*.spec.ts` | **100% Mocked** (mock `PrismaService`, mock `axios.post`, mock `ConfigService`, stub `sleep`) | Ultra-fast (< 1.5s), deterministic verification of business rules, auth guard, retry math, scheduler locking/idempotency, SSRF/payload validation, and aggregation math. **Zero real Discord HTTP calls.** |
| **E2E Integration Tests** | `backend/test/*.e2e-spec.ts` | Real NestJS HTTP pipeline (`Supertest`) + Real local PostgreSQL; **mocked `DiscordService`** | Proves real `AppModule` wiring, `ApiKeyGuard`, `ValidationPipe`, `AllExceptionsFilter`, Prisma ORM 8 queries, `ON DELETE CASCADE`, and full endpoint lifecycle. |

---

## 2. Mandatory Unit Test Generation Matrix

Covers all 5 mandatory testing domains required by `backend/AGENTS.md` Section 13 plus validators, logs, and dashboard statistics:

### 2.1 API Key Authentication Guard (`src/auth/api-key.guard.spec.ts`)
| # | Scenario | Expected Behavior |
|---|---|---|
| 1 | Route decorated with `@Public()` | Returns `true` without checking `x-api-key` header |
| 2 | Valid `x-api-key` matching `API_KEY` env | Returns `true` using constant-time comparison |
| 3 | Missing `x-api-key` header | Throws `UnauthorizedException` (`401`) |
| 4 | Empty / whitespace-only `x-api-key` header | Throws `UnauthorizedException` (`401`) |
| 5 | Wrong `x-api-key` value | Throws `UnauthorizedException` (`401`) |
| 6 | Server `API_KEY` not configured | Throws `UnauthorizedException` (`401`) |

### 2.2 Discord Webhook Service — Mocked Axios (`src/discord/discord.service.spec.ts`)
| # | Scenario | Expected Behavior |
|---|---|---|
| 1 | HTTP `204 No Content` | `success: true`, `retryable: false`, `httpStatus: 204`, verifies `Content-Type: application/json` & timeout |
| 2 | HTTP `429` with `Retry-After` header | `success: false`, `retryable: true`, `httpStatus: 429`, parses `retryAfterMs` accurately |
| 3 | HTTP `429` with JSON body `retry_after` | `retryable: true`, extracts fallback `retryAfterMs` from response body |
| 4 | HTTP `503` (5xx server error) | `success: false`, `retryable: true`, `httpStatus: 503` |
| 5–8 | HTTP `400`, `401`, `403`, `404` (4xx client errors) | `success: false`, `retryable: false` (never retried) |
| 9 | Axios network timeout (`ECONNABORTED`) | `success: false`, `retryable: true`, `httpStatus: null`, timeout message recorded |
| 10 | Disallowed internal/metadata URL (`http://169.254.169.254/...`) | Blocks request before calling `axios.post`, returns `retryable: false` (SSRF protection) |

### 2.3 Task CRUD & Lifecycle (`src/tasks/tasks.service.spec.ts`)
| # | Scenario | Expected Behavior |
|---|---|---|
| 1 | Create `ACTIVE` task | Computes future `nextRunAt`, defaults `maxRetry: 3` & `timezone: 'UTC'`, returns `webhookUrlMasked` and omits raw `webhookUrl` |
| 2 | Create `PAUSED` task | Persists `status: 'PAUSED'` with `nextRunAt: null` |
| 3 | Create with invalid cron expression | Throws `BadRequestException` (`400`) |
| 4 | List tasks (`findAll`) with pagination & status filter | Returns `{ items, meta: { total, page, limit, totalPages } }` |
| 5 | Get missing task (`findOne`) | Throws `NotFoundException` (`404`) |
| 6 | Update cron expression | Recomputes `nextRunAt`, resets `retryCount = 0`, clears `lockedAt`/`lockedBy` |
| 7 | Activate paused task | Sets `status: 'ACTIVE'`, computes fresh `nextRunAt`, resets `retryCount = 0` |
| 8 | Deactivate active task | Sets `status: 'PAUSED'`, clears `nextRunAt: null`, resets `retryCount = 0` |
| 9 | Delete existing & missing task | Returns `{ deleted: true, id }` for existing; throws `NotFoundException` when missing |
| 10 | Manual execute (`execute`) | Delegates cleanly to `SchedulerService.executeTaskManually(id)` |

### 2.4 Scheduler Engine & Retry Mechanism (`src/scheduler/scheduler.service.spec.ts`)
| # | Scenario | Expected Behavior |
|---|---|---|
| 1 | Claim due active tasks (`claimDueTasks`) | Calls `.forNoKeyUpdate({ skipLocked: true })`, stamps `lockedAt`, `lockedBy`, and `lastExecutionStatus: 'RUNNING'` |
| 2 | Successful delivery (`executeClaimedTask`) | Writes `SUCCESS` log preserving correlated `executionId`, resets `retryCount = 0`, advances `nextRunAt` to next cron slot, clears lock |
| 3 | Retryable `503` failure with `retryCount < maxRetry` | Writes `RETRYING` log, increments `retryCount`, schedules `nextRunAt` with exponential backoff (`baseDelay * 2^retry`) |
| 4 | Retryable `429` failure with `retryAfterMs` | Uses Discord's `retryAfterMs` to schedule next retry `nextRunAt` |
| 5 | Retry limit exhausted (`retryCount === maxRetry`) | Stops retrying, writes `FAILED` log, resets `retryCount = 0`, advances `nextRunAt` to next regular cron slot |
| 6 | Non-retryable `400` failure when `maxRetry > 0` | Immediately writes `FAILED` log without scheduling retry |
| 7 | PostgreSQL unique violation (`23505`) duplicate guard | Catches `23505` gracefully, logs warning, releases worker lock without crashing scheduler |
| 8 | Overlapping in-process poll tick | Second concurrent `pollAndExecuteDueTasks()` returns `0` immediately while first tick is active |
| 9 | Startup crash recovery (`recoverOnStartup`) | Releases stale leases (`lockedAt < staleCutoff`) and hydrates missing `nextRunAt` on `ACTIVE` tasks |
| 10 | Manual execution retry loop (`executeTaskManually`) | Retries on `502`, succeeds on attempt 2, logs both attempts under shared `executionId` |
| 11 | Manual execution on missing task | Throws `NotFoundException` (`404`) |

### 2.5 Logs, Dashboard & Validators (`task-logs`, `dashboard`, `common/validators`)
- **`src/dashboard/dashboard.service.spec.ts` (2 tests):**
  - Verifies parallel DB aggregations (`totalTasks`, `activeTasks`, `pausedTasks`, `disabledTasks`, `failedTasks`, `totalExecutions`, `successfulExecutions`, `failedExecutions`, `retryingExecutions`), `successRate` excluding intermediate `RETRYING` rows, rounded `averageDurationMs`, and `recentExecutions` mapping.
  - Verifies zero-log edge case (`successRate: 0`, `averageDurationMs: null`, `recentExecutions: []`).
- **`src/task-logs/task-logs.service.spec.ts` (2 tests):**
  - Verifies paginated log retrieval with `taskName` relation mapping and status filtering.
  - Verifies `findByTask` throws `NotFoundException` when task ID does not exist.
- **`src/common/validators/validators.spec.ts` (7 tests):**
  - Cron validation (`5-field`, timezone-aware, invalid rejection), IANA timezone validation, `computeNextRunAt` UTC accuracy, SSRF webhook URL allowlist + `ALLOW_NON_DISCORD_WEBHOOKS` toggle, webhook token masking, and Discord JSONB payload validation.
- **`src/app.controller.spec.ts` (1 test):** Baseline NestJS controller sanity check.

### 2.6 E2E Integration Suite (`test/app.e2e-spec.ts` — 5 tests)
1. `GET /api/health` is public (`200 OK`) and confirms PostgreSQL connectivity.
2. `GET /api/tasks` without `x-api-key` returns `401 Unauthorized`.
3. `GET /api/tasks` with wrong `x-api-key` returns `401 Unauthorized`.
4. `POST /api/tasks` with invalid cron, SSRF URL, and empty payload returns `400 Bad Request`.
5. Full lifecycle against real PostgreSQL (mocked `DiscordService`): Create (`201`, masked webhook) -> Get (`200`) -> Patch (`200`) -> Deactivate (`200`) -> Activate (`200`) -> Manual Execute (`200`) -> Task Logs (`200`) -> Dashboard Summary (`200`) -> Delete (`200`, cascades logs) -> Get deleted (`404`).

---

## 3. Verification Results Snapshot

| Command | Result | Summary |
|---|---|---|
| `cd backend && npm run test` | **PASS** | 8 test files, **49/49 unit tests passed** (~1.0s) |
| `cd backend && npm run test:e2e` | **PASS** | 1 test file, **5/5 E2E integration tests passed** against PostgreSQL |
| `cd backend && npm run lint` | **PASS** | 0 errors, 0 warnings (`oxlint --type-aware`, 48 files) |
| `cd backend && npm run build` | **PASS** | Clean TypeScript & NestJS compilation (`nest build`) |

---

## 4. Actionable TODO Checklist (Unit Test Generation)

### Mandatory Testing Checklist
- [x] Generate unit tests for `ApiKeyGuard` covering `@Public()`, valid key, missing key, empty key, invalid key, and missing server config (`src/auth/api-key.guard.spec.ts`).
- [x] Generate unit tests for `DiscordService` with mocked Axios covering `204`, `429` (`Retry-After` header & body), `5xx`, `400/401/403/404`, timeout, and SSRF URL blocking (`src/discord/discord.service.spec.ts`).
- [x] Generate unit tests for `TasksService` covering CRUD, pagination, invalid cron rejection, webhook masking, activate/deactivate, and manual execute delegation (`src/tasks/tasks.service.spec.ts`).
- [x] Generate unit tests for `SchedulerService` covering `FOR NO KEY UPDATE SKIP LOCKED` claiming, success scheduling, exponential backoff retry, `429 Retry-After` scheduling, `maxRetry` exhaustion, non-retryable `4xx`, PostgreSQL `23505` duplicate guard, poll overlap prevention, startup recovery, and manual retry loop (`src/scheduler/scheduler.service.spec.ts`).
- [x] Generate unit tests for `DashboardService`, `TaskLogsService`, and common cron/webhook/payload validators.
- [x] Generate E2E API integration suite (`test/app.e2e-spec.ts`) verifying live NestJS + PostgreSQL stack with mocked Discord delivery and automatic test data cleanup.
- [x] Run `npm run test`, `npm run test:e2e`, `npm run lint`, and `npm run build` — verify 100% pass rate.

### Optional Testing Enhancements *(P1/P2)*
- [ ] Add `npm run test:cov` coverage threshold enforcement (e.g., >= 80% lines/branches) in `backend/vitest.config.ts`.
- [ ] Add dedicated PostgreSQL concurrency integration test running two parallel `db.transaction()` claims against one due task row to verify `SKIP LOCKED` at the database level.
- [ ] Add frontend unit/component tests (Vitest / React Testing Library) for `formatters.ts`, `TaskForm.tsx`, and `DiscordPreview.tsx`.
