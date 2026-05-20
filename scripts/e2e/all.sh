#!/usr/bin/env bash
# 运行全部 E2E（API + Web）。前置：docker 服务可用。产出：单次 deps:build/test-reset，依次执行 API E2E 与 Web E2E。
set -euo pipefail
bash scripts/deps/build.sh
pnpm e2e:audio
pnpm --filter @eiscord/api build
bash scripts/db/test-reset.sh
source scripts/e2e/env.test.sh

pnpm --filter @eiscord/api test:e2e

pnpm db:seed
pnpm exec playwright test
