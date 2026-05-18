# 启动 Web 开发服务（Vite）。前置：API 已起或将单独起。产出：Web 在 :5173 监听。
$ErrorActionPreference = "Stop"

& "$PSScriptRoot/../deps/build.ps1"
pnpm --filter @eiscord/web dev
