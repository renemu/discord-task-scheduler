# PulseHook — Discord Task Scheduler

Aplikasi full-stack **Discord Task Scheduler** untuk membuat, menjadwalkan, mengeksekusi, dan memantau pengiriman pesan otomatis ke channel Discord melalui **Discord Webhooks** dengan dukungan **cron expression**, **timezone IANA**, **configurable retry mechanism**, **persistent execution logs**, **dashboard statistics**, dan **API Key authentication**.

---

## Fitur Utama

- **Task CRUD & Lifecycle Management** — Buat, lihat, ubah, hapus, aktifkan (`ACTIVE`), jeda (`PAUSED`), nonaktifkan (`DISABLED`), serta jalankan task secara manual (*Run Now*).
- **Database-Backed Cron Scheduler** — Menggunakan `@nestjs/schedule` + `cron-parser` v5 dengan state jadwal tersimpan di PostgreSQL (`next_run_at`, `timezone`, `locked_at`, `locked_by`) sehingga tahan terhadap restart aplikasi dan aman untuk eksekusi paralel (`FOR NO KEY UPDATE SKIP LOCKED`).
- **Discord Webhook Integration & SSRF Protection** — Mengirim HTTP `POST` JSONB payload via Axios dengan validasi host Discord resmi, masking token webhook di API response & log (`webhookUrlMasked`), serta penanganan respons `2xx`, `429` (`Retry-After`), `5xx`, dan timeout.
- **Configurable Retry Mechanism** — Batas `max_retry` (`0–10`) per task, exponential backoff, menghormati header/body `Retry-After` pada HTTP `429`, tidak melakukan retry ulang untuk error permanen `4xx` (`400`, `401`, `403`, `404`), dan state retry tersimpan permanen di database.
- **Execution Logs & Duplicate Prevention** — Setiap percobaan eksekusi (initial run maupun setiap retry) tercatat di `task_logs` dengan `execution_id` untuk korelasi, status HTTP, durasi (ms), pesan, serta proteksi duplikasi tingkat database (partial unique index pada `(task_id, scheduled_for, retry_count)`).
- **Dashboard Statistics** — Agregasi langsung di PostgreSQL untuk total task, active/paused/disabled/failed tasks, total executions, success rate (%), rata-rata latency webhook, distribusi outcome, dan 10 eksekusi terbaru.
- **API Key Authentication & Server-Side Proxy (BFF)** — Seluruh endpoint backend (kecuali `GET /api/health`) dilindungi `ApiKeyGuard` (`x-api-key` dengan `crypto.timingSafeEqual`). Frontend meneruskan request lewat Next.js Route Handler `/api/proxy/*` agar `API_KEY` tidak pernah terekspos ke browser bundle.
- **Modern Responsive UI** — Antarmuka modern & bersih bergaya SaaS Dribbble dengan **Live Discord Message Preview**, **Visual & Raw JSON Payload Builder**, **Cron Preset Chips**, serta tampilan **mobile-first** lengkap dengan bottom navigation bar, mobile cards, dan bottom-sheet log drawer.

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| **Frontend** | Next.js `16.4.6` (App Router, Turbopack, `output: "standalone"`), React `19.3`, TypeScript `5`, Tailwind CSS `4.3` |
| **Backend** | NestJS `12.0` (ESM `"type": "module"`), TypeScript `6.0`, `@nestjs/schedule`, `@nestjs/config`, `class-validator`, `class-transformer`, `cron-parser` v5, Axios |
| **Database** | PostgreSQL `>= 15` (diuji pada PostgreSQL `18.4`) |
| **ORM & Migrations** | **Prisma ORM 8** (`prisma@8.0.0-rc.34`, `@prisma/orm-postgres@8.0.0-rc.24`) — Contract-First (`contract.prisma` + versioned migration graph) |
| **Testing & Linting** | Vitest `4.1` + Supertest (Backend Unit & E2E), Oxlint (`--type-aware`), ESLint `9` (`eslint-config-next`) |

---

## Arsitektur & Cara Integrasi

