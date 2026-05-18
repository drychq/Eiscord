# 测试环境变量 — 由 e2e/* 与 db/test-reset 脚本 source。所有变量 export，使其传给子进程。
export DATABASE_URL=postgresql://eiscord:eiscord@localhost:5432/eiscord_test
export REDIS_CONNECT_IN_TEST=true
export REALTIME_SWEEP_IN_TEST=true
export PRESENCE_SWEEP_INTERVAL_MS=100
export PRESENCE_OFFLINE_GRACE_MS=120
