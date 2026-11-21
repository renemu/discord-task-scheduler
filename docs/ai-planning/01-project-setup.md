# 01 — Discord Task Scheduler: Project Plan & Initial Setup Checklist

> **Status:** Draft — Awaiting Approval  
> **Scope:** Architectural blueprint, monorepo setup, technology ownership, milestones, Docker architecture, risk analysis, and initial setup TODO checklist.  
> **Rule:** No source code implementation until this plan is reviewed and approved.

---

## 1. Architecture Overview

### 1.1 High-Level System Architecture

The **Discord Task Scheduler** is a full-stack, containerized monorepo application enabling authenticated users/clients to create, schedule, monitor, and manage recurring Discord webhook notifications with configurable retry semantics and execution observability.

```mermaid
flowchart LR
    User["User (Browser)"] -->|"HTTP :3000"| NextApp["Frontend: Next.js (App Router + TS)"]
    ExtClient["External API Client / Swagger"] -->|"HTTP :4000 + X-API-Key"| NestAPI["Backend: NestJS (REST API + TS)"]

    subgraph FrontendContainer["Frontend Container (Next.js)"]
        NextApp --> NextBFF["Next.js Server Components & API Proxy (/api/*)"]
    end

    NextBFF -->|"Internal HTTP :4000 + X-API-Key"| NestAPI

    subgraph BackendContainer["Backend Container (NestJS)"]
        NestAPI --> AuthGuard["ApiKeyGuard (X-API-Key)"]
        AuthGuard --> Controllers["Controllers (Tasks, Logs, Stats, Health)"]
        Controllers --> Services["Domain Services"]
        Services --> Scheduler["TaskSchedulerService (@nestjs/schedule + SchedulerRegistry)"]
        Scheduler --> Executor["WebhookExecutorService (HTTP POST + Retry Engine)"]
        Services --> PrismaClient["PrismaService (ORM)"]
        Executor --> PrismaClient
    end

    PrismaClient -->|"TCP :5432"| Postgres[("PostgreSQL Database")]
    Executor -->|"HTTPS POST"| Discord["Discord Webhook API"]
```

### 1.2 Core Data & Execution Flow

1. **API Request & Authentication Flow**
   - Browser requests hit the Next.js frontend. Client components communicate with Next.js Route Handlers (`/api/*`) or Server Components, which inject the server-side `API_KEY` header (`X-API-Key`) before proxying to NestJS. This keeps the secret API key out of the browser bundle.
   - Direct API consumers (Swagger, `curl`, Postman, automated tests) call NestJS directly with the `X-API-Key` header.
   - NestJS `ApiKeyGuard` validates the header using constant-time comparison (`crypto.timingSafeEqual`). Only explicitly marked `@Public()` endpoints (such as `GET /api/v1/health`) bypass authentication.

2. **Task Lifecycle & Dynamic Scheduling Flow**
   - When a task is created, updated, toggled, or deleted via the REST API, `TasksService` persists the change via Prisma and immediately synchronizes the in-memory `SchedulerRegistry` (`TaskSchedulerService`).
   - On backend startup (`OnApplicationBootstrap`), `TaskSchedulerService` queries PostgreSQL for all active (`isActive: true`) tasks and registers their `CronJob` instances dynamically.

3. **Execution, Retry, and Logging Flow**
   - When a `CronJob` fires (or a manual trigger is invoked), `WebhookExecutorService` acquires a per-task in-memory execution lock to prevent overlapping runs.
   - It sends an HTTP `POST` request to the task's Discord Webhook URL with the configured JSON payload.
   - On transient failure (network error, timeout, HTTP `429`, HTTP `5xx`, or failed HTTP response), the retry engine retries up to the task's configured `maxRetry` count (total attempts = `1 + maxRetry`) using exponential backoff (and respecting Discord's `Retry-After` header on `429`).
   - Execution metadata (status, attempt count, HTTP status code, duration in ms, response/error message, timestamps) is persisted to PostgreSQL via Prisma for log inspection and dashboard statistics.

### 1.3 Mandatory vs. Optional Feature Classification

