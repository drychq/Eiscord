#!/usr/bin/env bash
set -euo pipefail
bash scripts/e2e/api.sh
bash scripts/e2e/web.sh
