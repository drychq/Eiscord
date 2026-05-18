#!/usr/bin/env bash
# 一键初始化本地开发环境。前置：Docker 可用。产出：.env、docker 依赖、Prisma Client、迁移、演示数据。
set -euo pipefail

[ -f .env ] || cp .env.example .env

docker compose up -d postgres redis minio minio-init

echo "等待 PostgreSQL 就绪..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U eiscord -d eiscord >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [ "$i" = "30" ]; then
    echo "PostgreSQL 在 30 秒内未就绪，请检查 docker compose logs postgres" >&2
    exit 1
  fi
done

pnpm db:generate
pnpm exec prisma migrate deploy --schema=prisma/schema.prisma
pnpm db:seed

echo "✓ 环境初始化完成。下一步：pnpm dev"