| # | Feature Area | Classification | Scope Definition |
|---|---|---|---|
| 1 | **Task CRUD** | **Mandatory** | Create, list (with pagination/filter), get by ID, update, delete, and enable/disable tasks (`name`, `description`, `webhookUrl`, `payload`/`message`, `cronExpression`, `maxRetry`, `isActive`). Strict DTO & cron validation. |
| 2 | **Task Scheduling** | **Mandatory** | Dynamic cron scheduling using `@nestjs/schedule` (`SchedulerRegistry` + `CronJob`), startup hydration from DB, real-time sync on CRUD mutations, graceful shutdown cleanup. |
| 3 | **Discord Webhook Execution** | **Mandatory** | HTTP `POST` to Discord Webhook URL with JSON payload (`content`, optional `username`/`avatar_url`/`embeds`), timeout protection, status handling (`204 No Content` / `200 OK` as success). |
| 4 | **Configurable Retry Mechanism** | **Mandatory** | Per-task `maxRetry` field (e.g., `0–10`, default `3`), exponential backoff between retries, `429 Retry-After` awareness, full failure reporting when retries are exhausted. |
| 5 | **Execution Logs** | **Mandatory** | Persistent execution history linked to tasks (status, attempts used, HTTP status, error/response summary, latency ms, timestamps), filterable by task/status and paginated. |
| 6 | **Dashboard Statistics** | **Mandatory** | Aggregated KPI metrics: total tasks, active vs. inactive tasks, total executions, success/failure counts, overall success rate (%), recent execution feed, and recent failure visibility. |
| 7 | **API Authentication** | **Mandatory** | Global `X-API-Key` NestJS guard with `@Public()` opt-out for health check, constant-time validation, and Next.js server-side proxy integration. |
| 8 | **Code-First Prisma Migrations** | **Mandatory** | Schema defined exclusively in `backend/prisma/schema.prisma`; migrations generated via `prisma migrate dev` and applied via `prisma migrate deploy`. Zero manual SQL DDL. |
| 9 | **Docker Compose Deployment** | **Mandatory** | Single-command `docker compose up --build` launching PostgreSQL, NestJS backend (auto-applying Prisma migrations), and Next.js frontend with healthchecks. |
| 10 | **Jest Unit Testing** | **Mandatory** | Unit test suites covering core backend modules (tasks service, scheduler sync, webhook executor, retry logic, logs/stats service, API key guard). |
| 11 | **Manual "Run Now" Trigger** | *Optional* | `POST /api/v1/tasks/:id/trigger` endpoint & UI button to test/execute a task immediately outside its cron schedule. |
| 12 | **Swagger / OpenAPI Docs** | *Optional* | Interactive API documentation at `/api/docs` with `X-API-Key` security scheme pre-configured for reviewers. |
| 13 | **Cron Human-Readable Preview & Next Run Time** | *Optional* | Display human-readable schedule descriptions and computed `nextRunAt` timestamps in the UI/API. |
| 14 | **Discord Embed Builder / Rich Payload** | *Optional* | Optional JSON embed editor in addition to plain message `content`. |
| 15 | **Frontend Component/Utility Tests & E2E Smoke Tests** | *Optional* | Jest + React Testing Library tests for frontend utilities/components and NestJS Supertest integration specs. |
| 16 | **Execution Log Retention / Cleanup Cron** | *Optional* | Scheduled maintenance job to prune logs older than N days to prevent unbounded DB growth. |

---

## 2. Monorepo Folder Structure

Preserves the pre-initialized repository layout (`backend/`, `frontend/`, `docs/ai-planning/`) without unnecessary monorepo build-tool complexity, using root scripts/Docker Compose for orchestration.

