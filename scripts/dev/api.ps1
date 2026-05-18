# 启动 API 开发服务（含 mediasoup worker 按需 spawn）。前置：docker 服务可用、迁移已应用。产出：API 在 :3000 监听。
$ErrorActionPreference = "Stop"

& "$PSScriptRoot/../deps/build.ps1"
pnpm --filter @eiscord/api dev
