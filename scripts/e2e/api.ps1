# 运行 API E2E（Jest + Supertest + Socket.IO）。前置：docker 服务可用。产出：重建测试库、运行 apps/api 的 test:e2e。
$ErrorActionPreference = "Stop"

& "$PSScriptRoot/../deps/build.ps1"
& "$PSScriptRoot/../db/test-reset.ps1"
. "$PSScriptRoot/env.test.ps1"

pnpm --filter @eiscord/api test:e2e