```mermaid
flowchart LR
    Browser["Browser (Desktop / Mobile)"] -->|"HTTP :3000"| NextUI["Frontend: Next.js 16 App Router"]
    NextUI -->|"fetch /api/proxy/*"| BFF["Next.js Server Proxy (/api/proxy/[...path])"]
    BFF -->|"HTTP :4000 + x-api-key (Server-only)"| NestAPI["Backend: NestJS 12 REST API"]
    ExtClient["API Client / curl"] -->|"HTTP :4000 + x-api-key"| NestAPI

    subgraph Backend["NestJS Backend Modules"]
        NestAPI --> Guard["ApiKeyGuard (timingSafeEqual)"]
        Guard --> Controllers["Tasks / TaskLogs / Dashboard / Health"]
        Controllers --> Services["Domain Services"]
        Scheduler["SchedulerService (@nestjs/schedule)"] --> DiscordSvc["DiscordService (Axios + SSRF Check)"]
        Services --> PrismaSvc["PrismaService (@prisma/orm-postgres)"]
        Scheduler --> PrismaSvc
    end

    PrismaSvc -->|"TCP :5432"| PG[("PostgreSQL >= 15")]
    DiscordSvc -->|"HTTPS POST JSON"| Discord["Discord Webhook API"]
```

### Bagaimana Frontend, Backend, Database, dan Discord Terintegrasi

1. **Frontend -> Backend (BFF Pattern):**
   - Browser tidak pernah menyimpan atau mengirim `API_KEY` secara langsung.
   - Semua pemanggilan API dari client (`frontend/lib/api-client.ts`) diarahkan ke `/api/proxy/<endpoint>`.
   - Route Handler `frontend/app/api/proxy/[...path]/route.ts` berjalan di server Next.js, membaca `BACKEND_INTERNAL_URL` dan `API_KEY` dari environment server, menyisipkan header `x-api-key`, lalu mem-proxy request ke NestJS (`${BACKEND_INTERNAL_URL}/api/<endpoint>`).
2. **Backend -> PostgreSQL (Prisma ORM 8):**
   - Skema didefinisikan secara deklaratif di `backend/src/prisma/contract.prisma`.
   - `npx prisma contract emit` menghasilkan `contract.json` dan `contract.d.ts` (strongly-typed query client).
   - `backend/src/prisma/prisma.service.ts` membungkus singleton `db` dari `src/prisma/db.ts` dalam NestJS `@Global()` module dan menutup pool secara otomatis saat `OnApplicationShutdown`.
3. **Backend Scheduler -> Discord Webhook:**
   - Setiap 5 detik (`@Cron('*/5 * * * * *')`), `SchedulerService` mengambil batch task aktif yang sudah jatuh tempo (`next_run_at <= NOW()`) dalam transaksi singkat menggunakan `.forNoKeyUpdate({ skipLocked: true })` dan menandai lease (`locked_at`, `locked_by`).
   - Transaksi langsung di-commit sebelum HTTP request dimulai (agar koneksi DB tidak tertahan selama network I/O).
   - `DiscordService` mengirim HTTP `POST` ke Discord Webhook URL dengan JSONB `payload`.
   - Hasil pengiriman disimpan ke `task_logs` sekaligus memperbarui `tasks` (`last_run_at`, `last_execution_status`, `retry_count`, `next_run_at`, melepas lock) dalam satu transaksi atomik.

---

## Struktur Monorepo

