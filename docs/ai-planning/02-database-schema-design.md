# 02 — Database Architecture, Schema Design & Prisma ORM 8 Migration Plan

> **Stage:** Stage 2 — Database Design & Prisma Migration Planning  
> **Status:** Draft — Awaiting Approval  
> **Scope:** PostgreSQL schema architecture, ERD, indexing & constraints, scheduler/retry reliability mechanics, verified Prisma ORM 8 compatibility assessment, migration workflow, and database testing plan.  
> **Strict Rule:** Planning only. No source code, Prisma contract files, dependencies, or database tables are modified until this document is approved.

---

## 1. Database Architecture Overview

### 1.1 Architectural Role of PostgreSQL

In the **Discord Task Scheduler**, PostgreSQL (v15+, targeting **PostgreSQL 16 Alpine** in Docker) is the **single durable source of truth** for:

1. **Task Definitions (`tasks`)** — Schedule metadata (`cron_expression`, `timezone`, `next_run_at`), Discord target (`webhook_url`, `payload` JSONB), retry policy (`max_retry`), lifecycle state (`status`), and distributed execution coordination (`locked_at`, `locked_by`, `retry_count`).
2. **Execution History & Observability (`task_logs`)** — Append-only audit trail recording every execution attempt (initial run and each retry), HTTP status, latency, outcome message, correlation identifier (`execution_id`), and scheduled-slot idempotency key (`scheduled_for`).
3. **Prisma ORM 8 Contract Marker (`prisma_contract.marker`)** — Managed automatically by Prisma ORM 8 to track the exact deployed contract hash and prevent schema drift.

### 1.2 Design Philosophy

- **Pragmatic Two-Table Core (`tasks` + `task_logs`):** Satisfies all technical test requirements cleanly without introducing premature multi-table normalization overhead (see Section 4.3 for the full 2-table vs. 3-table trade-off analysis).
- **Database-Backed Scheduler Reliability:** Rather than relying purely on volatile in-memory timers, schedule state (`next_run_at`, `retry_count`, `locked_at`, `locked_by`) is persisted in PostgreSQL. This enables crash recovery on container restarts, safe concurrent polling across multiple instances (`FOR NO KEY UPDATE SKIP LOCKED`), and database-enforced duplicate execution protection.
- **Short Transactions Only:** Following `backend/AGENTS.md` and `nestjs-data` guidance, PostgreSQL transactions are kept strictly microsecond-short (claim lease -> commit -> perform Discord HTTP `POST` outside any DB transaction -> record log & advance schedule -> commit). No database connection or row lock is ever held across network I/O.
- **UTC Everywhere:** All timestamps are stored as `timestamptz(3)` in UTC. Per-task IANA `timezone` strings are stored separately so `cron-parser` computes wall-clock/DST-accurate next execution instants in UTC.
- **Code-First Contract & Migrations:** All tables, columns, indexes, and constraints are authored exclusively in `backend/src/prisma/contract.prisma` (Prisma ORM 8 PSL) and applied strictly through Prisma ORM 8 migration packages — never via pgAdmin or ad-hoc SQL DDL.

---

## 2. Proposed Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    TASKS ||--o{ TASK_LOGS : "has many execution attempts"

    TASKS {
        uuid id PK "UUIDv7 client-generated primary key"
        varchar name "Human-readable task name (max 255)"
        varchar cron_expression "Cron schedule expression (max 100)"
        varchar timezone "IANA timezone, default UTC (max 64)"
        text webhook_url "Discord webhook endpoint URL"
        jsonb payload "Discord webhook JSONB payload"
        int4 max_retry "Max retries per execution cycle (0..10, default 3)"
        text status "Enum CHECK: ACTIVE | PAUSED | DISABLED"
        timestamptz next_run_at "Next due UTC instant (cron or retry backoff)"
        timestamptz last_run_at "Timestamp of last execution attempt"
        text last_execution_status "Nullable Enum CHECK: RUNNING | RETRYING | SUCCESS | FAILED"
        int4 retry_count "Persisted retry counter for active cycle (default 0)"
        timestamptz locked_at "Active worker lease timestamp (nullable)"
        varchar locked_by "Worker instance ID holding lease (nullable, max 100)"
        timestamptz created_at "Creation timestamp (UTC)"
        timestamptz updated_at "Last modification timestamp (UTC)"
    }

    TASK_LOGS {
        uuid id PK "UUIDv7 client-generated primary key"
        uuid task_id FK "References tasks.id (ON DELETE CASCADE)"
        uuid execution_id "Groups initial attempt + retries for one run"
        timestamptz scheduled_for "Scheduled UTC slot (nullable for manual runs)"
        timestamptz executed_at "Actual execution attempt timestamp (UTC)"
        text status "Enum CHECK: RUNNING | RETRYING | SUCCESS | FAILED"
        int4 retry_count "Attempt retry index: 0 = initial, 1..N = retries"
        int4 http_status "Discord HTTP status code (nullable on network error)"
        int4 duration_ms "HTTP request duration in ms (nullable)"
        text message "Outcome summary or truncated error details"
        timestamptz created_at "Log record creation timestamp (UTC)"
    }
