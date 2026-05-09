#!/usr/bin/env bash
set -euo pipefail
bash scripts/deps/build.sh
pnpm --parallel --filter @eiscord/api --filter @eiscord/web dev
