# Discord Task Scheduler (PulseHook)

A full-stack Discord Task Scheduler built with **Next.js (TypeScript)**, **NestJS (TypeScript)**, **PostgreSQL**, **Prisma ORM 8**, and **`@nestjs/schedule`** to manage recurring Discord Webhook notifications with configurable retries, persistent execution logs, dashboard statistics, and API Key authentication.

---

## 1. How to Run the Application Locally

### Prerequisites
- **Node.js** `>= 22.18` (Node 22 LTS or 24 LTS recommended) & `npm`
- **PostgreSQL** `>= 15` running locally

### Step 1 — Create an Empty PostgreSQL Database
Do **not** create tables manually; Prisma ORM 8 migrations manage all tables, indexes, and constraints.

```sql
CREATE DATABASE discord_scheduler;
```

### Step 2 — Configure Environment Variables

**Backend (`backend/.env`):**
```bash
cp backend/.env.example backend/.env
```
Update `DATABASE_URL` and `API_KEY` in `backend/.env`:
```env
NODE_ENV=development
PORT=4000
API_KEY=change-me
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/discord_scheduler
CORS_ORIGIN=http://localhost:3000
```

**Frontend (`frontend/.env.local`):**
```bash
cp frontend/.env.example frontend/.env.local
```
Ensure `API_KEY` matches the backend `API_KEY`:
```env
BACKEND_INTERNAL_URL=http://localhost:4000
API_KEY=change-me
```

### Step 3 — Install Dependencies & Apply Prisma ORM 8 Migrations

```bash
# Backend dependencies & database migration
cd backend
npm install
npx prisma db migrate
npx prisma migration status
```

```bash
# Frontend dependencies
cd ../frontend
npm install
```

### Step 4 — Start Backend and Frontend

**Terminal 1 — Backend API (`http://localhost:4000`):**
```bash
cd backend
npm run start:dev
```

**Terminal 2 — Frontend Dashboard (`http://localhost:3000`):**
```bash
cd frontend
npm run dev
```

Open **`http://localhost:3000`** in your browser.

---

## 2. API Endpoints List (Postman / Thunder Client)

### Postman / Thunder Client Collection Setup
- **Base URL:** `http://localhost:4000/api`
- **Auth Header (required for all protected routes):**
  - Key: `x-api-key`
  - Value: `<your API_KEY from backend/.env>`
- **Body Header (for `POST` / `PATCH`):**
  - Key: `Content-Type`
  - Value: `application/json`

### Endpoints Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | Public | Health check & PostgreSQL connection status |
| `GET` | `/api/tasks` | `x-api-key` | List tasks (query params: `page`, `limit`, `status`, `search`) |
| `POST` | `/api/tasks` | `x-api-key` | Create a new scheduled task |
| `GET` | `/api/tasks/:id` | `x-api-key` | Get task detail by UUID (`webhookUrl` is masked) |
| `PATCH` | `/api/tasks/:id` | `x-api-key` | Update task configuration, schedule, or payload |
| `DELETE` | `/api/tasks/:id` | `x-api-key` | Delete task and cascade its execution logs |
| `PATCH` | `/api/tasks/:id/activate` | `x-api-key` | Activate task (`ACTIVE`) and recompute `nextRunAt` |
| `PATCH` | `/api/tasks/:id/deactivate` | `x-api-key` | Pause task (`PAUSED`) and clear `nextRunAt` |
| `POST` | `/api/tasks/:id/execute` | `x-api-key` | Trigger immediate manual webhook execution |
| `GET` | `/api/tasks/:id/logs` | `x-api-key` | List execution logs for a specific task (`page`, `limit`, `status`) |
| `GET` | `/api/logs` | `x-api-key` | List all execution logs (`page`, `limit`, `taskId`, `status`, `executionId`) |
| `GET` | `/api/dashboard/summary` | `x-api-key` | Aggregated dashboard statistics & 10 most recent executions |

### Sample Request Bodies (Postman / Thunder Client)

**`POST /api/tasks`**
```json
{
  "name": "Daily Standup Reminder",
  "cronExpression": "0 9 * * 1-5",
  "timezone": "Asia/Jakarta",
  "webhookUrl": "https://discord.com/api/webhooks/123456789012345678/your-webhook-token",
  "maxRetry": 3,
  "status": "ACTIVE",
  "payload": {
    "username": "PulseHook Bot",
    "content": "Good morning team! Standup starts in 10 minutes.",
    "embeds": [
      {
        "title": "Daily Standup",
        "description": "Share yesterday's progress, today's plan, and blockers.",
        "color": 5793266
      }
    ]
  }
}
```

