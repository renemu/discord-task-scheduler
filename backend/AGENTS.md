# Backend Agent Instructions

## 1. Project Context

You are working on the backend of a Discord Task Scheduler application for the Insignia Full Stack Developer (R&D) technical test.

The application allows users to create, manage, and monitor scheduled tasks that send messages to Discord channels through Discord Webhooks.

Your responsibility is to build a secure, modular, maintainable, and testable backend API.

### Main Technology Stack

- Runtime: Node.js
- Language: TypeScript
- Framework: NestJS
- Database: PostgreSQL
- ORM: Prisma
- Scheduler: `@nestjs/schedule`
- HTTP Client: Axios
- Validation: `class-validator` and `class-transformer`
- Configuration: `@nestjs/config`
- Testing: Jest
- Deployment: Docker

## 2. General Agent Rules

Follow these rules whenever implementing or modifying backend code:

1. Inspect the existing project structure before making changes.
2. Read the relevant source files before modifying them.
3. Follow the existing architecture and coding conventions.
4. Use TypeScript strict typing. Avoid `any` unless absolutely necessary.
5. Write modular, reusable, and maintainable code.
6. Keep business logic out of controllers.
7. Use Dependency Injection provided by NestJS.
8. Validate all incoming request data.
9. Handle errors properly and return consistent API responses.
10. Do not expose sensitive information in API responses or logs.
11. Do not introduce unnecessary dependencies.
12. Do not modify frontend files unless explicitly requested.
13. Do not implement features outside the agreed scope without explaining why.
14. Add or update unit tests when implementing business logic.

Before implementing a major feature:

- Explain the implementation approach.
- Identify the files that will be created or modified.
- Identify potential risks.
- Wait for approval if the task explicitly requests planning or review first.

## 3. Backend Architecture

Use a modular NestJS architecture.

Suggested structure:

```text
backend/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/
│   │   ├── decorators/
│   │   ├── filters/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   └── pipes/
│   ├── config/
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   ├── auth/
│   ├── tasks/
│   ├── scheduler/
│   ├── discord/
│   ├── task-logs/
│   └── dashboard/
├── test/
├── .env.example
├── Dockerfile
└── package.json
```

Each module should have a clear responsibility.

### Module Responsibilities

| Module    | Responsibility                    |
| --------- | --------------------------------- |
| Auth      | API Key authentication            |
| Tasks     | Task CRUD and task management     |
| Scheduler | Find and execute scheduled tasks  |
| Discord   | Send webhook requests             |
| Task Logs | Store and retrieve execution logs |
| Dashboard | Provide task statistics           |
| Prisma    | Database access and lifecycle     |

Do not put all business logic into `app.module.ts` or a single service.

## 4. Database and Prisma Rules

PostgreSQL is the primary database.

Use Prisma ORM for database access and Prisma Migrate for schema management.

### Mandatory Rules

1. All database schema changes must be managed through Prisma migrations.
2. Never ask the user to create tables manually in pgAdmin or another database client.
3. Never use `prisma db push` as the final schema deployment method.
4. Generate migration files using:

```bash
npx prisma migrate dev --name descriptive_migration_name
```

5. Generate Prisma Client when required:

```bash
npx prisma generate
```

6. Use migrations for every schema modification.
7. Never commit database credentials or real secrets.

### Required Database Tables

#### tasks

The tasks table must support:

- Task ID
- Task name
- Schedule / cron expression
- Timezone
- Discord webhook URL
- Discord payload (JSONB)
- Maximum retry count
- Task status
- Next execution time
- Last execution time
- Created timestamp
- Updated timestamp

Additional fields may be introduced when technically necessary.

#### task_logs

The task_logs table must support:

- Log ID
- Related task ID
- Execution timestamp
- Execution status
- Retry count
- Execution message
- Created timestamp

Additional fields may be introduced to improve debugging and monitoring.

### Database Design Considerations

- Use appropriate PostgreSQL data types.
- Use JSON-compatible Prisma fields for Discord payloads.
- Define foreign key relationships.
- Define appropriate indexes for scheduler queries.
- Use transactions when multiple database operations must succeed or fail together.
- Prevent duplicate execution of the same scheduled task.

Do not finalize the schema without reviewing the relationship between tasks, scheduler execution, retries, and logs.

## 5. API Authentication and Security

All application API endpoints must be protected using API Key authentication unless explicitly designed as public.

