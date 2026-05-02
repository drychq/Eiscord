#!/bin/sh
set -eu

mc alias set local "${S3_ENDPOINT:-http://minio:9000}" "${S3_ACCESS_KEY:-minioadmin}" "${S3_SECRET_KEY:-minioadmin}"
mc mb --ignore-existing "local/${S3_BUCKET:-eiscord-local}"
mc anonymous set none "local/${S3_BUCKET:-eiscord-local}"