```text
discord-task-scheduler/
├── .env.example                       # Root Docker Compose environment template
├── .gitignore                         # Root git ignore (node_modules, .env, dist, .next, coverage)
├── docker-compose.yml                 # Production-like multi-service stack (db, backend, frontend)
├── docker-compose.dev.yml             # Optional override for local DB-only / hot-reload development
├── Makefile                           # Optional convenience shortcuts (up, down, migrate, test, logs)
├── README.md                          # Project overview, setup, API docs, architecture & test guide
│
├── docs/
│   └── ai-planning/
│       ├── 01-project-setup.md        # This document (Project Plan & Setup Checklist)
│       ├── 02-database-schema.md      # (Future) Prisma schema & ERD design doc
│       ├── 03-api-contract.md         # (Future) REST endpoints, DTOs, error formats
│       └── evidence/                  # Verification screenshots, test logs, curl outputs
│
├── backend/
│   ├── Dockerfile                     # Multi-stage Node.js build (deps -> build -> prod runner)
│   ├── docker-entrypoint.sh           # Runs `prisma migrate deploy` then starts NestJS server
│   ├── .env.example                   # Backend local environment template
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.build.json
│   ├── nest-cli.json
│   ├── jest.config.ts                 # Jest unit test configuration & coverage thresholds
│   ├── prisma/
│   │   ├── schema.prisma              # Single source of truth for DB models & enums
│   │   ├── seed.ts                    # Optional idempotent seed script for demo data
│   │   └── migrations/                # Prisma-generated migration folders (never hand-edited)
│   ├── src/
│   │   ├── main.ts                    # App bootstrap, ValidationPipe, CORS, Helmet, Swagger, shutdown hooks
│   │   ├── app.module.ts              # Root NestJS module wiring Config, Schedule, Prisma, feature modules
│   │   ├── common/
│   │   │   ├── decorators/
│   │   │   │   └── public.decorator.ts        # @Public() metadata decorator
│   │   │   ├── filters/
│   │   │   │   └── http-exception.filter.ts   # Standardized JSON error envelope
│   │   │   ├── guards/
│   │   │   │   └── api-key.guard.ts           # Constant-time X-API-Key authentication guard
│   │   │   ├── interceptors/
│   │   │   │   └── logging.interceptor.ts     # Structured request/response logging
│   │   │   └── validators/
│   │   │       ├── is-valid-cron.validator.ts # Custom class-validator for cron expressions
│   │   │       └── is-discord-webhook.validator.ts # Discord webhook URL validator
│   │   ├── config/
│   │   │   └── env.validation.ts      # Fail-fast environment variable schema validation
│   │   ├── prisma/
│   │   │   ├── prisma.module.ts
│   │   │   └── prisma.service.ts      # PrismaClient lifecycle ($connect / $disconnect)
│   │   ├── health/
│   │   │   ├── health.module.ts
│   │   │   └── health.controller.ts   # @Public() GET /api/v1/health (includes DB connectivity check)
│   │   ├── tasks/
│   │   │   ├── tasks.module.ts
│   │   │   ├── tasks.controller.ts    # CRUD + toggle + optional manual trigger endpoints
│   │   │   ├── tasks.service.ts       # Business logic + SchedulerRegistry synchronization
│   │   │   └── dto/
│   │   │       ├── create-task.dto.ts
│   │   │       ├── update-task.dto.ts
│   │   │       └── query-tasks.dto.ts
│   │   ├── scheduler/
│   │   │   ├── scheduler.module.ts
│   │   │   └── task-scheduler.service.ts      # Dynamic CronJob registry, startup sync, lock map
│   │   ├── webhook/
│   │   │   ├── webhook.module.ts
│   │   │   └── webhook-executor.service.ts    # Discord HTTP POST, retry loop, backoff, log recording
│   │   ├── execution-logs/
│   │   │   ├── execution-logs.module.ts
│   │   │   ├── execution-logs.controller.ts   # Paginated/filterable log endpoints
│   │   │   ├── execution-logs.service.ts
│   │   │   └── dto/
│   │   │       └── query-logs.dto.ts
│   │   └── dashboard/
│   │       ├── dashboard.module.ts
│   │       ├── dashboard.controller.ts        # Aggregated stats endpoint
│   │       └── dashboard.service.ts
│   └── test/
│       └── jest-e2e.json              # Optional integration/E2E test config
│
└── frontend/
    ├── Dockerfile                     # Multi-stage Next.js standalone production build
    ├── .env.example                   # Frontend local environment template
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts                 # `output: 'standalone'` for minimal Docker image
    ├── postcss.config.mjs
    ├── jest.config.ts                 # Optional frontend Jest config
    ├── public/
    └── src/
        ├── app/
        │   ├── layout.tsx             # Root layout with navigation sidebar/header & toast provider
        │   ├── page.tsx               # Dashboard overview (KPI cards, recent executions, charts)
        │   ├── tasks/
        │   │   ├── page.tsx           # Task list table, search/filter, status toggle, quick actions
        │   │   ├── new/page.tsx       # Create task form (cron helper, maxRetry, webhook URL)
        │   │   └── [id]/
        │   │       ├── page.tsx       # Task details + per-task execution history
        │   │       └── edit/page.tsx  # Edit task form
        │   ├── logs/
        │   │   └── page.tsx           # Global execution logs explorer with filters & detail modal
        │   └── api/
        │       └── proxy/[...path]/route.ts   # Server-side BFF proxy injecting X-API-Key header
        ├── components/
        │   ├── layout/                # Sidebar, Header, StatusBadge
        │   ├── dashboard/             # StatCard, SuccessRateChart, RecentExecutionsTable
        │   ├── tasks/                 # TaskForm, TaskTable, CronPresetPicker, DeleteConfirmModal
        │   └── logs/                  # ExecutionLogsTable, LogDetailDrawer
        ├── lib/
        │   ├── api-client.ts          # Typed fetch wrapper targeting `/api/proxy/*` (client) or backend (SSR)
        │   └── formatters.ts          # Date, duration, cron, and status formatters
        └── types/
            └── api.ts                 # Shared TypeScript interfaces matching backend API responses
```

---

## 3. Technology Responsibilities

| Layer / Technology | Exact Role & Responsibilities | Key Architectural Constraints |
|---|---|---|
| **Next.js (App Router) + TypeScript** | Web UI for dashboard KPIs, task management forms/tables, execution log viewer, and server-side API proxy (`/api/proxy/*`). | Uses `output: 'standalone'` for small Docker images. Never exposes backend `API_KEY` via `NEXT_PUBLIC_*` variables. |
| **Tailwind CSS** | Responsive UI styling, consistent status badges, dark/light-ready layout components. | Keep styling clean and lightweight without bloated UI kit overhead. |
| **NestJS + TypeScript** | Modular backend REST API, dependency injection, request DTO validation (`ValidationPipe`), exception handling, API Key guard, OpenAPI documentation. | Strict TypeScript (`strictNullChecks`, explicit DTOs). Thin controllers; business logic encapsulated in services. |
| **PostgreSQL (v16 Alpine)** | Primary relational store for scheduled tasks and execution logs with ACID guarantees and indexed aggregation queries. | No manual SQL schema scripts; initialized empty and evolved strictly via Prisma migrations. |
| **Prisma ORM (v6.x)** | Type-safe database client, declarative schema modeling (`schema.prisma`), and automated SQL migration generation/execution. | Code-first migrations only (`prisma migrate dev` in dev, `prisma migrate deploy` in Docker/prod). Pin Prisma v6 LTS for smooth NestJS CommonJS/Jest compatibility. |
| **`@nestjs/schedule` + `cron`** | In-process dynamic cron job scheduling via `SchedulerRegistry` (`addCronJob`, `deleteCronJob`, `doesExist`). | Hydrates active jobs at startup, synchronizes immediately on CRUD mutations, and prevents overlapping runs per task. |
| **HTTP Client (`@nestjs/axios` or native `fetch`)** | Dispatches `POST` requests to Discord Webhook endpoints with timeout, payload formatting, and header inspection (`Retry-After`). | Must enforce request timeout (e.g., 10s), validate webhook URL host, and handle `204 No Content` without JSON parse errors. |
| **Jest (`ts-jest`)** | Unit testing framework for services, retry engine, cron scheduler synchronization, API guard, and validators. | Mock Prisma and HTTP calls cleanly for deterministic, fast tests with no external Discord or DB dependency in unit runs. |
| **Docker & Docker Compose** | Reproducible container builds and multi-service orchestration (PostgreSQL + Backend + Frontend) with healthchecks and persistent volumes. | Single command `docker compose up --build` must bring up a fully migrated, healthy stack. |

---

## 4. Development Milestones

Development is structured into incremental, verifiable milestones. Each milestone produces testable artifacts before moving to the next.

### Milestone 1: Repository & Environment Bootstrap *(Mandatory)*
- Initialize `backend/` (NestJS + TypeScript + Jest) and `frontend/` (Next.js App Router + TypeScript + Tailwind CSS).
- Configure root `.gitignore`, `.env.example` templates, Prettier/ESLint rules, and `docker-compose.yml` skeleton for PostgreSQL.
- Verify both apps boot locally and pass baseline lint/build checks.

### Milestone 2: Database Modeling & Code-First Prisma Migrations *(Mandatory)*
- Define `Task` and `ExecutionLog` models + `ExecutionStatus` enum in `backend/prisma/schema.prisma` (with indexes on `isActive`, `taskId`, `status`, `executedAt`).
- Generate initial migration via `npx prisma migrate dev --name init` (zero manual SQL).
- Implement `PrismaModule` / `PrismaService` with clean lifecycle hooks and verify DB health check endpoint (`GET /api/v1/health`).

### Milestone 3: Security, Validation & Core Task CRUD *(Mandatory)*
- Implement global `ApiKeyGuard` (`X-API-Key` constant-time validation) + `@Public()` decorator + environment schema validation.
- Implement standardized HTTP exception filter and global `ValidationPipe`.
- Implement `TasksModule` (Create, List with pagination/search/filter, Get by ID, Update, Delete, Toggle active) with custom cron expression and Discord webhook URL validators.
- *(Optional)* Enable Swagger/OpenAPI at `/api/docs`.

### Milestone 4: Dynamic Scheduler, Discord Webhook Executor & Retry Engine *(Mandatory)*
- Implement `TaskSchedulerService` using `SchedulerRegistry`: startup job registration, live sync on task create/update/delete/toggle, per-task concurrency lock, graceful shutdown cleanup.
- Implement `WebhookExecutorService`: HTTP POST to Discord webhook, configurable `maxRetry` loop with exponential backoff + `429 Retry-After` handling, latency tracking, structured log persistence.
- *(Optional)* Add `POST /api/v1/tasks/:id/trigger` manual execution endpoint.

### Milestone 5: Execution Logs & Dashboard Statistics APIs *(Mandatory)*
- Implement `ExecutionLogsModule`: paginated execution history, filtering by `taskId`, `status`, and date range, plus detailed log lookup.
- Implement `DashboardModule`: aggregated statistics (`totalTasks`, `activeTasks`, `inactiveTasks`, `totalExecutions`, `successCount`, `failureCount`, `successRate`, `averageDurationMs`, `recentExecutions`).

### Milestone 6: Unit Testing Suite with Jest *(Mandatory)*
- Write thorough Jest unit tests for:
  - `ApiKeyGuard` (missing key, wrong key, valid key, `@Public()` bypass)
  - `TasksService` (CRUD flows, not-found handling, scheduler sync invocations)
  - `TaskSchedulerService` (startup hydration, register/replace/delete cron jobs, duplicate-run prevention)
  - `WebhookExecutorService` (immediate success `204`, retry then succeed, exhaust `maxRetry` and fail, `429 Retry-After` handling, timeout handling, log persistence)
  - `ExecutionLogsService` & `DashboardService` (aggregation math, zero-execution edge case)
  - Custom validators (cron expression & Discord webhook URL)
- Verify `npm test` and `npm run test:cov` pass cleanly.

### Milestone 7: Frontend Dashboard, Task Management & Log Viewer *(Mandatory)*
- Implement Next.js server-side proxy (`/api/proxy/[...path]`) injecting `X-API-Key` safely on the server.
- Build Dashboard page (KPI cards, success rate indicator, recent executions feed, auto-refresh or manual refresh).
- Build Task Management pages (table with active toggle, create/edit forms with cron validation/presets and `maxRetry` input, delete confirmation, task detail view).
- Build Execution Logs page (status filter, task filter, pagination, expandable response/error details).
- *(Optional)* Add "Run Now" button, human-readable cron descriptions, and frontend Jest tests.

### Milestone 8: Full Docker Compose Packaging & End-to-End Verification *(Mandatory)*
- Finalize multi-stage Dockerfiles for `backend` (including `prisma migrate deploy` entrypoint) and `frontend` (`standalone`).
- Finalize `docker-compose.yml` with healthchecks, `depends_on` conditions, named PostgreSQL volume, and internal network.
- Verify clean cold-start (`docker compose down -v && docker compose up --build`), API auth checks, live Discord webhook execution (or mock webhook endpoint), retry behavior, and UI walkthrough.
- Complete `README.md` with clear instructions for reviewers.

---

## 5. Dependencies

### 5.1 Backend (`backend/package.json`)

#### Runtime Dependencies
| Package | Purpose | Classification |
|---|---|---|
| `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `reflect-metadata`, `rxjs` | Core NestJS framework | Mandatory |
| `@nestjs/config` | Environment variable loading & typed config access | Mandatory |
| `@nestjs/schedule` | NestJS scheduler module & `SchedulerRegistry` | Mandatory |
| `cron` | Underlying `CronJob` class & cron validation used by `@nestjs/schedule` | Mandatory |
| `@prisma/client` | Generated type-safe PostgreSQL ORM client | Mandatory |
| `class-validator`, `class-transformer` | Request DTO validation & type transformation | Mandatory |
| `joi` | Fail-fast startup environment variable validation | Mandatory |
| `@nestjs/axios`, `axios` | HTTP client for Discord Webhook POST calls with timeout & interceptors | Mandatory |
| `helmet` | Standard HTTP security headers | Mandatory |
| `@nestjs/swagger` | OpenAPI / Swagger UI generation | Optional |
| `cronstrue` | Human-readable cron descriptions (if computed server-side) | Optional |

#### Development & Testing Dependencies
| Package | Purpose | Classification |
|---|---|---|
| `prisma` | Prisma CLI (`prisma migrate dev`, `prisma generate`, `prisma migrate deploy`) | Mandatory |
| `typescript`, `ts-node`, `@types/node`, `@types/express` | TypeScript compilation & types | Mandatory |
| `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/testing` | NestJS CLI & DI test utilities | Mandatory |
| `jest`, `ts-jest`, `@types/jest` | Unit test runner & TypeScript transformer | Mandatory |
| `eslint`, `prettier` (and TS/Nest plugins) | Code linting & formatting | Mandatory |
| `supertest`, `@types/supertest` | HTTP integration/E2E testing | Optional |

### 5.2 Frontend (`frontend/package.json`)

#### Runtime Dependencies
| Package | Purpose | Classification |
|---|---|---|
| `next`, `react`, `react-dom` | Next.js App Router framework | Mandatory |
| `lucide-react` | Clean, lightweight icon set for dashboard & task actions | Mandatory |
| `zod` | Client-side form & API response validation | Mandatory |
| `clsx`, `tailwind-merge` | Conditional className composition | Mandatory |
| `cronstrue` | Human-readable cron expression preview in task forms/tables | Optional |
| `recharts` | Lightweight chart visualization for dashboard execution trends | Optional |

#### Development & Testing Dependencies
| Package | Purpose | Classification |
|---|---|---|
| `typescript`, `@types/node`, `@types/react`, `@types/react-dom` | TypeScript support | Mandatory |
| `tailwindcss`, `postcss` | Utility-first CSS styling | Mandatory |
| `eslint`, `eslint-config-next` | Linting for Next.js best practices | Mandatory |
| `jest`, `@testing-library/react`, `@testing-library/jest-dom` | Frontend unit/component tests | Optional |

---

## 6. Environment Configuration

### 6.1 Configuration Strategy
- **Single Source of Truth in Docker:** Root `.env` (copied from `.env.example`) feeds `docker-compose.yml`, which injects scoped variables into `postgres`, `backend`, and `frontend`.
- **Local Development:** `backend/.env` and `frontend/.env.local` (git-ignored) support running apps outside Docker against a local/Docker PostgreSQL instance.
- **Fail-Fast Validation:** Backend validates required env vars on startup using `Joi` via `ConfigModule.forRoot({ validationSchema })`. Missing `DATABASE_URL` or `API_KEY` aborts boot immediately with a clear error.
- **Secret Isolation:** `API_KEY` is **never** prefixed with `NEXT_PUBLIC_`. Only the Next.js server runtime reads it to authenticate proxy calls to NestJS.

### 6.2 Environment Variables Reference

| Variable | Scope | Required | Default / Example | Description |
|---|---|---|---|---|
| `POSTGRES_USER` | DB / Compose | Yes | `postgres` | PostgreSQL username |
| `POSTGRES_PASSWORD` | DB / Compose | Yes | `postgres_secret` | PostgreSQL password |
| `POSTGRES_DB` | DB / Compose | Yes | `discord_scheduler` | PostgreSQL database name |
| `POSTGRES_PORT` | DB / Compose | No | `5432` | Host port mapping for PostgreSQL |
| `DATABASE_URL` | Backend | Yes | `postgresql://postgres:postgres_secret@postgres:5432/discord_scheduler?schema=public` | Prisma connection string |
| `NODE_ENV` | Backend / Frontend | No | `development` / `production` | Runtime environment mode |
| `BACKEND_PORT` | Backend / Compose | No | `4000` | NestJS listening port |
| `API_KEY` | Backend & Frontend Server | Yes | `change-me-strong-api-key` | Shared secret for `X-API-Key` authentication |
| `CORS_ORIGIN` | Backend | No | `http://localhost:3000` | Allowed CORS origin(s) for browser calls |
| `SCHEDULER_TIMEZONE` | Backend | No | `UTC` | Default IANA timezone for cron schedules |
| `WEBHOOK_TIMEOUT_MS` | Backend | No | `10000` | HTTP timeout per Discord webhook attempt (ms) |
| `RETRY_BASE_DELAY_MS` | Backend | No | `1000` | Base delay for exponential retry backoff (ms) |
| `ALLOW_NON_DISCORD_WEBHOOKS` | Backend | No | `false` | Optional dev/test escape hatch for local webhook mock servers |
| `FRONTEND_PORT` | Frontend / Compose | No | `3000` | Next.js listening port |
| `BACKEND_INTERNAL_URL` | Frontend Server | Yes | `http://backend:4000` (Docker) / `http://localhost:4000` (local) | Internal URL used by Next.js server/proxy to reach NestJS |

---

## 7. Docker Architecture

### 7.1 Service Topology

```mermaid
flowchart TB
    subgraph DockerNetwork["Bridge Network: scheduler-net"]
        Frontend["frontend (Next.js :3000)\nNext standalone server"]
        Backend["backend (NestJS :4000)\nEntrypoint: prisma migrate deploy -> node dist/main"]
        Postgres["postgres (PostgreSQL 16 Alpine :5432)\nHealthcheck: pg_isready"]
    end

    Host3000["Host :3000"] --> Frontend
    Host4000["Host :4000"] --> Backend
    Host5432["Host :5432 (optional dev)"] --> Postgres

    Frontend -->|"depends_on: backend (service_healthy)"| Backend
    Backend -->|"depends_on: postgres (service_healthy)"| Postgres
    Postgres --> Volume[("Named Volume: pg_data")]
```

### 7.2 Container Design Details

1. **`postgres` Service (`postgres:16-alpine`)**
   - Named volume `pg_data:/var/lib/postgresql/data` for persistence across restarts.
   - Healthcheck: `pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}` (interval `5s`, retries `10`).

2. **`backend` Service (`backend/Dockerfile`)**
   - **Multi-stage build (Node 20 Alpine):**
     - `deps`: installs npm dependencies (`npm ci`).
     - `builder`: copies `prisma/` and `src/`, runs `npx prisma generate` and `npm run build`.
     - `runner`: minimal production image containing `dist/`, `node_modules/`, `prisma/` (schema + migrations), and `docker-entrypoint.sh`. Runs as non-root `node` user.
   - **Startup Entrypoint (`docker-entrypoint.sh`):**
     1. Executes `npx prisma migrate deploy` to automatically apply all pending code-generated Prisma migrations.
     2. Executes `exec node dist/main.js` so Node receives `SIGTERM` directly for graceful shutdown.
   - **Healthcheck:** `wget -qO- http://localhost:4000/api/v1/health || exit 1`.
   - **Dependencies:** `depends_on: postgres: condition: service_healthy`.

3. **`frontend` Service (`frontend/Dockerfile`)**
   - **Multi-stage build (Node 20 Alpine):**
     - `deps`: installs dependencies (`npm ci`).
     - `builder`: runs `npm run build` with `output: 'standalone'`.
     - `runner`: copies `.next/standalone`, `.next/static`, and `public/`. Runs as non-root `nextjs` user.
   - **Dependencies:** `depends_on: backend: condition: service_healthy`.
   - **Runtime Config:** Receives `BACKEND_INTERNAL_URL=http://backend:4000` and `API_KEY` at container runtime (not baked at image build time) so secrets never leak into Docker image layers.

---

## 8. Risks and Technical Considerations

| Risk / Area | Impact | Mitigation Strategy |
|---|---|---|
| **1. Overlapping Cron Executions** | A slow webhook + multi-retry cycle can exceed a short cron interval (e.g., `* * * * *`), causing duplicate concurrent executions of the same task. | Maintain an in-memory per-task execution lock (`Set<string>` of active `taskId`s). If a task is already running when the next tick fires, skip and log a warning. *(Note: Document PostgreSQL advisory locks or BullMQ/Redis for horizontal multi-replica scaling.)* |
| **2. Discord Rate Limits (`429 Too Many Requests`)** | Rapid retries or frequent schedules trigger Discord webhook rate limits and potential temporary IP blocks. | Parse Discord's `Retry-After` header (or JSON `retry_after` field) on HTTP `429` and wait accordingly before retrying, bounded by a maximum delay cap. Enforce a sensible cap on `maxRetry` (e.g., `0–10`). |
| **3. SSRF via Arbitrary Webhook URLs** | Allowing unrestricted URLs lets callers make the backend send POST requests to internal Docker/cloud metadata endpoints. | Strictly validate `webhookUrl` to match `https://discord.com/api/webhooks/<id>/<token>` or `https://discordapp.com/api/webhooks/<id>/<token>` (with an explicit opt-in `ALLOW_NON_DISCORD_WEBHOOKS=true` flag only for local automated tests). |
| **4. API Key Exposure in Frontend Bundle** | Passing `NEXT_PUBLIC_API_KEY` to browser code exposes credentials to anyone inspecting DevTools. | Keep `API_KEY` strictly server-side in Next.js (`API_KEY`, not `NEXT_PUBLIC_*`) and route browser API traffic through Next.js `/api/proxy/[...path]`. |
| **5. Prisma & Alpine/OpenSSL Compatibility** | Prisma query engine can fail inside Alpine containers if `openssl` is missing or binary targets mismatch. | Install `openssl` (and `libc6-compat` if needed) in the backend Alpine Dockerfile and verify `prisma generate` inside the build stage. Pin Prisma v6.x LTS for predictable NestJS + Jest behavior. |
| **6. Container Startup Race Condition** | Backend starting before PostgreSQL accepts TCP connections causes `prisma migrate deploy` to fail. | Enforce `postgres` `pg_isready` healthcheck and `depends_on: condition: service_healthy` in `docker-compose.yml`. |
| **7. Cron Format & Timezone Ambiguity** | `cron` supports both 5-field (`* * * * *`) and 6-field (`*/10 * * * * *`) expressions; users may expect local time while containers default to UTC. | Document and validate supported cron syntax clearly (standard 5-field or 6-field), standardize default timezone via `SCHEDULER_TIMEZONE=UTC`, and display timezone clearly in the UI. |
| **8. Graceful Shutdown & In-Flight Retries** | Container stops (`SIGTERM`) while a retry backoff timer is sleeping could drop execution logs or leave orphan timers. | Enable NestJS shutdown hooks (`app.enableShutdownHooks()`), stop all registered `CronJob`s on `OnApplicationShutdown`, use `exec` in `docker-entrypoint.sh`, and cleanly disconnect Prisma. |
| **9. Discord `204 No Content` & Error Payload Handling** | Discord returns `204 No Content` with an empty body on webhook success; naive `res.json()` calls throw parse errors. | Treat any `2xx` (especially `204` and `200`) as success without requiring a JSON response body; safely truncate stored error bodies (e.g., max 2000 chars) to protect DB column sizes. |
| **10. Sensitive Webhook Tokens in Logs** | Logging full Discord webhook URLs leaks webhook tokens into container stdout and execution logs. | Mask webhook tokens in application logs (e.g., `https://discord.com/api/webhooks/123456/***`) and avoid storing raw webhook tokens inside `ExecutionLog` rows. |

