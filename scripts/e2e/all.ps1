# 运行全部 E2E（API + Web）。前置：docker 服务可用。产出：单次 deps:build/test-reset，依次执行 API E2E 与 Web E2E。
$ErrorActionPreference = "Stop"

& "$PSScriptRoot/../deps/build.ps1"
pnpm e2e:audio
& "$PSScriptRoot/../db/test-reset.ps1"
. "$PSScriptRoot/env.test.ps1"

pnpm --filter @eiscord/api test:e2e

pnpm db:seed
pnpm exec playwright test
