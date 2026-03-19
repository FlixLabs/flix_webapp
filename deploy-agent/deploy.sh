#!/bin/sh
set -eu

TOKEN="${1:-}"
if [ -z "${DEPLOY_TOKEN:-}" ] || [ "$TOKEN" != "$DEPLOY_TOKEN" ]; then
  echo "unauthorized"
  exit 1
fi

if [ -n "${REGISTRY_URL:-}" ] && [ -n "${REGISTRY_USER:-}" ] && [ -n "${REGISTRY_PASSWORD:-}" ]; then
  echo "$REGISTRY_PASSWORD" | docker login "$REGISTRY_URL" -u "$REGISTRY_USER" --password-stdin
fi

docker compose pull app
docker compose up -d --no-deps app