---

## 9. Actionable Initial Setup TODO Checklist

> **Note:** Checkboxes below are split into **Mandatory** (required by the technical test) and **Optional** (value-add polish). Execution starts only after your approval.

### Phase 0 — Plan Approval & Prerequisites *(Mandatory)*
- [ ] Review and approve this project plan (`docs/ai-planning/01-project-setup.md`)
- [ ] Confirm Node.js (v20+ LTS), npm, and Docker Desktop / Docker Compose availability in the local environment
- [ ] Confirm preferred cron format policy (standard 5-field `* * * * *` vs. 5/6-field with seconds) and whether optional Swagger & "Run Now" features should be included

### Phase 1 — Monorepo & Configuration Initialization *(Mandatory)*
- [ ] Create root `.gitignore` covering `node_modules`, `.env`, `.env.local`, `dist`, `.next`, `coverage`, and OS artifacts
- [ ] Create root `.env.example` with all PostgreSQL, Backend, and Frontend environment variables
- [ ] Scaffold NestJS TypeScript project in `backend/` with strict TypeScript config and Jest configured
- [ ] Scaffold Next.js (App Router + TypeScript + Tailwind CSS) project in `frontend/` with `output: 'standalone'`
- [ ] Create `backend/.env.example` and `frontend/.env.example`
- [ ] Create initial `docker-compose.yml` for PostgreSQL + full service stubs and verify PostgreSQL boots cleanly

