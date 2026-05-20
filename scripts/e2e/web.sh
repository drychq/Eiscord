#!/usr/bin/env bash
# 运行 Web E2E（Playwright）。前置：docker 服务可用。产出：重建测试库、生成测试音频、写入 seed、启动 API/Web 并跑 Playwright。
set -euo pipefail
bash scripts/deps/build.sh
pnpm e2e:audio
pnpm --filter @eiscord/api build
bash scripts/db/test-reset.sh
source scripts/e2e/env.test.sh
pnpm db:seed
pnpm exec playwright test "$@"
