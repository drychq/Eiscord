#!/usr/bin/env bash
set -euo pipefail
bash scripts/deps/build.sh
pnpm --filter @eiscord/api dev
