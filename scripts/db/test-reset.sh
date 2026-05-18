#!/usr/bin/env bash
# 重建 eiscord_test 测试库（drop → create → migrate，不 seed）。前置：docker postgres 可启动。产出：测试库就绪，DATABASE_URL 等测试环境变量在调用方 shell 中被 export。
set -euo pipefail
docker compose up -d postgres redis minio minio-init
docker compose exec -T postgres sh -lc 'dropdb -U eiscord --if-exists eiscord_test && createdb -U eiscord eiscord_test'
source scripts/e2e/env.test.sh
pnpm db:generate
pnpm exec prisma migrate deploy --schema=prisma/schema.prisma