Implement authentication using a NestJS Guard.

Expected behavior:

- Read the API key from an HTTP header.
- Compare it with the configured server-side API key.
- Reject missing or invalid API keys.
- Never hardcode API keys.
- Never return API keys in responses.
- Use environment variables for secrets.

Suggested header:

```http
x-api-key: YOUR_API_KEY
```

### Input Validation

Use DTOs with:

- `class-validator`
- `class-transformer`

Validate:

- Required fields
- String lengths
- Cron expressions
- Task status values
- Retry limits
- Discord webhook URL format
- Discord payload structure

### Webhook Security

- Never expose webhook URLs unnecessarily.
- Do not send webhook URLs to frontend responses unless required.
- Avoid logging full webhook URLs because they contain sensitive tokens.
- Handle invalid or unreachable webhook URLs gracefully.
- Do not allow arbitrary internal network access through webhook URLs. Apply appropriate URL validation and SSRF protection.

## 6. Task Management

Implement the following task operations:

- Create task
- Get task list
- Get task detail
- Update task
- Delete task
- Activate task
- Deactivate task
- Manually execute task

Task data should support configurable scheduling and retry behavior.

Use DTOs for all create and update operations.

Controllers should only handle HTTP concerns. Business logic belongs in services.

## 7. Scheduler Engine

Use `@nestjs/schedule` for scheduled execution.

The scheduler must:

1. Identify active tasks that are due for execution.
2. Execute tasks according to their configured schedule.
3. Send the configured payload to the Discord webhook.
4. Save execution results to `task_logs`.
5. Update task execution timestamps.
6. Schedule the next execution.
7. Handle failed executions and retries.

### Reliability Requirements

- Prevent duplicate execution.
- Handle concurrent scheduler processes safely.
- Use database transactions or atomic claiming/locking where appropriate.
- Do not block the scheduler while waiting for unrelated tasks.
- Handle invalid cron expressions.
- Handle application restarts without permanently losing scheduled tasks.

Prefer a database-backed scheduling approach so tasks remain available after application restarts.

## 8. Discord Webhook Integration

Use Axios to send HTTP POST requests to the configured Discord Webhook URL.

The request body must use the JSON payload stored in the database.

Example payload:

```json
{
  "content": "Task executed successfully!",
  "username": "Task Bot",
  "embeds": [
    {
      "title": "Task Completed",
      "description": "Scheduled task has been executed.",
      "color": 3066993
    }
  ]
}
```

Implementation requirements:

- Send HTTP POST requests.
- Set the appropriate JSON content type.
- Handle successful responses.
- Handle HTTP errors.
- Handle network timeouts.
- Handle rate limiting (HTTP 429).
- Handle server errors (HTTP 5xx).
- Mock HTTP requests in unit tests.

Do not assume every failed request should be retried indefinitely.

## 9. Retry Mechanism

Retry behavior must be configurable per task using `max_retry`.

Define retry semantics clearly:

- Initial execution is not counted as a retry.
- `max_retry` represents the maximum additional attempts after the initial attempt.
- Persist every execution attempt in `task_logs`.
- Stop retrying after the configured limit is reached.
- Update the final task execution status.
- Handle application restarts without losing retry state.

Consider HTTP response types when deciding whether to retry:

- HTTP 400: generally do not retry.
- HTTP 401 / 403: generally do not retry.
- HTTP 429: respect Discord's retry guidance where available.
- HTTP 5xx: retry according to the retry policy.
- Network timeout: retry according to the retry policy.

Avoid infinite retry loops.

## 10. Task Execution Logs

Every execution attempt must produce a persistent log.

Logs should contain:

- Task ID
- Execution time
- Status
- Retry count
- Success or failure message
- Relevant error details

Do not store sensitive credentials or complete webhook URLs in logs.

Provide API endpoints to retrieve execution logs, preferably with pagination and filtering.

## 11. Dashboard Statistics

Provide backend endpoints to support the frontend dashboard.

Required statistics:

- Total tasks
- Active tasks
- Failed tasks

Additional useful statistics may include:

- Successful executions
- Total executions
- Recent execution history

Use database aggregation where appropriate instead of loading all records into application memory.

## 12. API Design

Use RESTful API conventions.

Suggested endpoints:

