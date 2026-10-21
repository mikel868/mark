#!/usr/bin/env bash
set -Eeuo pipefail

release_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
[[ $(basename "$(dirname "$release_dir")") == releases ]] || {
  echo 'Run this script inside a prepared releases directory.' >&2; exit 1;
}
root=$(cd "$release_dir/../.." && pwd -P)
revision=$(cat "$release_dir/revision")
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid release revision.' >&2; exit 1; }
export RELEASE_SHA="$revision"

exec 9>"$root/deploy.lock"
flock -w 300 9 || { echo 'Another deployment is running.' >&2; exit 1; }
cd "$release_dir"
for file in compose.yml configure.sh deploy.sh image-config-digest.sh revision backend.id frontend.id SHA256SUMS; do
  [[ -f "$file" ]] || { echo "Missing release file: $file" >&2; exit 1; }
done
sha256sum --check --ignore-missing SHA256SUMS

[[ $(docker inspect --format '{{.State.Running}}' mark-postgres) == true ]] || {
  echo 'Existing mark-postgres must be running; no database will be created.' >&2; exit 1;
}
volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' mark-postgres)
[[ "$volume" == mark-postgres-data ]] || { echo 'Unexpected database data volume.' >&2; exit 1; }
docker network inspect mark-network >/dev/null
docker exec mark-postgres pg_isready -U mark -d mark >/dev/null

if [[ -f images.tar.gz ]]; then
  gzip -dc images.tar.gz | docker load
fi
for service in backend frontend; do
  expected=$(cat "$service.id")
  [[ "$expected" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Invalid image configuration digest.' >&2; exit 1; }
  actual=$(bash "$release_dir/image-config-digest.sh" "mark-$service:$revision")
  [[ "$actual" == "$expected" ]] || { echo "Image configuration digest mismatch: $service" >&2; exit 1; }
done
# The loaded images are retained; remove only this release's transfer archive to save disk space.
if [[ -f images.tar.gz ]]; then rm -- images.tar.gz; fi

printf '%s\n' "$release_dir" > "$root/pending-release"
if [[ ! -f "$root/backend.env" ]]; then
  echo 'Images are prepared. First-time server configuration is required; nothing was started.'
  echo "Run on the server: bash '$release_dir/configure.sh'"
  echo "Then run: bash '$release_dir/deploy.sh'"
  echo 'MARK_DEPLOY_STATUS=needs-configuration'
  exit 0
fi

compose=(docker compose --project-name mark --env-file /dev/null -f "$release_dir/compose.yml")
"${compose[@]}" config --quiet
if ! "${compose[@]}" up -d --no-build --pull never --wait --wait-timeout 240 backend frontend; then
  echo 'Application update failed. Inspect containers on the server; no database rollback was attempted.' >&2
  exit 1
fi
docker exec mark-frontend wget -q -O /dev/null http://127.0.0.1/api/v1/auth/csrf
printf '%s\n' "$release_dir" > "$root/current-release"
rm -- "$root/pending-release"
echo "Application ready at revision $revision"
echo 'MARK_DEPLOY_STATUS=deployed'
