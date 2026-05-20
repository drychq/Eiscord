$env:DATABASE_URL                = "postgresql://eiscord:eiscord@localhost:5432/eiscord_test"
$env:REDIS_CONNECT_IN_TEST       = "true"
$env:REALTIME_SWEEP_IN_TEST      = "true"
$env:PRESENCE_SWEEP_INTERVAL_MS  = "100"
$env:PRESENCE_OFFLINE_GRACE_MS   = "120"

# 禁用 HTTP 代理：e2e 内 API/Web 都在 localhost，绕过用户机器上的代理配置（否则 Playwright webServer URL polling 会经过代理超时）
Remove-Item Env:HTTP_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:ALL_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:http_proxy -ErrorAction SilentlyContinue
Remove-Item Env:https_proxy -ErrorAction SilentlyContinue
Remove-Item Env:all_proxy -ErrorAction SilentlyContinue