### Phase 2 — Database & Code-First Prisma Setup *(Mandatory)*
- [ ] Install `prisma` and `@prisma/client` in `backend/` and initialize `backend/prisma/schema.prisma`
- [ ] Design `Task`, `ExecutionLog`, and `ExecutionStatus` schema with relations, constraints, and query indexes
- [ ] Generate initial database migration strictly from Prisma schema (`npx prisma migrate dev --name init`) — no manual SQL creation
- [ ] Implement `PrismaModule` and `PrismaService` in `backend/src/prisma/`
- [ ] Implement `@Public()` `GET /api/v1/health` endpoint verifying NestJS + PostgreSQL connectivity

### Phase 3 — Backend Core, Auth & Validation *(Mandatory)*
- [ ] Implement startup environment validation (`Joi`) via `@nestjs/config`
- [ ] Implement global `ApiKeyGuard` (`X-API-Key` with constant-time check) and `@Public()` decorator
- [ ] Configure global `ValidationPipe`, standardized `HttpExceptionFilter`, `helmet`, and CORS in `main.ts`
- [ ] Implement custom validators for cron expressions and Discord webhook URLs
- [ ] Implement `TasksModule` (CRUD + enable/disable endpoints and DTOs)

### Phase 4 — Scheduler, Discord Executor & Retry Engine *(Mandatory)*
- [ ] Register `ScheduleModule.forRoot()` and implement `TaskSchedulerService` (`SchedulerRegistry` startup hydration, CRUD sync, overlap lock, shutdown cleanup)
- [ ] Implement `WebhookExecutorService` (HTTP POST to Discord webhook, timeout, `204` handling, `maxRetry` exponential backoff, `429 Retry-After` support, masked URL logging)
- [ ] Wire `TasksService` mutations to `TaskSchedulerService` and persist execution outcomes to `ExecutionLog`

