# 测试环境变量 — 由 e2e/* 与 db/test-reset 脚本 source。所有变量 export，使其传给子进程。
export DATABASE_URL=postgresql://eiscord:eiscord@localhost:5432/eiscord_test
export REDIS_CONNECT_IN_TEST=true
export REALTIME_SWEEP_IN_TEST=true
export PRESENCE_SWEEP_INTERVAL_MS=100
export PRESENCE_OFFLINE_GRACE_MS=120

# 禁用 HTTP 代理：e2e 内 API/Web 都在 localhost，绕过用户机器上的代理配置（否则 Playwright webServer URL polling 会经过代理超时）
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
