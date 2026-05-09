#!/usr/bin/env bash
set -euo pipefail
[ -f .env ] || cp .env.example .env
pnpm db:generate
pnpm exec prisma migrate deploy --schema=prisma/schema.prisma
