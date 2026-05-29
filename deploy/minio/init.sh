#!/bin/sh
set -eu

: "${S3_BUCKET:?S3_BUCKET is required}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY is required}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY is required}"
: "${PUBLIC_WEB_ORIGIN:?PUBLIC_WEB_ORIGIN is required}"

mc alias set local "${S3_INTERNAL_ENDPOINT:-http://minio:9000}" "$S3_ACCESS_KEY" "$S3_SECRET_KEY"
mc mb --ignore-existing "local/$S3_BUCKET"
mc anonymous set none "local/$S3_BUCKET"

cat > /tmp/eiscord-cors.json <<EOF
[
  {
    "AllowedOrigins": ["$PUBLIC_WEB_ORIGIN"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
    "MaxAgeSeconds": 3000
  }
]
EOF

mc cors set "local/$S3_BUCKET" /tmp/eiscord-cors.json