```

---

## 3. Table and Column Specifications

### 3.1 `tasks` Table (Model: `Task`, Physical Table: `public.tasks`)

| Column (DB) | Prisma Field | Prisma 8 PSL Type | PostgreSQL Type | Nullable | Default / Generator | Classification | Purpose & Validation Rules |
|---|---|---|---|---|---|---|---|
| `id` | `id` | `Uuid` | `uuid` | No | `@id @onCreate(uuid(7))` | **Mandatory** | Time-ordered UUIDv7 primary key (monotonic B-tree locality, non-enumerable API ID). |
| `name` | `name` | `Varchar(255)` | `varchar(255)` | No | — | **Mandatory** | Descriptive task name shown in UI/logs. Must be non-empty (`CHECK`). |
| `cron_expression` | `cronExpression` | `Varchar(100)` | `varchar(100)` | No | — | **Mandatory** | Cron expression validated by `cron-parser` at API layer. |
| `webhook_url` | `webhookUrl` | `Text` | `text` | No | — | **Mandatory** | Discord Webhook URL. Validated against Discord webhook URL pattern at API layer (token masked in app logs). |
| `payload` | `payload` | `Jsonb` | `jsonb` | No | — | **Mandatory** | Discord webhook JSON body stored in binary `jsonb` (`pg/jsonb@1`). |
| `max_retry` | `maxRetry` | `Int` | `int4` | No | `@default(3)` | **Mandatory** | Configurable maximum retry attempts after initial failure (`CHECK: 0 <= max_retry <= 10`). |
| `status` | `status` | `TaskStatus` | `text` + CHECK | No | `@default(ACTIVE)` | **Mandatory** | Desired task scheduling state (`ACTIVE`, `PAUSED`, `DISABLED`). |
| `created_at` | `createdAt` | `DateTime` | `timestamptz(3)` | No | `@default(now()) @onCreate(now())` | **Mandatory** | UTC record creation timestamp. |
| `updated_at` | `updatedAt` | `temporal.UpdatedAt` | `timestamptz(3)` | No | Prisma 8 `@onCreate(now()) @onUpdate(now())` | **Mandatory** | UTC last-modified timestamp (automatically updated on every ORM mutation). |
| `timezone` | `timezone` | `Varchar(64)` | `varchar(64)` | No | `@default("UTC")` | **Justified Addition** | IANA timezone (e.g., `UTC`, `Asia/Jakarta`) used by `cron-parser` to evaluate cron schedules accurately across DST. |
| `next_run_at` | `nextRunAt` | `DateTime?` | `timestamptz(3)` | Yes | `NULL` | **Justified Addition** | Next due UTC execution instant (or retry backoff target). `NULL` when `PAUSED`/`DISABLED`. Enables indexed due-task polling & restart recovery. |
| `last_run_at` | `lastRunAt` | `DateTime?` | `timestamptz(3)` | Yes | `NULL` | **Justified Addition** | UTC timestamp of the most recent attempt; supports dashboard & task list rendering without subqueries. |
| `last_execution_status` | `lastExecutionStatus` | `ExecutionStatus?` | `text` + CHECK | Yes | `NULL` | **Justified Addition** | Outcome of the latest execution (`RUNNING`, `RETRYING`, `SUCCESS`, `FAILED`) for O(1) task health display. |
| `retry_count` | `retryCount` | `Int` | `int4` | No | `@default(0)` | **Justified Addition** | Persisted retry counter for the currently active execution cycle (`0` when idle/succeeded; survives process crashes). |
| `locked_at` | `lockedAt` | `DateTime?` | `timestamptz(3)` | Yes | `NULL` | **Justified Addition** | Worker lease acquisition timestamp for concurrent scheduler safety and stale-lock recovery. |
| `locked_by` | `lockedBy` | `Varchar(100)?` | `varchar(100)` | Yes | `NULL` | **Justified Addition** | Worker identifier (`hostname:pid` or instance UUID) holding the active lease for debugging. |

> **Primary Key Choice (`Uuid` UUIDv7 vs. `Int autoincrement`):**  
> - *Alternative A:* `Int @id @default(autoincrement())` — smaller index (4 bytes), simple, but leaks record counts/creation order in public APIs and complicates distributed ID generation.  
> - *Alternative B (Recommended):* `Uuid @id @onCreate(uuid(7))` — native PostgreSQL 16-byte `uuid`, non-enumerable in REST APIs, and **time-ordered (UUIDv7)** so B-tree inserts remain sequential without UUIDv4 page-splitting fragmentation. First-class in Prisma ORM 8 (`pg/uuid@1` + `@onCreate(uuid(7))`).

---

### 3.2 `task_logs` Table (Model: `TaskLog`, Physical Table: `public.task_logs`)

| Column (DB) | Prisma Field | Prisma 8 PSL Type | PostgreSQL Type | Nullable | Default / Generator | Classification | Purpose & Validation Rules |
|---|---|---|---|---|---|---|---|
| `id` | `id` | `Uuid` | `uuid` | No | `@id @onCreate(uuid(7))` | **Mandatory** | Time-ordered UUIDv7 primary key; doubles as natural cursor-pagination tiebreaker. |
| `task_id` | `taskId` | `Uuid` | `uuid` | No | — | **Mandatory** | Foreign key referencing `tasks.id` (`ON DELETE CASCADE`). |
| `executed_at` | `executedAt` | `DateTime` | `timestamptz(3)` | No | `@default(now()) @onCreate(now())` | **Mandatory** | Exact UTC timestamp when this attempt ran. |
| `status` | `status` | `ExecutionStatus` | `text` + CHECK | No | — | **Mandatory** | Attempt execution outcome (`RUNNING`, `RETRYING`, `SUCCESS`, `FAILED`). |
| `retry_count` | `retryCount` | `Int` | `int4` | No | `@default(0)` | **Mandatory** | Zero-based retry number (`0` = initial attempt, `1` = 1st retry, ..., up to `tasks.max_retry`). |
| `message` | `message` | `Text?` | `text` | Yes | `NULL` | **Mandatory** | Human-readable result or truncated error/response body (capped at e.g. 2000 chars in app service). |
| `created_at` | `createdAt` | `DateTime` | `timestamptz(3)` | No | `@default(now()) @onCreate(now())` | **Mandatory** | UTC timestamp when log row was inserted. |
| `execution_id` | `executionId` | `Uuid` | `uuid` | No | `@onCreate(uuid(7))` | **Justified Addition** | Shared correlation UUID linking the initial attempt and all retry rows belonging to the same scheduled/manual trigger. |
| `scheduled_for` | `scheduledFor` | `DateTime?` | `timestamptz(3)` | Yes | `NULL` | **Justified Addition** | The task's `next_run_at` slot that triggered this run (`NULL` for manual "Run Now" triggers). Powers database-level duplicate-execution prevention. |
| `http_status` | `httpStatus` | `Int?` | `int4` | Yes | `NULL` | **Justified Addition** | Discord HTTP status (`204`, `200`, `400`, `404`, `429`, `500`); `NULL` for timeout/DNS/socket failures. |
| `duration_ms` | `durationMs` | `Int?` | `int4` | Yes | `NULL` | **Justified Addition** | End-to-end Discord webhook round-trip latency in milliseconds (`CHECK: duration_ms >= 0`). |

---

### 3.3 `payload` JSONB Structure

PostgreSQL `jsonb` (declared via Prisma 8's explicit **`Jsonb`** type, NOT `Json`) stores validated Discord Webhook Execute payloads while allowing flexible Discord schema evolution without DDL migrations.

**Canonical Discord Webhook Payload Shape (validated in application DTOs):**

```json
{
  "content": "Daily deployment reminder: verify staging healthchecks!",
  "username": "Task Scheduler Bot",
  "avatar_url": "https://example.com/bot-avatar.png",
  "tts": false,
  "embeds": [
    {
      "title": "System Check",
      "description": "All services are scheduled for inspection.",
      "color": 5814783,
      "fields": [
        { "name": "Environment", "value": "Production", "inline": true }
      ]
    }
  ],
  "allowed_mentions": {
    "parse": ["users", "roles"]
  }
}
```

**Database & Application Invariants for `payload`:**
- **Database level (`@@check`):** `jsonb_typeof(payload) = 'object'` ensures the column always stores a JSON object (never a bare JSON primitive or array).
- **Application level (DTO validation):** Requires at least one of `content` (non-empty string, <= 2000 chars per Discord API limits) or non-empty `embeds` array (<= 10 embeds per Discord API limits).
- **Why `Jsonb` over Prisma 8 Value Object (`type DiscordPayload { ... }`):** Prisma 8 value objects generate a strict PostgreSQL CHECK constraint prohibiting unknown keys (`references/contract.md` § *Value objects*). Discord webhooks support many optional/evolving fields (`components`, `flags`, `thread_name`, nested `embeds` properties). Plain `Jsonb` + application-level DTO validation avoids brittle schema migrations whenever a Discord payload field is added, while preserving binary JSONB storage and queryability.

---

## 4. Relationship Explanation & Architectural Trade-Offs

### 4.1 `tasks` (1) → (N) `task_logs`

- **Cardinality:** One `Task` has zero or many `TaskLog` rows (`1:N`). Every `TaskLog` belongs to exactly one `Task` (`task_id` is `NOT NULL`).
- **Referential Integrity:** Foreign key `task_logs.task_id -> tasks.id` with `ON DELETE CASCADE` (explicitly declared in Prisma 8 because Prisma 8 defaults to `Restrict`).
- **Auto-Indexed Foreign Key:** Prisma 8 automatically emits an index on foreign key columns, and our composite indexes starting with `task_id` optimize per-task log queries.

### 4.2 Deletion Behavior: Hard Delete (`ON DELETE CASCADE`) vs. Soft Delete (`deleted_at`)

| Aspect | Option A: Hard Delete (`ON DELETE CASCADE`) *(Recommended)* | Option B: Soft Delete (`deleted_at DateTime?`) |
|---|---|---|
| **Technical Test Alignment** | Direct, unambiguous CRUD (`DELETE /tasks/:id` removes task and cascading logs). | Requires hiding deleted tasks in every query (`WHERE deleted_at IS NULL`). |
| **Prisma 8 Ergonomics** | Zero boilerplate; Prisma 8 handles cascade cleanly at DB level. | Prisma 8 intentionally has **no built-in soft-delete/default-scope feature** (`references/contract.md` § *What Prisma 8 doesn't do yet*), increasing bug risk if a query omits the filter. |
| **Dashboard Statistics** | Stats reflect currently existing tasks and their logs cleanly. | Preserves historical failure/success logs of deleted tasks for audit reporting. |
| **Data Hygiene** | Prevents orphaned log growth when test tasks are deleted. | Requires periodic purge job. |

**Recommendation:** Use **Hard Delete with `ON DELETE CASCADE`** for the mandatory core. Document `deleted_at` soft-delete as an *optional* enhancement only if the product requires retaining execution analytics after task deletion.

### 4.3 Is a Third Table (`task_executions` / `task_attempts`) Necessary?

| Approach | Structure | Pros | Cons |
|---|---|---|---|
| **2 Tables *(Recommended)*** | `tasks` + `task_logs` (with `execution_id` UUID & `retry_count`) | Matches exact required tables (`tasks`, `task_logs`); zero extra joins on log feeds or dashboard stats; still records every attempt AND groups retries via `execution_id`. | Slight denormalization (`scheduled_for` repeated across retries of the same execution). |
| **3 Tables *(Over-engineered for scope)*** | `tasks` + `task_executions` (parent run) + `task_attempts` (per-HTTP attempt) | Strictly normalized 3NF; clean parent run status separate from attempt rows. | Violates simplicity ("avoid unnecessary complexity"); requires 2 writes per run + extra joins on every log query and stats aggregation; diverges from the explicit 2-table test spec. |

**Recommendation:** **Do NOT add a 3rd table.** Adding `execution_id` (`uuid`) and `scheduled_for` (`timestamptz`) to `task_logs` gives 100% of the observability and idempotency benefits of a 3-table design while keeping the schema strictly within the required `tasks` + `task_logs` footprint.

---

## 5. Index and Constraint Strategy

### 5.1 Index Plan

> **Prisma 8 Convention:** Use `name: "<prefix>"` (not `map:`) for all newly authored indexes and checks so Prisma 8 wire-names them cleanly (`<prefix>_<8hex>`) and avoids false drift warnings (`PN_EXACT_NAME_BODY_COMPARISON`).

| Table | Index Name Prefix | Columns / Predicate | Type | Query Pattern Served |
|---|---|---|---|---|
| `tasks` | `tasks_due_poll_idx` | `(next_run_at)` `WHERE status = 'ACTIVE' AND next_run_at IS NOT NULL` | **Partial B-Tree** | Core scheduler polling: finding due active tasks (`status = 'ACTIVE' AND next_run_at <= NOW()`). Keeps index tiny by excluding paused/disabled tasks. |
| `tasks` | `tasks_status_created_idx` | `(status, created_at DESC)` | Composite B-Tree | Task list filtering by status + default chronological sorting, and dashboard task count by status. |
| `tasks` | `tasks_locked_at_idx` | `(locked_at)` `WHERE locked_at IS NOT NULL` | **Partial B-Tree** | Fast stale-lease sweep on startup or periodic recovery (`locked_at < NOW() - leaseTimeout`). |
| `task_logs` | `task_logs_task_executed_idx` | `(task_id, executed_at DESC)` | Composite B-Tree | Per-task execution history (`GET /tasks/:id/logs` or `GET /logs?taskId=...`) + FK lookup efficiency. |
| `task_logs` | `task_logs_executed_id_idx` | `(executed_at DESC, id DESC)` | Composite B-Tree | Global log explorer default feed with stable cursor pagination (`ORDER BY executed_at DESC, id DESC`). |
| `task_logs` | `task_logs_status_executed_idx` | `(status, executed_at DESC)` | Composite B-Tree | Filtered log queries (`status = 'FAILED'`) and dashboard success/failure counts & recent failures. |
| `task_logs` | `task_logs_execution_id_idx` | `(execution_id, retry_count)` | Composite B-Tree | Grouping all retry attempts belonging to a single execution run. |
| `task_logs` | `task_logs_slot_idempotency_uq` | `(task_id, scheduled_for, retry_count)` `WHERE scheduled_for IS NOT NULL` | **Partial Unique** | **Duplicate execution prevention:** guarantees a given task's scheduled tick + retry index can be logged/executed at most once even under multi-instance races. |

### 5.2 Constraints Plan

| Table | Constraint Kind | Definition / Expression | Enforcement Layer | Purpose |
|---|---|---|---|---|
| `tasks` | `PRIMARY KEY` | `id` | PostgreSQL | Entity identity |
| `tasks` | `CHECK` (auto by Prisma 8 enum) | `status IN ('ACTIVE', 'PAUSED', 'DISABLED')` | PostgreSQL | Valid task lifecycle states |
| `tasks` | `CHECK` (auto by Prisma 8 enum) | `last_execution_status IS NULL OR last_execution_status IN ('RUNNING', 'RETRYING', 'SUCCESS', 'FAILED')` | PostgreSQL | Valid execution outcome states |
| `tasks` | `@@check` (`tasks_name_nonempty`) | `length(btrim(name)) > 0` | PostgreSQL | Prevents blank/whitespace-only names |
| `tasks` | `@@check` (`tasks_max_retry_range`) | `max_retry >= 0 AND max_retry <= 10` | PostgreSQL | Prevents negative or abusive retry loops |
| `tasks` | `@@check` (`tasks_retry_count_nonneg`) | `retry_count >= 0` | PostgreSQL | Prevents invalid negative retry counter |
| `tasks` | `@@check` (`tasks_payload_is_object`) | `jsonb_typeof(payload) = 'object'` | PostgreSQL | Ensures Discord payload is always a JSON object |
| `task_logs` | `PRIMARY KEY` | `id` | PostgreSQL | Log record identity |
| `task_logs` | `FOREIGN KEY` | `task_id REFERENCES tasks(id) ON DELETE CASCADE` | PostgreSQL | Referential integrity & clean task deletion |
| `task_logs` | `CHECK` (auto by Prisma 8 enum) | `status IN ('RUNNING', 'RETRYING', 'SUCCESS', 'FAILED')` | PostgreSQL | Valid log statuses |
| `task_logs` | `@@check` (`task_logs_retry_count_nonneg`) | `retry_count >= 0` | PostgreSQL | Non-negative attempt retry counter |
| `task_logs` | `@@check` (`task_logs_duration_nonneg`) | `duration_ms IS NULL OR duration_ms >= 0` | PostgreSQL | Non-negative latency measurement |

> **Unique Constraint on `tasks.name`? (Deliberate Decision):**  
> We intentionally **do NOT** put a `UNIQUE` constraint on `tasks.name`. Users commonly create similarly named tasks across different Discord channels/webhooks or recreate tasks with the same label. Requiring unique names adds unnecessary user friction without serving a relational integrity need.

---

## 6. Task and Execution Status Definitions

Separating **Task Schedule State (`TaskStatus`)** from **Execution Attempt State (`ExecutionStatus`)** prevents a single transient Discord outage from permanently breaking a recurring cron task.

### 6.1 `TaskStatus` (Enum stored as `pg/text@1` + CHECK)

| Value | Meaning | `next_run_at` Invariant | Scheduler Behavior |
|---|---|---|---|
| `ACTIVE` | Task is enabled and actively scheduled. | Non-null UTC timestamp computed from `cron_expression` + `timezone` (or backoff target if retrying). | Eligible for due-task claiming and execution. |
| `PAUSED` | Temporarily suspended by user/API. | Cleared (`NULL`) or ignored by partial index; recomputed to next future cron instant on resume. | Ignored by scheduler; existing logs preserved. |
| `DISABLED` | Deactivated (manually or optionally auto-disabled on permanent `404 Unknown Webhook`). | `NULL` | Ignored by scheduler until explicitly re-enabled. |

```mermaid
stateDiagram-v2
    [*] --> ACTIVE : Task Created (default)
    [*] --> PAUSED : Task Created as Paused
    ACTIVE --> PAUSED : Pause Action
    PAUSED --> ACTIVE : Resume (recompute next_run_at)
    ACTIVE --> DISABLED : Disable Action
    PAUSED --> DISABLED : Disable Action
    DISABLED --> ACTIVE : Re-enable (recompute next_run_at)
    ACTIVE --> [*] : Delete (CASCADE task_logs)
    PAUSED --> [*] : Delete (CASCADE task_logs)
    DISABLED --> [*] : Delete (CASCADE task_logs)
