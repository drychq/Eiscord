param(
    [Parameter(ValueFromRemainingArguments = $true)]
    $Remaining
)

# 运行 Web E2E（Playwright）。前置：docker 服务可用。产出：重建测试库、生成测试音频、写入 seed、启动 API/Web 并跑 Playwright。
$ErrorActionPreference = "Stop"

& "$PSScriptRoot/../deps/build.ps1"
pnpm e2e:audio
& "$PSScriptRoot/../db/test-reset.ps1"
. "$PSScriptRoot/env.test.ps1"

pnpm db:seed
pnpm exec playwright test @Remaining