```text
discord-task-scheduler/
├── README.md                              # Dokumentasi utama project ini
├── .env.example                           # Template environment root
├── .gitignore
├── docs/
│   └── ai-planning/
│       ├── 01-project-setup.md            # Rencana arsitektur & setup awal
│       └── 02-database-schema-design.md   # Desain ERD, Prisma 8 & log implementasi Stage 2B
├── backend/
│   ├── AGENTS.md                          # Pedoman arsitektur & standar backend
│   ├── prisma.config.ts                   # Konfigurasi Prisma ORM 8
│   ├── .env.example                       # Template environment backend
│   ├── migrations/                        # Migrasi & snapshot yang di-generate Prisma ORM 8
│   │   ├── app/20261121T0317_init/
│   │   ├── app/refs/db.json
│   │   └── snapshots/
│   ├── src/
│   │   ├── main.ts                        # Bootstrap, prefix /api, CORS, shutdown hooks
│   │   ├── app.module.ts                  # Wiring modul, global ValidationPipe & ExceptionFilter
│   │   ├── config/env.validation.ts       # Validasi env wajib saat startup
│   │   ├── prisma/                        # contract.prisma, contract.json, contract.d.ts, db.ts, PrismaModule
│   │   ├── auth/                          # ApiKeyGuard (APP_GUARD) & unit tests
│   │   ├── common/                        # @Public(), AllExceptionsFilter, cron/webhook utils & validators
│   │   ├── health/                        # GET /api/health (public)
│   │   ├── discord/                       # DiscordService (Axios, 429 Retry-After, SSRF check)
│   │   ├── scheduler/                     # SchedulerService (claiming, retry, startup recovery)
│   │   ├── tasks/                         # Task CRUD, activate/deactivate, manual execute
│   │   ├── task-logs/                     # Paginated & filterable execution logs
│   │   └── dashboard/                     # Database-aggregated dashboard summary
│   └── test/app.e2e-spec.ts               # E2E integration tests terhadap PostgreSQL
└── frontend/
    ├── next.config.ts                     # Next.js 16 (standalone, cacheComponents, Turbopack)
    ├── .env.example                       # Template environment frontend server-side
    ├── app/
    │   ├── layout.tsx                     # Root layout, Geist fonts, ToastProvider, AppShell
    │   ├── page.tsx                       # Dashboard overview (KPI bento grid & recent activity)
    │   ├── tasks/
    │   │   ├── page.tsx                   # Daftar task (mobile cards + desktop table)
    │   │   ├── new/page.tsx               # Create task + Live Discord Preview
    │   │   └── [id]/
    │   │       ├── page.tsx               # Detail task & riwayat eksekusi task
    │   │       └── edit/page.tsx          # Edit task
    │   ├── logs/page.tsx                  # Execution logs explorer + bottom-sheet detail modal
    │   └── api/proxy/[...path]/route.ts   # Server-side BFF proxy penyisip x-api-key
    ├── components/                        # AppShell, TaskForm, DiscordPreview, LogDetailModal, UI kit
    ├── lib/                               # api-client.ts, formatters.ts
    └── types/api.ts                       # Kontrak tipe TypeScript frontend <-> backend
```

---

## Prasyarat

Pastikan lingkungan lokal Anda memiliki:

- **Node.js `>= 22.18`** (direkomendasikan Node 22 LTS / 24 LTS) & `npm`
- **PostgreSQL `>= 15`** (syarat minimum Prisma ORM 8) yang aktif dan dapat diakses

---

## Cara Setup & Menjalankan Project

### 1. Siapkan Database PostgreSQL

Buat database kosong bernama `discord_scheduler` di PostgreSQL lokal Anda (jangan membuat tabel secara manual — semua tabel dikelola melalui migrasi Prisma ORM 8):

```sql
CREATE DATABASE discord_scheduler;
```

### 2. Konfigurasi Environment Variables

#### Backend (`backend/.env`)

Salin template lalu sesuaikan `DATABASE_URL` dan `API_KEY`:

```bash
cp backend/.env.example backend/.env
```

Isi utama `backend/.env`:

```env
NODE_ENV=development
PORT=4000
API_KEY=change-me-strong-secret-key
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/discord_scheduler
CORS_ORIGIN=http://localhost:3000

# Optional scheduler & webhook tuning
SCHEDULER_POLL_MS=5000
SCHEDULER_BATCH_SIZE=20
SCHEDULER_LEASE_MS=300000
WEBHOOK_TIMEOUT_MS=10000
RETRY_BASE_DELAY_MS=2000
RETRY_MAX_DELAY_MS=60000
ALLOW_NON_DISCORD_WEBHOOKS=false
```

#### Frontend (`frontend/.env.local`)

Salin template dan pastikan `API_KEY` **sama persis** dengan `API_KEY` milik backend:

```bash
cp frontend/.env.example frontend/.env.local
```

Isi `frontend/.env.local`:

```env
BACKEND_INTERNAL_URL=http://localhost:4000
API_KEY=change-me-strong-secret-key
```