```

### 6.2 `ExecutionStatus` (Enum stored as `pg/text@1` + CHECK)

| Value | Meaning | Used in `task_logs.status` | Used in `tasks.last_execution_status` |
|---|---|---|---|
| `RUNNING` | Attempt claimed and HTTP request currently in flight. | Optional (or transition state if inserted pre-HTTP) | Yes (shows live in-progress status in UI) |
| `RETRYING` | Attempt failed with a retryable error, and `retry_count < max_retry`; next retry scheduled via backoff. | Yes (records the failed intermediate attempt) | Yes (signals task is awaiting backoff retry) |
| `SUCCESS` | Discord returned HTTP `2xx` (`204 No Content` or `200 OK`). | Yes (terminal for this cycle) | Yes |
| `FAILED` | Attempt failed and either `retry_count >= max_retry` (retries exhausted) or error is non-retryable (e.g., `400 Bad Request` / `404 Unknown Webhook`). | Yes (terminal for this cycle) | Yes |

> **Dashboard Statistics Clarity:**
> - **Attempt-level metrics** count rows in `task_logs` (`SUCCESS`, `RETRYING`, `FAILED`).
> - **Execution-outcome success rate** computes `SUCCESS / (SUCCESS + FAILED)` (terminal outcomes only, excluding intermediate `RETRYING` rows so a task that fails once and succeeds on retry counts as a recovered `SUCCESS` rather than inflating failure counts). Both terminal counts and total retries can be surfaced transparently in the dashboard API.

---

## 7. Retry and Scheduler Data Flow

### 7.1 Hybrid Scheduling Architecture (`@nestjs/schedule` + PostgreSQL State)

To satisfy both **NestJS `@nestjs/schedule`** and **crash-resilient, concurrency-safe execution**:

- **Dynamic Cron Tick / Poller:** `@nestjs/schedule` drives a lightweight periodic dispatcher (e.g., every 1–5 seconds via `@Cron` / `@Interval`) **or** per-task `SchedulerRegistry` cron triggers that **claim work through PostgreSQL** using `tasks.next_run_at` + row locking.
- **Why DB-backed `next_run_at` claiming is strictly superior to in-memory-only `CronJob`s:**
  1. **Survives restarts:** If the backend container restarts during a retry backoff or missed minute, `next_run_at <= NOW()` immediately catches due tasks on boot.
  2. **Multi-instance safe:** Two replicas running the same NestJS service will never double-fire a webhook.
  3. **Persisted retry backoff:** When attempt 0 fails, `tasks.retry_count` becomes `1` and `tasks.next_run_at` is set to `NOW() + backoffDelay` (or `Retry-After` from Discord `429`), so retry state is 100% durable in PostgreSQL — no volatile `setTimeout()` lost on shutdown!

### 7.2 Concurrent Claim & Execution Sequence (Short-Transaction Pattern)

```mermaid
sequenceDiagram
    participant Sched as NestJS Scheduler (@nestjs/schedule)
    participant DB as PostgreSQL (Prisma 8)
    participant Discord as Discord Webhook API

    Note over Sched,DB: Step 1: Atomic Claim (Short TX ~2ms)
    Sched->>DB: BEGIN
    Sched->>DB: SELECT tasks WHERE status='ACTIVE' AND next_run_at <= NOW() AND (locked_at IS NULL OR locked_at < NOW() - lease) ORDER BY next_run_at ASC LIMIT batch FOR NO KEY UPDATE SKIP LOCKED
    Sched->>DB: UPDATE tasks SET locked_at=NOW(), locked_by=workerId, last_execution_status='RUNNING'
    Sched->>DB: COMMIT

    Note over Sched,Discord: Step 2: External I/O (NO DB transaction held!)
    Sched->>Discord: HTTP POST webhook_url (JSON payload, timeout 10s)
    Discord-->>Sched: Response (204 OK / 429 Retry-After / 5xx / timeout)

    Note over Sched,DB: Step 3: Persist Log & Advance Schedule (Short TX ~2ms)
    Sched->>DB: BEGIN
    alt HTTP 2xx (Success)
        Sched->>DB: INSERT INTO task_logs (status='SUCCESS', retry_count=N, http_status, duration_ms, scheduled_for, execution_id)
        Sched->>DB: UPDATE tasks SET retry_count=0, last_run_at=NOW(), last_execution_status='SUCCESS', next_run_at=computeNextCron(cron, tz), locked_at=NULL, locked_by=NULL
    else Retryable Error AND retry_count < max_retry
        Sched->>DB: INSERT INTO task_logs (status='RETRYING', retry_count=N, http_status, duration_ms, message, scheduled_for, execution_id)
        Sched->>DB: UPDATE tasks SET retry_count=N+1, last_run_at=NOW(), last_execution_status='RETRYING', next_run_at=NOW()+backoffOrRetryAfter, locked_at=NULL, locked_by=NULL
    else Retries Exhausted OR Non-Retryable 4xx
        Sched->>DB: INSERT INTO task_logs (status='FAILED', retry_count=N, http_status, duration_ms, message, scheduled_for, execution_id)
        Sched->>DB: UPDATE tasks SET retry_count=0, last_run_at=NOW(), last_execution_status='FAILED', next_run_at=computeNextCron(cron, tz), locked_at=NULL, locked_by=NULL
    end
    Sched->>DB: COMMIT
