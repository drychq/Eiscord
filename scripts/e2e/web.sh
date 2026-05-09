#!/usr/bin/env bash
set -euo pipefail
bash scripts/deps/build.sh
pnpm e2e:audio
bash scripts/db/test-reset.sh
source scripts/e2e/env.test
export DATABASE_URL
pnpm db:seed
pnpm exec playwright test "$@"
