#!/usr/bin/env bash
set -Eeuo pipefail

[[ $# == 1 ]] || { echo 'Usage: image-config-digest.sh IMAGE' >&2; exit 1; }
# Docker's classic store exposes the config digest as .Id; containerd may expose
# a manifest/index digest instead. Both save formats reference the config by its
# content digest. It also covers RootFS diff_ids, not just runtime settings.
if ! manifest=$(docker image save "$1" | tar -xOf - manifest.json); then
  echo 'Cannot read the saved image manifest.' >&2; exit 1;
fi
if ! config=$(printf '%s\n' "$manifest" |
  grep -oE '"Config"[[:space:]]*:[[:space:]]*"[^"]*"' |
  sed -E 's/^[^:]*:[[:space:]]*"([^"]*)"$/\1/'); then
  echo 'Missing saved image configuration.' >&2; exit 1;
fi
# Fail closed for missing, unknown or multiple configs: this release builds one
# platform per tag. Do not pick an arbitrary platform from a multi-platform tag.
if [[ "$config" =~ ^([a-f0-9]{64})\.json$ || "$config" =~ ^blobs/sha256/([a-f0-9]{64})$ ]]; then
  printf 'sha256:%s\n' "${BASH_REMATCH[1]}"
else
  echo 'Expected exactly one content-addressed image configuration.' >&2; exit 1;
fi
