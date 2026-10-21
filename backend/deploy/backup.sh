#!/bin/sh
set -eu
# Run from the project root; output contains secrets. Use restrictive permissions and off-host copies.
umask 077
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
tmp="backups/appeal-$stamp.dump.partial"
trap 'rm -f -- "$tmp"' EXIT HUP INT TERM
docker compose exec -T postgres pg_dump -U appeal -d appeal -Fc > "$tmp"
mv "$tmp" "backups/appeal-$stamp.dump"
printf 'Backup completed: %s\n' "backups/appeal-$stamp.dump"
