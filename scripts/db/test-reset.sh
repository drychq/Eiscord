#!/usr/bin/env bash
set -euo pipefail
docker compose up -d postgres redis minio minio-init
docker compose exec -T postgres sh -lc 'dropdb -U eiscord --if-exists eiscord_test && createdb -U eiscord eiscord_test'
source scripts/e2e/env.test
export DATABASE_URL
pnpm db:generate
pnpm exec prisma migrate deploy --schema=prisma/schema.prisma