**`PATCH /api/tasks/:id`**
```json
{
  "name": "Daily Standup Reminder (Updated)",
  "cronExpression": "*/15 * * * *",
  "maxRetry": 5
}
```

---

## 3. How to Run Unit Tests

All backend unit tests mock external dependencies (Prisma database calls and Axios Discord webhook requests — no real Discord requests are sent).

```bash
cd backend

# Run all unit tests (8 test files, 49 unit tests)
npm run test

# Run unit tests with coverage report
npm run test:cov

# Run E2E API integration tests (requires local PostgreSQL; Discord webhook is mocked)
npm run test:e2e

# Verify type-aware linting and production build
npm run lint
npm run build
```

### Unit Test Suites Included
- `src/auth/api-key.guard.spec.ts` — `@Public()` bypass, valid/missing/empty/invalid `x-api-key`
- `src/tasks/tasks.service.spec.ts` — Task CRUD, pagination, cron validation, webhook URL masking, activate/deactivate, manual execute
- `src/scheduler/scheduler.service.spec.ts` — `FOR NO KEY UPDATE SKIP LOCKED` claiming, exponential backoff retry, `429 Retry-After`, `maxRetry` exhaustion, non-retryable `4xx`, PostgreSQL `23505` duplicate protection, overlap guard, startup recovery
- `src/discord/discord.service.spec.ts` — Mocked Axios (`204`, `429`, `5xx`, `400/401/403/404`, network timeout, SSRF blocking)
- `src/dashboard/dashboard.service.spec.ts` — Database aggregations, success rate & average latency edge cases
- `src/task-logs/task-logs.service.spec.ts` — Paginated logs & missing task error handling
- `src/common/validators/validators.spec.ts` — Cron, timezone, Discord webhook URL/masking, and JSONB payload validation

---

## 4. Coding Agent (CLI) Usage with PLAN & TODO Outputs

This repository was developed using a **CLI coding agent workflow** (Antigravity CLI / Gemini CLI) following a strict **Inspect -> Plan & TODO -> Approve -> Implement -> Verify** loop before writing application code.

### CLI Workflow Steps

1. **Launch the CLI Coding Agent in the project root:**
   ```bash
   cd discord-task-scheduler
   # Example CLI agent invocation (Antigravity CLI / Gemini CLI)
   agy
   # or: gemini
   ```

2. **Stage 1 — Initial Project Setup Planning (PLAN + TODO):**
   - Prompted the CLI agent to act as a senior full-stack architect and produce an architecture plan, folder structure, dependencies, env config, Docker architecture, risk analysis, and actionable TODO checkboxes **without writing code yet**.
   - **Generated Output:** [`docs/ai-planning/01-project-setup.md`](docs/ai-planning/01-project-setup.md)

3. **Stage 2 — Database Schema Design & Prisma ORM 8 Migration Planning (PLAN + TODO):**
   - Prompted the CLI agent to inspect the actual installed Prisma ORM 8 CLI (`8.0.0-rc.34`), `prisma.config.ts`, and `src/prisma/contract.prisma`, then design the ERD, indexes, constraints, scheduler locking strategy, migration workflow, and TODO checklist before modifying the database.
   - After plan approval, executed Stage 2B (`npx prisma contract emit`, `npx prisma migration plan --name init`, `npx prisma db migrate --advance-ref db`, `npx prisma db verify`) and recorded the verification log inside the plan document.
   - **Generated Output:** [`docs/ai-planning/02-database-schema-design.md`](docs/ai-planning/02-database-schema-design.md)

4. **Stage 3 — API Endpoint Planning (PLAN + TODO):**
   - Documented the REST API contract, `x-api-key` guard flow, Next.js server-side BFF proxy, DTO validation rules, webhook masking / SSRF protection, error envelope, and TODO checklist.
   - **Generated Output:** [`docs/ai-planning/03-api-endpoint-planning.md`](docs/ai-planning/03-api-endpoint-planning.md)

5. **Stage 4 — Unit Test Generation Plan (PLAN + TODO):**
   - Planned the mocking boundaries, test matrices across all mandatory backend modules (`ApiKeyGuard`, `TasksService`, `SchedulerService`, `DiscordService`, `DashboardService`, `TaskLogsService`, validators, and E2E), verified with `npm run test` & `npm run test:e2e`, and tracked completion via checkboxes.
   - **Generated Output:** [`docs/ai-planning/04-unit-test-generation.md`](docs/ai-planning/04-unit-test-generation.md)

