#!/bin/sh
set -eu

TOKEN="${1:-}"
if [ -z "${DEPLOY_TOKEN:-}" ] || [ "$TOKEN" != "$DEPLOY_TOKEN" ]; then
  echo "unauthorized"
  exit 1
fi

VERSION="${2:-}"
if ! printf '%s\n' "$VERSION" | grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'; then
  echo "A stable release tag (vMAJOR.MINOR.PATCH) is required"
  exit 1
fi
IMAGE="$(docker compose config --images app)"
IMAGE="${IMAGE%@*}"
case "${IMAGE##*/}" in *:*) IMAGE="${IMAGE%:*}" ;; esac
export APP_IMAGE="$IMAGE:$VERSION"

if [ -n "${REGISTRY_URL:-}" ] && [ -n "${REGISTRY_USER:-}" ] && [ -n "${REGISTRY_PASSWORD:-}" ]; then
  echo "$REGISTRY_PASSWORD" | docker login "$REGISTRY_URL" -u "$REGISTRY_USER" --password-stdin
fi

docker compose pull app
docker compose up -d --no-deps app