> **Catatan Keamanan:** Jangan pernah menambahkan prefix `NEXT_PUBLIC_` pada `API_KEY`. Variabel di atas hanya dibaca oleh server Next.js di route `/api/proxy/*`.

### 3. Install Dependencies & Jalankan Migrasi Database (Prisma ORM 8)

```bash
# Install dependencies backend
cd backend
npm install

# Terapkan migrasi Prisma ORM 8 ke PostgreSQL (tanpa SQL manual)
npx prisma db migrate

# Verifikasi status migrasi & kesesuaian skema database
npx prisma migration status
npx prisma db verify
```

```bash
# Install dependencies frontend (di terminal lain atau dari root)
cd ../frontend
npm install
```

### 4. Jalankan Aplikasi (Development Mode)

Buka dua terminal terpisah:

**Terminal 1 — Backend (NestJS di `http://localhost:4000`)**

```bash
cd backend
npm run start:dev
```

**Terminal 2 — Frontend (Next.js di `http://localhost:3000`)**

```bash
cd frontend
npm run dev
```

Akses dashboard melalui browser di **`http://localhost:3000`**.

---

## Alur Migrasi Database (Prisma ORM 8)

Project ini menggunakan **Prisma ORM 8** (bukan Prisma 7). Seluruh perubahan skema wajib dilakukan lewat alur berikut di dalam folder `backend/`:

```bash
# 1. Edit model pada backend/src/prisma/contract.prisma
# 2. Emit ulang contract.json dan contract.d.ts
npx prisma contract emit

# 3. Buat rencana migrasi baru (chained dari ref `db`)
npx prisma migration plan --name nama_perubahan_snake_case

# 4. Tinjau isi migrasi yang dihasilkan
npx prisma migration show migrations/app/<folder_migrasi>

# 5. Terapkan migrasi ke database lokal & majukan ref `db`
npx prisma db migrate --advance-ref db

# 6. Verifikasi database cocok dengan contract
npx prisma db verify
```

> **Penting:** Jangan gunakan perintah Prisma 7 (`prisma migrate dev`, `prisma migrate deploy`, `prisma generate`, `prisma db push`) dan jangan membuat/mengubah tabel secara manual di pgAdmin.

### Skema Database

- **`public.tasks`**: `id` (UUIDv7 PK), `name`, `cron_expression`, `timezone`, `webhook_url`, `payload` (`jsonb`), `max_retry` (`0..10`), `status` (`ACTIVE | PAUSED | DISABLED`), `next_run_at`, `last_run_at`, `last_execution_status`, `retry_count`, `locked_at`, `locked_by`, `created_at`, `updated_at`.
- **`public.task_logs`**: `id` (UUIDv7 PK), `task_id` (FK -> `tasks.id ON DELETE CASCADE`), `execution_id` (UUIDv7 korelasi retry), `scheduled_for`, `executed_at`, `status` (`RUNNING | RETRYING | SUCCESS | FAILED`), `retry_count`, `http_status`, `duration_ms`, `message`, `created_at`.

---

## Cara Integrasi Discord Webhook

1. Buka Discord Server Anda -> **Server Settings** -> **Integrations** -> **Webhooks** -> **New Webhook**.
2. Pilih channel tujuan lalu klik **Copy Webhook URL** (format: `https://discord.com/api/webhooks/{id}/{token}`).
3. Di aplikasi **PulseHook** (`http://localhost:3000/tasks/new`), masukkan:
   - **Task Name**, **Discord Webhook URL**, **Cron Expression** (atau pilih preset cepat), **Timezone**, dan **Max Retries**.
   - Susun pesan di **Visual Builder** (atau **Raw JSON**) sambil melihat **Live Discord Preview**.
4. Klik **Create Scheduled Task**. Anda dapat langsung menguji pengiriman melalui tombol **Run Now** tanpa menunggu jadwal cron berikutnya.

---

## Referensi REST API

Base URL lokal: `http://localhost:4000/api`  
Semua endpoint (kecuali `/api/health`) wajib menyertakan header:

```http
x-api-key: <API_KEY>
```

| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `GET` | `/api/health` | Public | Cek status server & koneksi PostgreSQL |
| `GET` | `/api/tasks` | API Key | Daftar task (query: `page`, `limit`, `status`, `search`) |
| `POST` | `/api/tasks` | API Key | Membuat task terjadwal baru |
| `GET` | `/api/tasks/:id` | API Key | Detail task (webhook URL di-mask) |
| `PATCH` | `/api/tasks/:id` | API Key | Mengubah konfigurasi / jadwal / payload task |
| `DELETE` | `/api/tasks/:id` | API Key | Menghapus task beserta seluruh log-nya (`CASCADE`) |
| `PATCH` | `/api/tasks/:id/activate` | API Key | Mengaktifkan task & menghitung ulang `next_run_at` |
| `PATCH` | `/api/tasks/:id/deactivate` | API Key | Menjeda task (`PAUSED`) & mengosongkan `next_run_at` |
| `POST` | `/api/tasks/:id/execute` | API Key | Eksekusi manual segera (menghormati `max_retry`) |
| `GET` | `/api/tasks/:id/logs` | API Key | Riwayat log eksekusi untuk satu task (paginasi & filter) |
| `GET` | `/api/logs` | API Key | Seluruh log eksekusi global (query: `page`, `limit`, `taskId`, `status`, `executionId`) |
| `GET` | `/api/dashboard/summary` | API Key | Statistik agregasi dashboard & 10 eksekusi terbaru |

### Contoh Request (`curl`)

```bash
# 1. Health check (public)
curl http://localhost:4000/api/health

# 2. Membuat task baru
curl -X POST http://localhost:4000/api/tasks \
  -H "Content-Type: application/json" \
  -H "x-api-key: change-me-strong-secret-key" \
  -d '{
    "name": "Daily Standup Reminder",
    "cronExpression": "0 9 * * 1-5",
    "timezone": "Asia/Jakarta",
    "webhookUrl": "https://discord.com/api/webhooks/123456789012345678/your-webhook-token-here",
    "maxRetry": 3,
    "payload": {
      "username": "PulseHook Bot",
      "content": "Good morning team! Daily standup starts in 10 minutes.",
      "embeds": [
        {
          "title": "Standup Checklist",
          "description": "Share yesterday progress, today plan, and blockers.",
          "color": 5793266
        }
      ]
    }
  }'

# 3. Melihat ringkasan dashboard
curl http://localhost:4000/api/dashboard/summary \
  -H "x-api-key: change-me-strong-secret-key"
```

---

## Testing, Linting & Production Build

### Backend

```bash
cd backend

# Unit tests (49 tests mencakup Auth Guard, Task CRUD, Scheduler, Retry, Discord Axios mock, Logs, Dashboard, Validators)
npm run test

# E2E integration tests terhadap PostgreSQL lokal (5 tests full API lifecycle)
npm run test:e2e

# Type-aware linter (Oxlint)
npm run lint

# Production build (NestJS TypeScript)
npm run build
```

### Frontend

```bash
cd frontend

# ESLint (Next.js + React 19 strict hooks)
npm run lint

# Production build (Next.js 16 Turbopack standalone)
npm run build
```

---

## Dokumentasi Perencanaan & Arsitektur

Detail perancangan arsitektur, ERD, dan catatan implementasi tersedia di folder `docs/ai-planning/`:

- [01-project-setup.md](docs/ai-planning/01-project-setup.md) — Rencana arsitektur sistem, struktur monorepo, milestones, konfigurasi env, Docker blueprint, dan analisis risiko.
- [02-database-schema-design.md](docs/ai-planning/02-database-schema-design.md) — Desain skema PostgreSQL, ERD, indeks & constraint, strategi reliabilitas scheduler, evaluasi Prisma ORM 8, dan catatan implementasi migrasi.

---

## Catatan Keamanan

- File `.env` dan `.env.local` sudah dikecualikan melalui `.gitignore` — jangan pernah meng-commit credential database, `API_KEY`, atau Discord Webhook URL asli ke repository.
- Backend menerapkan **SSRF protection** pada `webhookUrl` (hanya mengizinkan host Discord resmi `discord.com` / `discordapp.com` kecuali `ALLOW_NON_DISCORD_WEBHOOKS=true` untuk mock server lokal) dan selalu mem-mask token webhook pada log maupun API response.
