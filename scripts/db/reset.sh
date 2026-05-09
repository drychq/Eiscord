#!/usr/bin/env bash
set -euo pipefail
docker compose up -d postgres
docker compose exec -T postgres sh -lc 'dropdb -U eiscord --if-exists eiscord && createdb -U eiscord eiscord'
pnpm db:migrate
pnpm db:seed