```text
GET     /api/tasks
POST    /api/tasks
GET     /api/tasks/:id
PATCH   /api/tasks/:id
DELETE  /api/tasks/:id

PATCH   /api/tasks/:id/activate
PATCH   /api/tasks/:id/deactivate
POST    /api/tasks/:id/execute

GET     /api/tasks/:id/logs
GET     /api/logs

GET     /api/dashboard/summary
```

All endpoints must use API Key authentication unless explicitly approved otherwise.

Use appropriate HTTP status codes and consistent response formats.

Add pagination to list endpoints.

## 13. Unit Testing

Use Jest for backend unit tests.

The following test areas are mandatory:

1. Task CRUD operations.
2. Scheduler execution logic.
3. Retry mechanism.
4. API authentication Guard.
5. Discord webhook request handling using mocked HTTP requests.

Testing rules:

- Do not make real Discord webhook requests in unit tests.
- Mock external dependencies.
- Test success and failure scenarios.
- Test invalid input.
- Test retry limits.
- Test authentication failures.
- Test scheduler duplicate-execution protection.

Run tests after implementing each major feature.

```bash
npm run test
```

Also run:

```bash
npm run build
```

Fix TypeScript errors and failing tests before considering implementation complete.

## 14. Environment Configuration

Use `@nestjs/config` for environment configuration.

Expected variables:

```env
NODE_ENV=development
PORT=4000
API_KEY=change-me
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/discord_scheduler
```

Additional variables may be added when necessary.

Rules:

- Maintain `.env.example`.
- Never commit `.env`.
- Validate required environment variables at startup.
- Do not hardcode secrets in source code.

## 15. Docker Requirements

The backend must be deployable using Docker Compose.

Requirements:

- Backend runs inside a container.
- PostgreSQL runs inside a container.
- Database connection uses environment variables.
- Migrations can be executed during deployment.
- Application waits for database readiness where necessary.
- Provide a reliable startup command.

The application must be runnable locally with minimal setup.

Do not assume the host machine has PostgreSQL installed.

## 16. Development Workflow

For every assigned feature, follow this workflow:

### Step 1 — Inspect

- Inspect existing source code.
- Identify relevant modules and dependencies.
- Understand existing implementation before editing.

### Step 2 — Plan

- Explain the implementation approach.
- List files to create or modify.
- Identify database changes.
- Identify security and reliability considerations.

### Step 3 — Implement

- Follow NestJS module conventions.
- Use DTOs, services, controllers, and guards appropriately.
- Keep code modular.
- Add error handling.

### Step 4 — Test

- Add or update unit tests.
- Run relevant tests.
- Run TypeScript build.
- Fix errors before proceeding.

### Step 5 — Report

Summarize:

- What was implemented.
- Files created or modified.
- Database migrations created.
- Tests executed and results.
- Remaining issues or TODOs.

## 17. Scope Priorities

Prioritize implementation in this order:

### P0 — Mandatory

- NestJS application setup
- PostgreSQL connection
- Prisma schema and migrations
- API Key authentication
- Task CRUD
- Discord webhook integration
- Scheduler execution
- Configurable retry mechanism
- Persistent execution logs
- Dashboard statistics
- Required unit tests
- Docker deployment

### P1 — Improvements

- Pagination and filtering
- Better error reporting
- Timezone handling
- Scheduler concurrency protection
- Rate-limit handling
- API documentation with Swagger

### P2 — Optional

- Redis
- BullMQ
- Advanced monitoring
- Multiple user roles
- Complex queue management

Do not prioritize optional features over mandatory requirements.

## 18. Final Acceptance Criteria

The backend is considered ready when:

- [ ] NestJS starts successfully.
- [ ] PostgreSQL connection works.
- [ ] Database schema is created through Prisma migrations.
- [ ] API Key authentication works.
- [ ] Task CRUD endpoints work.
- [ ] Tasks can be scheduled.
- [ ] Scheduled tasks send valid Discord webhook payloads.
- [ ] Retry mechanism respects `max_retry`.
- [ ] Every execution attempt is logged.
- [ ] Dashboard statistics are available.
- [ ] Required unit tests pass.
- [ ] Production build succeeds.
- [ ] Backend runs through Docker Compose.
- [ ] `.env.example` is complete.
- [ ] No real secrets are committed.

**Important:** The goal is to deliver a working, reliable, and maintainable backend that satisfies the technical test requirements. Prefer a simple, well-tested implementation over unnecessary architectural complexity.
