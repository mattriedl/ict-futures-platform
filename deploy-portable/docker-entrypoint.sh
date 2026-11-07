#!/bin/sh
# Container entrypoint for the ICT Futures platform.
# 1) Apply Prisma migrations to the target database (idempotent).
# 2) Optionally seed the 37 instruments (15 futures + 22 crypto) when RUN_SEED=true.
# 3) Start the Next.js production server.
set -e

echo "[entrypoint] Applying database migrations (prisma migrate deploy)..."
npx prisma migrate deploy

if [ "${RUN_SEED}" = "true" ]; then
  echo "[entrypoint] RUN_SEED=true -> seeding instruments..."
  npx tsx --require dotenv/config scripts/safe-seed.ts || echo "[entrypoint] WARN: seed step failed (continuing)."
else
  echo "[entrypoint] RUN_SEED not 'true' -> skipping seed."
fi

echo "[entrypoint] Starting Next.js on port ${PORT:-3456}..."
exec node node_modules/.bin/next start --port "${PORT:-3456}"
