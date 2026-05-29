#!/bin/sh
set -eu

ENV_FILE="${ENV_FILE:-.env.production}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

: "${PUBLIC_WEB_ORIGIN:?PUBLIC_WEB_ORIGIN is required}"

curl -fsS "$PUBLIC_WEB_ORIGIN/api/v1/health" >/dev/null
curl -fsSI "$PUBLIC_WEB_ORIGIN" >/dev/null

printf 'Smoke test passed for %s\n' "$PUBLIC_WEB_ORIGIN"
