#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/.." && pwd)
manifest=${DE_GWD_COMPONENT_MANIFEST:-$repo_root/tools/component-versions.json}
output_dir=${1:-$repo_root/build/de_GWD-components}
download_base=${DE_GWD_GH_DOWNLOAD_BASE:-}
[[ $output_dir = /* ]] || output_dir="$repo_root/$output_dir"

for command_name in curl jq sha256sum tar unzip zip; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "missing required command: $command_name" >&2
    exit 1
  }
done

[[ -s "$manifest" ]] || { echo "manifest not found: $manifest" >&2; exit 1; }
jq -e '.schema == 1 and (.components | type == "object")' "$manifest" >/dev/null || {
  echo "invalid component manifest: $manifest" >&2
  exit 1
}

mkdir -p "$output_dir"
rm -f "$output_dir"/de_GWD_amd64.zip \
  "$output_dir"/de_GWD_arm64.zip \
  "$output_dir"/de_GWD_components.sha256sum \
  "$output_dir"/component-sources.tsv \
  "$output_dir"/component-versions.json

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
api_cache="$work_dir/api"
mkdir -p "$api_cache"

curl_args=(--fail --location --silent --show-error --retry 3 --connect-timeout 15 --max-time 180)
if [[ -n ${GITHUB_TOKEN:-} ]]; then
  curl_args+=(--header "Authorization: Bearer $GITHUB_TOKEN")
fi
curl_args+=(--header 'Accept: application/vnd.github+json')

release_metadata() {
  local repo=$1
  local tag=$2
  local cache_key
  cache_key=$(printf '%s@%s' "$repo" "$tag" | tr '/@' '__')
  local metadata="$api_cache/$cache_key.json"
  if [[ ! -s "$metadata" ]]; then
    curl "${curl_args[@]}" "https://api.github.com/repos/$repo/releases/tags/$tag" -o "$metadata"
  fi
  printf '%s\n' "$metadata"
}

download_url() {
  local url=$1
  if [[ -n "$download_base" ]]; then
    printf '%s/%s\n' "${download_base%/}" "${url#https://github.com/}"
  else
    printf '%s\n' "$url"
  fi
}

build_arch() {
  local architecture=$1
  local stage="$work_dir/$architecture/stage"
  local downloads="$work_dir/$architecture/downloads"
  mkdir -p "$stage" "$downloads"

  while IFS= read -r component; do
    local repo tag archive_type asset member expected metadata api_digest url source_file extract_dir member_path actual
    repo=$(jq -r --arg component "$component" '.components[$component].repo' "$manifest")
    tag=$(jq -r --arg component "$component" '.components[$component].tag' "$manifest")
    archive_type=$(jq -r --arg component "$component" '.components[$component].archive_type' "$manifest")
    asset=$(jq -r --arg component "$component" --arg architecture "$architecture" '.components[$component][$architecture].asset' "$manifest")
    member=$(jq -r --arg component "$component" --arg architecture "$architecture" '.components[$component][$architecture].member' "$manifest")
    expected=$(jq -r --arg component "$component" --arg architecture "$architecture" '.components[$component][$architecture].sha256' "$manifest")
    [[ -n "$repo" && -n "$tag" && -n "$asset" && "$expected" != "null" ]] || {
      echo "incomplete manifest entry: $component/$architecture" >&2
      exit 1
    }

    metadata=$(release_metadata "$repo" "$tag")
    api_digest=$(jq -r --arg asset "$asset" '.assets[] | select(.name == $asset) | .digest // empty' "$metadata")
    api_digest=${api_digest#sha256:}
    [[ -n "$api_digest" ]] || { echo "GitHub asset digest missing: $repo $tag $asset" >&2; exit 1; }
    [[ "$api_digest" == "$expected" ]] || {
      echo "manifest digest mismatch: $repo $tag $asset" >&2
      echo "manifest=$expected api=$api_digest" >&2
      exit 1
    }

    url=$(jq -r --arg asset "$asset" '.assets[] | select(.name == $asset) | .browser_download_url // empty' "$metadata")
    [[ -n "$url" ]] || { echo "GitHub asset URL missing: $repo $tag $asset" >&2; exit 1; }
    source_file="$downloads/$asset"
    curl "${curl_args[@]}" -o "$source_file" "$(download_url "$url")"
    actual=$(sha256sum "$source_file" | awk '{print $1}')
    [[ "$actual" == "$expected" ]] || {
      echo "download digest mismatch: $repo $tag $asset" >&2
      exit 1
    }

    case "$archive_type" in
      raw)
        cp "$source_file" "$stage/$component"
        ;;
      zip)
        extract_dir="$downloads/$component-extract"
        mkdir -p "$extract_dir"
        unzip -q "$source_file" -d "$extract_dir"
        member_path=$(find "$extract_dir" -type f -name "$member" -print -quit)
        [[ -n "$member_path" ]] || { echo "archive member missing: $asset/$member" >&2; exit 1; }
        cp "$member_path" "$stage/$component"
        ;;
      tar.gz)
        extract_dir="$downloads/$component-extract"
        mkdir -p "$extract_dir"
        tar -xzf "$source_file" -C "$extract_dir"
        member_path=$(find "$extract_dir" -type f -name "$member" -print -quit)
        [[ -n "$member_path" ]] || { echo "archive member missing: $asset/$member" >&2; exit 1; }
        cp "$member_path" "$stage/$component"
        ;;
      *)
        echo "unsupported archive type: $archive_type" >&2
        exit 1
        ;;
    esac

    [[ -s "$stage/$component" ]] || { echo "empty component: $component/$architecture" >&2; exit 1; }
    touch -t 198001010000 "$stage/$component"
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$architecture" "$component" "$repo" "$tag" "$asset" "$actual" >> "$output_dir/component-sources.tsv"
  done < <(jq -r '.components | keys[]' "$manifest")

  (cd "$stage" && zip -q -X "$output_dir/de_GWD_$architecture.zip" yq coredns smartdns mosdns xray)
  unzip -tq "$output_dir/de_GWD_$architecture.zip" >/dev/null
  sha256sum "$output_dir/de_GWD_$architecture.zip" >> "$output_dir/de_GWD_components.sha256sum"
}

: > "$output_dir/component-sources.tsv"
: > "$output_dir/de_GWD_components.sha256sum"
cp "$manifest" "$output_dir/component-versions.json"
build_arch amd64
build_arch arm64

echo "built candidate component archives in $output_dir"
