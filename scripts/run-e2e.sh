#!/bin/sh
set -eu

id="${CI_JOB_ID:-local-$$}"
image="flix-webapp-e2e:$id"
container="flix-webapp-e2e-$id"

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

docker build -f Dockerfile.e2e -t "$image" .
# Copy reports back through Docker: runner and daemon may not share host paths.
docker run --name "$container" --init --shm-size=1g --env CI=true "$image"
