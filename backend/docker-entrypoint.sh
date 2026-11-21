#!/bin/sh
set -e

echo "[backend] Applying Prisma ORM 8 migrations..."
./node_modules/.bin/prisma db migrate --db "$DATABASE_URL"

echo "[backend] Starting NestJS application..."
exec node dist/main.js
