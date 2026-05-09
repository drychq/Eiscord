#!/usr/bin/env bash
set -euo pipefail
pnpm --filter @eiscord/shared build
pnpm --filter @eiscord/media build
