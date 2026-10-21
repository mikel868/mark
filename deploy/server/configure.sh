#!/usr/bin/env bash
set +x
set -Eeuo pipefail

release_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
[[ $(basename "$(dirname "$release_dir")") == releases ]] || { echo 'Invalid release directory.' >&2; exit 1; }
root=$(cd "$release_dir/../.." && pwd -P)
revision=$(cat "$release_dir/revision")
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid revision.' >&2; exit 1; }
[[ ! -e "$root/backend.env" ]] || {
  echo 'backend.env already exists. It will not be overwritten.' >&2; exit 1;
}
[[ -t 0 ]] || { echo 'Run interactively in your server terminal.' >&2; exit 1; }
image="mark-backend:$revision"
docker image inspect "$image" >/dev/null
umask 077
temporary=''
trap 'unset database_password admin_password reader_password admin_hash reader_hash; if [[ -n "$temporary" && -f "$temporary" ]]; then rm -- "$temporary"; fi' EXIT

read_secret() {
  local prompt="$1" variable="$2"
  IFS= read -r -s -p "$prompt" "$variable"
  printf '\n'
  [[ -n "${!variable}" ]] || { echo 'A password cannot be empty.' >&2; exit 1; }
}
read_secret 'Existing mark database password: ' database_password
read_secret 'New admin login password: ' admin_password
read_secret 'Repeat admin login password: ' confirmation
[[ "$admin_password" == "$confirmation" ]] || { echo 'Passwords differ.' >&2; exit 1; }
unset confirmation
read_secret 'New read-only user login password: ' reader_password
read_secret 'Repeat read-only password: ' confirmation
[[ "$reader_password" == "$confirmation" ]] || { echo 'Passwords differ.' >&2; exit 1; }
unset confirmation

hash_password() {
  printf '%s\n' "$1" | docker run --rm -i --network none --memory=192m \
    --entrypoint java "$image" -XX:MaxRAMPercentage=60 \
    -Dloader.main=com.mark.appeal.auth.UserMaintenanceCommand \
    -cp /app/app.jar org.springframework.boot.loader.launch.PropertiesLauncher hash
}
admin_hash=$(hash_password "$admin_password")
reader_hash=$(hash_password "$reader_password")
for hash in "$admin_hash" "$reader_hash"; do
  [[ "$hash" =~ ^\{bcrypt\}\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$ ]] || {
    echo 'Password hash generation failed; configuration was not saved.' >&2; exit 1;
  }
done
# Raw Compose env_file preserves literal '$', quotes and backslashes in these values.
temporary=$(mktemp "$root/.backend.env.XXXXXX")
printf 'DB_PASSWORD=%s\nINITIAL_ADMIN_USERNAME=admin\nINITIAL_ADMIN_PASSWORD_HASH=%s\nINITIAL_READONLY_USERNAME=user\nINITIAL_READONLY_PASSWORD_HASH=%s\nSECURE_COOKIE=false\n' \
  "$database_password" "$admin_hash" "$reader_hash" > "$temporary"
ln -- "$temporary" "$root/backend.env"
rm -- "$temporary"
temporary=''
echo 'Private configuration saved to backend.env (mode 600). No database was changed.'
echo 'Initial login usernames: admin and user. Passwords apply only when Flyway first creates users.'
echo 'This initial setup uses HTTP. Add trusted HTTPS and set SECURE_COOKIE=true before sensitive public use.'