### Summary of PLAN & TODO Artifacts

| Planning Area | PLAN / TODO Document |
|---|---|
| Initial project setup | [`docs/ai-planning/01-project-setup.md`](docs/ai-planning/01-project-setup.md) |
| Database schema design | [`docs/ai-planning/02-database-schema-design.md`](docs/ai-planning/02-database-schema-design.md) |
| API endpoint planning | [`docs/ai-planning/03-api-endpoint-planning.md`](docs/ai-planning/03-api-endpoint-planning.md) |
| Unit test generation | [`docs/ai-planning/04-unit-test-generation.md`](docs/ai-planning/04-unit-test-generation.md) |

---

## 5. How to Run the Application in Docker

### Prerequisites
- **Docker Desktop** (or Docker Engine + Docker Compose v2)

### Step 1 — Configure Root Environment File

```bash
cp .env.example .env
```

Edit `.env` at the repository root and set your credentials/secrets:
```env
NODE_ENV=production
PORT=4000
API_KEY=change-me-strong-secret-key
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/discord_scheduler
```

### Step 2 — Build & Start All Services (PostgreSQL, Backend, Frontend)

```bash
docker compose up --build -d
```

What happens on startup:
1. **`postgres`** (`postgres:16-alpine`) starts with a persistent named volume and waits until `pg_isready` reports healthy.
2. **`backend`** (NestJS) runs `npx prisma db migrate --db "$DATABASE_URL"` automatically via its entrypoint to apply all Prisma ORM 8 migrations before starting `node dist/main.js` on port `4000`.
3. **`frontend`** (Next.js standalone server) starts on port `3000` once the backend `/api/health` check is healthy, forwarding browser requests to `http://backend:4000/api/*` with `x-api-key` injected server-side.

### Step 3 — Verify & Inspect Logs

```bash
# Check running containers & health status
docker compose ps

# Follow logs for all services
docker compose logs -f

# Verify backend health endpoint
curl http://localhost:4000/api/health
```

Access the application at **`http://localhost:3000`** (Frontend) and **`http://localhost:4000/api`** (Backend API).

### Step 4 — Stop & Clean Up

```bash
# Stop containers (preserves PostgreSQL data volume)
docker compose down

# Stop containers and remove database volume (clean slate)
docker compose down -v
```

---

## 6. Open-Source Libraries Used

### Backend (`backend/package.json`)

| Library | Purpose |
|---|---|
| `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` | Modular TypeScript backend framework & HTTP server |
| `@nestjs/config`, `dotenv` | Environment configuration loading & startup validation |
| `@nestjs/schedule` | Cron-based background scheduler engine |
| `prisma`, `@prisma/orm-postgres`, `@prisma/cli-engine` | Prisma ORM 8 contract-first PostgreSQL client & migration toolchain |
| `axios` | HTTP client for Discord Webhook `POST` execution |
| `cron-parser` | Cron expression validation and IANA timezone-aware `nextRunAt` calculation |
| `class-validator`, `class-transformer` | Declarative DTO & custom input validation (cron, timezone, webhook URL, payload) |
| `rxjs`, `reflect-metadata` | NestJS reactive & decorator metadata runtime |
| `vitest`, `@vitest/coverage-v8`, `@nestjs/testing`, `supertest` | Unit testing, coverage reporting, and E2E HTTP integration testing |
| `oxlint`, `oxlint-tsgolint`, `prettier`, `typescript` | Type-aware linting, formatting, and strict TypeScript compilation |

### Frontend (`frontend/package.json`)

| Library | Purpose |
|---|---|
| `next` | React full-stack framework (App Router, server-side BFF proxy `/api/proxy/*`, standalone output) |
| `react`, `react-dom` | UI component library |
| `tailwindcss`, `@tailwindcss/turbopack` | Utility-first CSS framework for modern responsive Dribbble-inspired UI |
| `eslint`, `eslint-config-next`, `typescript` | Code linting and strict TypeScript type-checking |

### Infrastructure

| Image / Tool | Purpose |
|---|---|
| `postgres:16-alpine` | PostgreSQL relational database for persistent tasks, JSONB payloads, and execution logs |
| `node:22-alpine` | Lightweight container runtime for backend and frontend Docker images |

