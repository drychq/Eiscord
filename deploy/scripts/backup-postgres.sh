#!/bin/sh
set -eu

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-backups/postgres}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

mkdir -p "$BACKUP_DIR"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "$BACKUP_DIR/eiscord-postgres-$STAMP.sql.gz"

printf 'Wrote %s\n' "$BACKUP_DIR/eiscord-postgres-$STAMP.sql.gz"