```

### 7.3 How Each Reliability Requirement Is Guaranteed

| Requirement | Mechanism in Proposed Schema & Query Flow |
|---|---|
| **Dynamic task scheduling** | On `POST /tasks`, `cron-parser` computes initial `next_run_at` from `(cron_expression, timezone)`. On `PATCH /tasks/:id` (cron, timezone, or status change), `next_run_at` is recomputed immediately and `retry_count` reset if schedule changed. |
| **Finding due tasks** | Partial index `tasks_due_poll_idx` on `(next_run_at) WHERE status = 'ACTIVE' AND next_run_at IS NOT NULL` makes `WHERE status = 'ACTIVE' AND next_run_at <= NOW()` an index-only/index-range scan. |
| **Concurrent scheduler safety** | Prisma ORM 8 natively supports `.forNoKeyUpdate({ skipLocked: true })` inside `db.transaction()` (verified in `@prisma/orm-postgres` `references/queries-postgres.md`). Using `FOR NO KEY UPDATE` instead of `FOR UPDATE` avoids foreign-key `FOR KEY SHARE` deadlocks when concurrent writes insert into `task_logs`. |
| **Duplicate execution prevention** | Defense-in-depth: (1) `FOR NO KEY UPDATE SKIP LOCKED` + `locked_at` lease prevents concurrent claims; (2) Partial unique index `task_logs_slot_idempotency_uq` on `(task_id, scheduled_for, retry_count) WHERE scheduled_for IS NOT NULL` rejects duplicate execution records at the PostgreSQL constraint layer (`23505`). |
| **Application restart recovery** | On boot (`OnApplicationBootstrap`), clear stale leases (`locked_at < NOW() - leaseTimeout`) or let the due-task query automatically reclaim expired leases. Any pending retry (`retry_count > 0`) resumes right at its persisted `next_run_at` timestamp. |
| **Persisting retry state** | `tasks.retry_count` + `tasks.next_run_at` + `tasks.last_execution_status = 'RETRYING'` persist retry progress durably across restarts. Every individual attempt is persisted as an immutable row in `task_logs` sharing `execution_id`. |

---

## 8. Prisma ORM 8 Compatibility Assessment

### 8.1 Audit of Installed Project State

Inspected directly against `backend/package.json`, `backend/prisma.config.ts`, `backend/src/prisma/*`, `backend/prisma-8.md`, `backend/AGENTS.md`, and the shipped `@prisma/orm-postgres@8.0.0-rc.24` reference docs:

| Component | Actual Installed State | Compatibility Finding & Action Required |
|---|---|---|
| **Prisma CLI** | `prisma: ^8.0.0-rc.34` (`devDependencies`) | Prisma ORM 8 unified CLI. **Do NOT use Prisma 7 commands** (`prisma migrate dev`, `prisma migrate deploy`, `prisma generate`, `prisma db push`). They fail with `CLI.V7_COMMAND`. |
| **Prisma Postgres Runtime** | `@prisma/orm-postgres: ^8.0.0-rc.24` (`dependencies`) | Canonical Prisma 8 façade for PostgreSQL (`db.orm.public.<Model>`, `db.sql.public.<table>`, `db.transaction`, `db.raw.sql`). |
| **CLI Engine** | `@prisma/cli-engine: ^0.10.0` (`devDependencies`) | Powers `definePrismaConfig` in `prisma.config.ts`. |
| **Legacy `@prisma/client`** | `@prisma/client: ^7.10.1` (`dependencies`) | **Conflict / Unused artifact!** Prisma 8 does not use `@prisma/client` at all. **Recommendation:** Remove `@prisma/client` in Stage 3 to prevent accidental Prisma 7 imports and reduce Docker image size. |
| **Config File** | `backend/prisma.config.ts` | Correctly uses `definePrismaConfig({ orm: ormConfig({ contract: './src/prisma/contract.prisma', db: { connection: process.env['DATABASE_URL']! } }) })`. Keep `import 'dotenv/config'`. |
| **Contract Source** | `backend/src/prisma/contract.prisma` | Starts with required `// use prisma-8` directive. Currently holds starter `User`/`Post` models (to be replaced with `Task`/`TaskLog` after Stage 2 approval). |
| **Emitted Artefacts** | `backend/src/prisma/contract.json`, `contract.d.ts` | Generated by `npx prisma contract emit` (`npm run contract:emit`). Must be committed to git and never hand-edited. |
| **Runtime Entrypoint** | `backend/src/prisma/db.ts` | ESM singleton using `postgres({ contract, url })` + `contractFromJson<Contract>(contractJson)` with `import ... with { type: 'json' }`. In NestJS, wrap `db` in a single injectable `DatabaseService` / `PrismaService` provider that calls `await db.close()` on `OnApplicationShutdown`. |
| **PostgreSQL Version** | Minimum **PostgreSQL 15+** required | `postgres:16-alpine` satisfies this requirement cleanly. |
| **Module System & NestJS** | `"type": "module"` (ESM), NestJS `12.0.1`, TypeScript `6.0.2` | Relative imports MUST end in `.js` (`./contract.d.js`, `../prisma/db.js`). `__dirname` does not exist; use `import.meta.dirname`. |
| **Test Runner Discrepancy** | `vitest: ^4.1.2` (`npm test` -> `vitest run`) | **Important Finding:** Stage 1 & test prompt mentioned Jest, but the actual scaffolded NestJS 12 ESM backend (`backend/AGENTS.md` + `backend/package.json`) is configured for **Vitest** (`vi.fn()`), which works natively with Prisma 8 ESM (`"type": "module"`). See Section 10.1 for our recommendation. |
| **Environment Files** | `backend/.env` vs root `.env.example` | `backend/.env` currently has placeholder `postgresql://user:password@localhost:5432/discord_scheduler` while root `.env.example` uses `postgres:postgres`. Align before running migrations. |

### 8.2 Verified Prisma ORM 8 PSL Conventions (Critical Differences from Prisma 7)

All syntax below is verified directly against `backend/node_modules/@prisma/orm-target-postgres/dist/authoring-*.mjs` and `@prisma/orm-postgres/skills/prisma-8/references/contract.md`:

1. **Header Directive Required:** First line of `contract.prisma` MUST be `// use prisma-8`.
2. **`Jsonb` vs `Json`:** In Prisma 8 Postgres, `Json` maps to `pg/json@1` (`json`), whereas **`Jsonb`** maps to `pg/jsonb@1` (`jsonb`). `@db.JsonB` is **removed** in Prisma 8. Therefore, `payload` MUST be declared as `payload Jsonb`.
3. **Client Generators vs. DB Defaults:** `@default(...)` is strictly for PostgreSQL defaults (`now()`, `autoincrement()`, literals, ``sql`...` ``). Client-generated IDs MUST use `@onCreate(...)` (e.g., `id Uuid @id @onCreate(uuid(7))`). Writing `@default(uuid())` fails with `PSL_GENERATOR_IN_DEFAULT`.
4. **Timestamps Without Temporal Polyfill:** `DateTime` (`pg/timestamptz-date@1`) and `temporal.UpdatedAt` store `timestamptz(3)` and decode to standard JavaScript `Date` objects — no `globalThis.Temporal` polyfill is required on Node 22/24.
5. **Enums with `@@type("pg/text@1")`:** Prisma 8 domain enums declare `@@type("pg/text@1")` and explicit string values (`ACTIVE = "ACTIVE"`), storing as `text` + automatically generated PostgreSQL `CHECK` constraints (zero `ALTER TYPE ... ADD VALUE` transaction locking headaches).
6. **Partial Indexes & Check Constraints:** Both are natively supported using ``sql`...` `` tagged literals (`@@index([...], where: sql`...`, name: "...")` and `@@check(expression: sql`...`, name: "...")`). Quoted strings instead of ``sql`...` `` are rejected with `PSL_VALUE_TYPE_INCOMPATIBLE`.
7. **Namespace-Aware Queries:** On Postgres, queries are always namespace-qualified: `db.orm.public.Task` and `db.sql.public.tasks`.

### 8.3 Reference Draft of Proposed `src/prisma/contract.prisma` (For Review Only — Not Written Yet)

```prisma
// use prisma-8

enum TaskStatus {
  @@type("pg/text@1")
  ACTIVE   = "ACTIVE"
  PAUSED   = "PAUSED"
  DISABLED = "DISABLED"
}

enum ExecutionStatus {
  @@type("pg/text@1")
  RUNNING  = "RUNNING"
  RETRYING = "RETRYING"
  SUCCESS  = "SUCCESS"
  FAILED   = "FAILED"
}

model Task {
  id                  Uuid             @id @onCreate(uuid(7))
  name                Varchar(255)
  cronExpression      Varchar(100)     @map("cron_expression")
  timezone            Varchar(64)      @default("UTC")
  webhookUrl          Text             @map("webhook_url")
  payload             Jsonb
  maxRetry            Int              @default(3) @map("max_retry")
  status              TaskStatus       @default(ACTIVE)
  nextRunAt           DateTime?        @map("next_run_at")
  lastRunAt           DateTime?        @map("last_run_at")
  lastExecutionStatus ExecutionStatus? @map("last_execution_status")
  retryCount          Int              @default(0) @map("retry_count")
  lockedAt            DateTime?        @map("locked_at")
  lockedBy            Varchar(100)?    @map("locked_by")
  createdAt           DateTime         @default(now()) @onCreate(now()) @map("created_at")
  updatedAt           temporal.UpdatedAt @map("updated_at")

  logs                TaskLog[]

  @@index([nextRunAt], where: sql`status = 'ACTIVE' AND next_run_at IS NOT NULL`, name: "tasks_due_poll_idx")
  @@index([status, createdAt], name: "tasks_status_created_idx")
  @@index([lockedAt], where: sql`locked_at IS NOT NULL`, name: "tasks_locked_at_idx")

  @@check(expression: sql`length(btrim(name)) > 0`, name: "tasks_name_nonempty")
  @@check(expression: sql`max_retry >= 0 AND max_retry <= 10`, name: "tasks_max_retry_range")
  @@check(expression: sql`retry_count >= 0`, name: "tasks_retry_count_nonneg")
  @@check(expression: sql`jsonb_typeof(payload) = 'object'`, name: "tasks_payload_is_object")

  @@map("tasks")
}

model TaskLog {
  id           Uuid            @id @onCreate(uuid(7))
  taskId       Uuid            @map("task_id")
  executionId  Uuid            @onCreate(uuid(7)) @map("execution_id")
  scheduledFor DateTime?       @map("scheduled_for")
  executedAt   DateTime        @default(now()) @onCreate(now()) @map("executed_at")
  status       ExecutionStatus
  retryCount   Int             @default(0) @map("retry_count")
  httpStatus   Int?            @map("http_status")
  durationMs   Int?            @map("duration_ms")
  message      Text?
  createdAt    DateTime        @default(now()) @onCreate(now()) @map("created_at")

  task         Task            @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([taskId, executedAt], name: "task_logs_task_executed_idx")
  @@index([executedAt, id], name: "task_logs_executed_id_idx")
  @@index([status, executedAt], name: "task_logs_status_executed_idx")
  @@index([executionId, retryCount], name: "task_logs_execution_id_idx")
  @@index([taskId, scheduledFor, retryCount], unique: true, where: sql`scheduled_for IS NOT NULL`, name: "task_logs_slot_idempotency_uq")

  @@check(expression: sql`retry_count >= 0`, name: "task_logs_retry_count_nonneg")
  @@check(expression: sql`duration_ms IS NULL OR duration_ms >= 0`, name: "task_logs_duration_nonneg")

  @@map("task_logs")
}
```

> **Note for Implementation Stage Verification:** When running `npx prisma contract emit`, verify whether `Varchar(100)?` (optional parameterized type) and `@map("updated_at")` on `temporal.UpdatedAt` compile cleanly under `8.0.0-rc.24`. If `temporal.UpdatedAt` does not accept `@map`, expand it explicitly to `DateTime @onCreate(now()) @onUpdate(now()) @map("updated_at")`, which produces the exact same emitted contract IR.

---

## 9. Migration Strategy & Exact Prisma ORM 8 Commands

### 9.1 Migration Directory Structure & Versioning Model

Prisma ORM 8 uses a **content-addressed directed migration graph** under `backend/migrations/`:

```text
backend/
├── prisma.config.ts
├── src/prisma/
│   ├── contract.prisma               # Authored PSL source (committed)
│   ├── contract.json                 # Emitted Contract IR (committed)
│   ├── contract.d.ts                 # Emitted TypeScript types (committed)
│   └── db.ts                         # Runtime client singleton (committed)
└── migrations/
    ├── snapshots/                    # Content-addressed contract store (committed)
    │   └── <64-hex-storage-hash>/
    │       ├── contract.json
    │       └── contract.d.ts
    └── app/                          # Application contract-space migrations (committed)
        ├── refs/
        │   └── db.json               # Tracks dev/chain origin hash ({ hash, invariants })
        └── <YYYYMMDDTHHMM>_<snake_slug>/
            ├── migration.json        # Manifest with from/to hashes & migrationHash
            ├── ops.json              # Canonical content-addressed operations
            └── migration.ts          # Framework-rendered TS migration (editable for data transforms)
```

- **Naming Convention:** Lowercase `snake_case` descriptive slugs passed via `--name <slug>` (e.g., `init_tasks_and_task_logs`, `add_task_tags`, `add_webhook_timeout_column`). Prisma 8 automatically prefixes the directory with an ISO UTC timestamp (`YYYYMMDDTHHMM_<slug>`).
- **Schema Versioning:** Every contract state is identified by its deterministic 64-hex `storageHash`. Every migration package is an edge `fromHash -> toHash`, hashed as `migrationHash`. PostgreSQL tracks its live state in `prisma_contract.marker` (created and updated automatically by Prisma 8).

### 9.2 Initial Migration Strategy (Fresh PostgreSQL Database — Deploy-First Pattern)

Because this project deploys into a fresh PostgreSQL container via Docker Compose (and must manage every schema change through versioned migrations — never `db update` alone or manual SQL), we use the **Formal Baseline Migration** workflow (`references/migration-model.md` § *Deploy-first loop*):

```bash
# Run from backend/

# 1. Edit src/prisma/contract.prisma (replace starter User/Post with Task/TaskLog)

# 2. Emit contract.json and contract.d.ts
npx prisma contract emit

# 3. Plan the initial baseline migration from empty DB (from: null -> current storageHash)
npx prisma migration plan --name init_tasks_and_task_logs

# 4. Inspect the generated migration operations before applying
npx prisma migration show migrations/app/<generated_timestamp>_init_tasks_and_task_logs

# 5. Apply pending migrations to the fresh PostgreSQL database & advance the `db` ref
npx prisma db migrate --advance-ref db

# 6. Confirm migration ledger & live DB alignment
npx prisma migration status
npx prisma db verify
```

> **Why `--advance-ref db` on Step 5?**  
> In Prisma 8, `migration plan` does **not** automatically chain from the newest folder on disk; it chains from `--from` or `migrations/app/refs/db.json`. Plain `db migrate` never updates refs. Passing `--advance-ref db` (or running `npx prisma migration ref set db <to-hash>`) ensures every subsequent `migration plan` chains cleanly from `init_tasks_and_task_logs` instead of hitting `MIGRATION.PLAN_ORIGIN_UNKNOWN`.

### 9.3 Local Development Workflow (Future Schema Changes)

**Formal Path (Recommended for all committed changes):**
```bash
# 1. Edit src/prisma/contract.prisma
# 2. Re-emit contract artefacts
npx prisma contract emit

# 3. Plan delta migration (chains from `db` ref; verify `from:` is NOT `(baseline)`)
npx prisma migration plan --name <descriptive_snake_slug>

#    Special flags when applicable:
#    - Rename without data loss:  --rename Task.payload:Task.discordPayload
#    - Intentional drop:          --delete Task.legacyField
#    - Backfill new NOT NULL col: --backfill Task.newRequiredField
#    - Lossy type conversion:     --convert Task.columnName

# 4. If migration.ts contains placeholder(...) for a backfill/convert:
#    Edit migration.ts, then self-emit ops.json & migrationHash:
node migrations/app/<dir>/migration.ts

# 5. Review planned operations
npx prisma migration show migrations/app/<dir>

# 6. Apply transactionally to local PostgreSQL and advance dev `db` ref
npx prisma db migrate --advance-ref db

# 7. Commit contract.prisma, contract.json, contract.d.ts, and migrations/
```

*(Note: `npx prisma db update --dry-run` / `npx prisma db update` may be used strictly for scratchpad prototyping on a throwaway local DB, never for production/Docker deployment, and never in place of committed migrations.)*

### 9.4 Docker Compose Deployment Workflow

On container startup, the `backend` container runs migrations **before** starting NestJS (`backend/docker-entrypoint.sh`):

```bash
#!/bin/sh
set -e

echo "Applying Prisma ORM 8 migrations..."
npx prisma db migrate --db "$DATABASE_URL"

echo "Starting NestJS backend..."
exec node dist/main.js
```

**Why this is safe in Docker / Production:**
- `npx prisma db migrate` is **non-interactive** and **atomic on PostgreSQL** (executes all pending migrations inside a single `BEGIN ... COMMIT` transaction; rolls back completely on any error).
- On a fresh PostgreSQL container (no marker yet), it replays from `from: null` through the baseline and all subsequent migrations, verifies the live schema, and writes `prisma_contract.marker`.
- On subsequent container restarts where the DB is already at the latest contract hash, `db migrate` is a fast no-op.
- Plain `db migrate` (without `--advance-ref`) never mutates files inside the container image.
- **Important Dockerfile Note:** The production `runner` stage must copy `prisma.config.ts`, `src/prisma/contract.json`, `migrations/` (including `snapshots/` and `app/`), and keep `prisma` / `@prisma/orm-postgres` accessible so `npx prisma db migrate` can run cleanly at startup.

### 9.5 Prisma 7 vs. Prisma 8 Command Mapping (Quick Reference)

| Action | Old Prisma 7 (DO NOT USE) | Verified Prisma ORM 8 Command |
|---|---|---|
| Regenerate types & runtime metadata | `npx prisma generate` | `npx prisma contract emit` |
| Create & apply dev migration | `npx prisma migrate dev --name <slug>` | `npx prisma contract emit` -> `npx prisma migration plan --name <slug>` -> `npx prisma db migrate --advance-ref db` |
| Apply migrations in Docker / CI / Prod | `npx prisma migrate deploy` | `npx prisma db migrate --db "$DATABASE_URL"` |
| Check migration status | `npx prisma migrate status` | `npx prisma migration status --db "$DATABASE_URL"` |
| Inspect planned deploy path | *(none)* | `npx prisma db migrate --show --db "$DATABASE_URL"` |
| Push schema without migration (dev only) | `npx prisma db push` | `npx prisma db update --dry-run` / `npx prisma db update` |
| Verify live DB matches contract (drift) | `npx prisma migrate diff` | `npx prisma db verify --db "$DATABASE_URL"` |
| Never reset DB | `npx prisma migrate reset` | **Disallowed in Prisma 8** — reconcile via `db update` (dev) or authored migrations (prod) |

---

## 10. Database Testing Strategy

### 10.1 Test Runner Alignment (Vitest vs. Jest Decision)

- **Observation:** The prompt specifies Jest, while the actual NestJS 12 ESM scaffold (`backend/package.json` & `backend/AGENTS.md`) is pre-configured with **Vitest 4** (`npm test` -> `vitest run`, `globals: true`, `vi.fn()`).
- **Technical Constraint:** Both NestJS 12 and Prisma ORM 8 (`@prisma/orm-postgres`) are **pure ESM** (`"type": "module"`). Vitest handles ESM + TypeScript + JSON import attributes (`with { type: 'json' }`) natively, whereas Jest requires experimental VM modules flags and custom transformers that frequently break with Prisma 8's ESM exports.
- **Recommendation:** Keep **Vitest** as the runner (which preserves Jest-identical `describe` / `it` / `expect` assertions) unless the technical test evaluator strictly runs `jest` directly. *(Please confirm your preference before Stage 3!)*

### 10.2 Test Isolation Strategy

Following `backend/.agents/skills/nestjs-testing/SKILL.md`:
- **Unit Tests (`src/**/*.spec.ts`):** Mock the injected `DatabaseService` (`db.orm` / `db.transaction`) using `vi.fn()` for fast, deterministic service/scheduler logic verification with zero DB dependency.
- **Database Integration Tests (`test/database/*.spec.ts`):** Run against a real PostgreSQL 15+ test database (with Prisma 8 migrations applied via `npx prisma db migrate --db "$TEST_DATABASE_URL"`). Clean up created test rows (or isolate per test file / truncate `tasks` with `CASCADE` in `beforeEach`) and call `await db.close()` in `afterAll` so the process never hangs on an open `pg.Pool`.

### 10.3 Required Database Test Checklist

| # | Test Area | Concrete Assertions to Verify |
|---|---|---|
| 1 | **Task Creation** | Persists all mandatory + scheduler fields; generates valid UUIDv7 `id`; defaults `status = 'ACTIVE'`, `maxRetry = 3`, `timezone = 'UTC'`, `retryCount = 0`; auto-populates `createdAt` & `updatedAt`; rejects `maxRetry < 0`, `maxRetry > 10`, blank `name`, and non-object JSONB `payload` via PostgreSQL `CHECK` constraints. |
| 2 | **Task Update & Deletion** | Updating fields (`cronExpression`, `status`, `maxRetry`, `payload`) persists changes and advances `updatedAt` automatically; updating non-existent ID returns `null` / 0 affected rows; deleting a `Task` succeeds and cascades deletion to all associated `TaskLog` rows (`ON DELETE CASCADE`). |
| 3 | **Task–Log Relationship** | Creating `TaskLog` linked to an existing `Task` succeeds and loads via `.include('logs')` and `.include('task')`; inserting a `TaskLog` with a non-existent `taskId` fails with PostgreSQL foreign key violation (`23503`). |
| 4 | **JSONB Payload Persistence** | Complex Discord payloads (nested `embeds`, `fields`, `allowed_mentions`, Unicode/emoji `content`) round-trip identically from `jsonb` (`pg/jsonb@1`) without serialization loss; database rejects non-object JSONB payloads (e.g., array `[]` or string `"hi"`). |
| 5 | **Retry State Persistence** | Simulating a failed attempt updates `tasks.retryCount = 1`, `tasks.lastExecutionStatus = 'RETRYING'`, and future `tasks.nextRunAt`, while inserting a `RETRYING` row in `task_logs` with `retryCount = 0` and shared `executionId`; subsequent success resets `tasks.retryCount = 0`, advances `nextRunAt` to next cron slot, and inserts `SUCCESS` row with `retryCount = 1` and matching `executionId`. |
| 6 | **Scheduler Due-Task Queries** | Querying `status = 'ACTIVE' AND next_run_at <= NOW() AND (locked_at IS NULL OR locked_at < staleCutoff)` returns only due active tasks ordered by `next_run_at ASC`; excludes `PAUSED`, `DISABLED`, future `next_run_at`, and actively leased tasks; includes tasks whose lease has expired (crash recovery). |
| 7 | **Duplicate Execution Prevention** | (a) **Concurrency test:** Two parallel `db.transaction()` calls running `.forNoKeyUpdate({ skipLocked: true }).first()` on the same single due task result in exactly **one** transaction claiming the row and the second returning `null`. (b) **Idempotency constraint test:** Attempting to insert a second `task_logs` row with identical `(task_id, scheduled_for, retry_count)` fails with PostgreSQL unique violation (`23505`), while manual runs with `scheduled_for = NULL` are permitted multiple times. |

---

## 11. Actionable TODO Checklist (Stage 2 -> Stage 3 Handoff)

> **Execution Gate:** Do not execute any item below until this database design plan is approved.

### Mandatory Checklist
- [ ] **Approve Database Design:** Review and approve `docs/ai-planning/02-database-schema-design.md` (confirm UUIDv7 PKs, hard-delete `ON DELETE CASCADE`, 2-table design, and Vitest vs. Jest decision).
- [ ] **Clean Up Legacy Dependency & Env Alignment:**
  - [ ] Remove unused Prisma 7 `@prisma/client` package from `backend/package.json`.
  - [ ] Align `DATABASE_URL` credentials between root `.env.example` and `backend/.env` (targeting PostgreSQL 16).
  - [ ] Ensure local/Docker PostgreSQL 15+ instance is running and reachable.
- [ ] **Author Prisma ORM 8 Data Contract:**
  - [ ] Replace starter `User`/`Post` models in `backend/src/prisma/contract.prisma` with `TaskStatus`, `ExecutionStatus`, `Task`, and `TaskLog` (preserving `// use prisma-8`).
  - [ ] Run `npx prisma contract emit` and verify `src/prisma/contract.json` and `src/prisma/contract.d.ts` regenerate cleanly with zero diagnostics.
- [ ] **Generate & Apply Initial Migration (No Manual SQL):**
  - [ ] Run `npx prisma migration plan --name init_tasks_and_task_logs` to create the baseline migration under `backend/migrations/app/`.
  - [ ] Inspect the planned operations with `npx prisma migration show <dir>` to verify `tasks`, `task_logs`, `jsonb`, partial indexes, unique idempotency index, foreign key cascade, and CHECK constraints.
  - [ ] Run `npx prisma db migrate --advance-ref db` against a fresh PostgreSQL database.
  - [ ] Verify live schema alignment via `npx prisma migration status` and `npx prisma db verify`.
- [ ] **Wire NestJS Database Provider:**
  - [ ] Create a single global `DatabaseModule` / `DatabaseService` wrapping `src/prisma/db.ts` (one shared pool across the app) with `OnApplicationShutdown` calling `await db.close()`.
- [ ] **Implement Database Test Suite:**
  - [ ] Add database integration tests covering all 7 required areas (CRUD, cascade delete, FK integrity, JSONB round-trip, retry persistence, due-task query, and `FOR NO KEY UPDATE SKIP LOCKED` + unique idempotency duplicate-execution prevention).
  - [ ] Verify all database tests pass cleanly and exit without dangling connection pools.

### Optional Improvements *(Confirm Before Including)*
- [ ] Add an idempotent TypeScript seed script (`backend/src/prisma/seed.ts`) using `db.orm.public.Task` + `await db.close()` for sample tasks during demos.
- [ ] Add soft-delete support (`deleted_at DateTime?` on `tasks`) if preserving historical `task_logs` after task deletion is preferred over `ON DELETE CASCADE`.
- [ ] Add a scheduled log-retention cleanup job (e.g., prune `task_logs` older than 30/90 days) to bound table size in long-running deployments.
- [ ] Add custom Prisma 8 `slowQueryWarning` and dev `lints()` middleware in `backend/src/prisma/db.ts` for runtime query safety.
