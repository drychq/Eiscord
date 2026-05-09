#!/usr/bin/env bash
set -euo pipefail
bash scripts/deps/build.sh
bash scripts/db/test-reset.sh
source scripts/e2e/env.test
env DATABASE_URL="$DATABASE_URL" \
    REDIS_CONNECT_IN_TEST="$REDIS_CONNECT_IN_TEST" \
    REALTIME_SWEEP_IN_TEST="$REALTIME_SWEEP_IN_TEST" \
    PRESENCE_SWEEP_INTERVAL_MS="$PRESENCE_SWEEP_INTERVAL_MS" \
    PRESENCE_OFFLINE_GRACE_MS="$PRESENCE_OFFLINE_GRACE_MS" \
    pnpm --filter @eiscord/api test:e2e