### Phase 5 — Execution Logs & Dashboard Statistics *(Mandatory)*
- [ ] Implement `ExecutionLogsModule` (`GET /api/v1/logs` with pagination/filters and `GET /api/v1/logs/:id`)
- [ ] Implement `DashboardModule` (`GET /api/v1/dashboard/stats` returning task counts, execution counts, success rate, average latency, and recent executions)

### Phase 6 — Jest Unit Testing *(Mandatory)*
- [ ] Add unit tests for `ApiKeyGuard` and custom validators
- [ ] Add unit tests for `TasksService` (CRUD + scheduler sync)
- [ ] Add unit tests for `TaskSchedulerService` (bootstrap, register/update/remove, overlap protection)
- [ ] Add unit tests for `WebhookExecutorService` (success, retry-then-success, retry exhaustion, `429` handling, timeout)
- [ ] Add unit tests for `ExecutionLogsService` and `DashboardService`
- [ ] Run `npm test` & `npm run test:cov` and verify all tests pass

### Phase 7 — Frontend UI & BFF Integration *(Mandatory)*
- [ ] Implement Next.js server-side proxy (`/api/proxy/[...path]/route.ts`) injecting `X-API-Key` header
- [ ] Create typed API client (`src/lib/api-client.ts`) and shared domain types (`src/types/api.ts`)
- [ ] Build Dashboard page (`/`) displaying KPI statistics, success rate, and recent execution logs
- [ ] Build Tasks pages (`/tasks`, `/tasks/new`, `/tasks/[id]`, `/tasks/[id]/edit`) with active toggle, cron input, webhook URL, message payload, and `maxRetry` controls
- [ ] Build Execution Logs page (`/logs`) with status/task filters, pagination, and error/response detail inspection

