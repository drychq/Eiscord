# 运行语音频道 E2E（Playwright voice-media.spec.ts）。前置：同 e2e/web。产出：仅执行该一个 spec。
$ErrorActionPreference = "Stop"

& "$PSScriptRoot/web.ps1" tests/e2e/voice-media.spec.ts
