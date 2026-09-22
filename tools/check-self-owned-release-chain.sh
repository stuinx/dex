#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

fail() {
  printf 'release-chain check failed: %s\n' "$1" >&2
  exit 1
}

hash_matches() {
  local file=$1
  local checksum_file=$2
  local expected actual
  [[ -s "$file" ]] || fail "missing resource: $file"
  [[ -s "$checksum_file" ]] || fail "missing checksum: $checksum_file"
  expected=$(tr -d '[:space:]' < "$checksum_file")
  actual=$(sha256sum "$file" | awk '{print $1}')
  [[ "$expected" = "$actual" ]] || fail "checksum mismatch: $file"
}

for path in client server tools .github resource; do
  [[ -e "$path" ]] || continue
  if grep -RInI --exclude='*.zip' -E 'jacyl4[/]de_GWD|raw[.]githubusercontent[.]com/jacyl4' "$path"; then
    fail "upstream de_GWD source reference found under $path"
  fi
done

grep -Fq 'repoOwner="${DE_GWD_REPO_OWNER:-stuinx}"' client || fail 'client default owner is not stuinx'
grep -Fq 'repoName="${DE_GWD_REPO_NAME:-dex}"' client || fail 'client default repository is not dex'
grep -Fq 'repoOwner="${DE_GWD_REPO_OWNER:-stuinx}"' server || fail 'server default owner is not stuinx'
grep -Fq 'repoName="${DE_GWD_REPO_NAME:-dex}"' server || fail 'server default repository is not dex'

hash_matches de_GWD_amd64.zip de_GWD_amd64.zip.sha256sum
hash_matches de_GWD_arm64.zip de_GWD_arm64.zip.sha256sum
hash_matches resource/client/Archive.zip resource/client/Archive.zip.sha256sum
hash_matches resource/nginx/nginxConf.zip resource/nginx/nginxConf.zip.sha256sum
hash_matches resource/server/sample.zip resource/server/sample.zip.sha256sum
hash_matches resource/doh/doh_s_amd64 resource/doh/doh_s_amd64.sha256sum
hash_matches resource/doh/doh_s_arm64 resource/doh/doh_s_arm64.sha256sum
hash_matches resource/nginx/nginx_amd64 resource/nginx/nginx_amd64.sha256sum
hash_matches resource/nginx/nginx_arm64 resource/nginx/nginx_arm64.sha256sum

for archive in de_GWD_amd64.zip de_GWD_arm64.zip resource/client/Archive.zip resource/nginx/nginxConf.zip resource/server/sample.zip; do
  unzip -tq "$archive" >/dev/null || fail "invalid ZIP: $archive"
done

cmp <(unzip -p resource/client/Archive.zip resource/client/ui-script/ui-installDocker) \
  resource/client/ui-script/ui-installDocker || fail 'Archive.zip is not synchronized with ui-installDocker'

[[ -s version.php ]] || fail 'missing version.php'
command -v jq >/dev/null 2>&1 || fail 'jq is required to validate the component manifest'
jq -e '.schema == 1 and (.components | type == "object")' tools/component-versions.json >/dev/null \
  || fail 'invalid component manifest'

printf 'release-chain check passed: dex-owned sources, resources, checksums, and archives are valid\n'