### Phase 8 — Docker Compose Deployment & Documentation *(Mandatory)*
- [ ] Create multi-stage `backend/Dockerfile` and `backend/docker-entrypoint.sh` running `npx prisma migrate deploy` before starting NestJS
- [ ] Create multi-stage `frontend/Dockerfile` using Next.js `standalone` output
- [ ] Finalize `docker-compose.yml` with healthchecks, service ordering, volumes, and network isolation
- [ ] Perform clean end-to-end verification (`docker compose down -v && docker compose up --build`) and record evidence in `docs/ai-planning/evidence/`
- [ ] Write comprehensive `README.md` (setup, architecture, env vars, API reference, testing, Docker instructions)

### Optional Value-Add Enhancements *(Optional — Confirm Priority Before Implementing)*
- [ ] Add Swagger/OpenAPI docs at `/api/docs` with `X-API-Key` auth support
- [ ] Add `POST /api/v1/tasks/:id/trigger` ("Run Now") endpoint and UI button
- [ ] Display human-readable cron descriptions and `nextRunAt` timestamps (`cronstrue` / `CronJob.nextDate()`)
- [ ] Support rich Discord webhook fields (`username`, `avatar_url`, optional `embeds` JSON)
- [ ] Add NestJS Supertest E2E tests and Frontend Jest/RTL tests
- [ ] Add Makefile convenience targets (`make up`, `make test`, `make migrate`)
