#!/bin/sh
set -eu

id="${CI_JOB_ID:-local-$$}"
image="flix-webapp-e2e:$id"
container="flix-webapp-e2e-$id"
scope=full
changed_files=''
if [ "${CI_PIPELINE_SOURCE:-}" = merge_request_event ]; then
  base="${CI_MERGE_REQUEST_DIFF_BASE_SHA:-}"
  if [ -n "$base" ] && git cat-file -e "$base^{commit}" 2>/dev/null &&
     changed_files=$(git -c core.quotePath=false diff --no-renames --name-only "$base" HEAD); then
    scope=changed
  else
    echo "MR diff unavailable; running the full E2E suite rather than skipping coverage."
  fi
fi

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  if docker container inspect "$container" >/dev/null 2>&1; then
    mkdir -p playwright-report test-results
    copy_status=0
    docker cp "$container:/app/playwright-report/." playwright-report/ || copy_status=1
    docker cp "$container:/app/test-results/." test-results/ || copy_status=1
    if [ "$status" -eq 0 ]; then status=$copy_status; fi
  fi
  docker rm -f "$container" >/dev/null 2>&1 || :
  docker image rm "$image" >/dev/null 2>&1 || :
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM

playwright_version=$(awk '/^playwright@/ { found=1; next } found && /^  version / { gsub(/"/, "", $2); print $2; exit }' yarn.lock)
if ! printf '%s\n' "$playwright_version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Cannot resolve a stable Playwright version from yarn.lock."
  exit 1
fi
docker build -f Dockerfile.e2e --build-arg "PLAYWRIGHT_VERSION=$playwright_version" -t "$image" .
# Only non-secret selection data enters the test container.
docker run --name "$container" --init --shm-size=1g --env CI=true \
  --env "FLIX_E2E_SCOPE=$scope" --env "FLIX_E2E_CHANGED_FILES=$changed_files" "$image"
