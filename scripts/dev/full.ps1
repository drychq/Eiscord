# 并行启动 API + Web 开发服务。前置：docker 服务可用、迁移已应用（通常先跑 pnpm setup）。产出：API:3000、Web:5173。
$ErrorActionPreference = "Stop"

& "$PSScriptRoot/../deps/build.ps1"
pnpm --parallel --filter @eiscord/api --filter @eiscord/web dev
