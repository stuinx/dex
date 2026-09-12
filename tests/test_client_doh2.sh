#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
test_root=$(mktemp -d "${TMPDIR:-/tmp}/dex-client-doh2-test.XXXXXX")
trap 'rm -rf -- "$test_root"' EXIT

data_dir="$test_root/opt/de_GWD"
mkdir -p "$data_dir/coredns" "$data_dir/nftables" "$data_dir/smartdns" "$test_root/bin"
printf '\n' >"$data_dir/coredns/corefile"
jq -n '{address:{PWD:"preserve-me"},dns:{doh:["https://doh1.example/dns-query","https://doh2.example/dns-query"],dog:"",china:"114.114.114.114",doh1re:"",doh2re:""}}' >"$data_dir/0conf"

printf '%s\n' '#!/bin/sh' 'case "$*" in' '*doh1.example*) printf "%s\\n" 203.0.113.52 ;;' '*doh2.example*) printf "%s\\n" 203.0.113.53 ;;' '*) exit 0 ;;' 'esac' >"$test_root/bin/dig"
chmod +x "$test_root/bin/dig"
printf '%s\n' '#!/bin/sh' 'printf "%s\\n" "$*" >>"$CHOWN_LOG"' >"$test_root/bin/chown"
chmod +x "$test_root/bin/chown"
ln -s /usr/bin/true "$test_root/bin/nft"
ln -s /usr/bin/true "$test_root/bin/systemctl"

smartdns_script="$test_root/ui-smartDNS"
sed "s|/opt/de_GWD|$data_dir|g" "$repo_dir/resource/client/ui-script/ui-smartDNS" >"$smartdns_script"
CHOWN_LOG="$test_root/chown.log" PATH="$test_root/bin:$PATH" bash "$smartdns_script" >/dev/null 2>&1

grep -Fq 'server-https https://203.0.113.53:443/dns-query -host-name doh2.example' "$data_dir/smartdns/smartdns.conf" || {
  printf 'FAIL: DoH2 URL was not normalized to a valid SmartDNS upstream\n' >&2
  exit 1
}

grep -Fq "$data_dir/0conf" "$test_root/chown.log" || {
  printf 'FAIL: DoH-derived 0conf rewrites did not restore group-readable ownership\n' >&2
  exit 1
}

jq -e '.address.PWD == "preserve-me"' "$data_dir/0conf" >/dev/null || {
  printf 'FAIL: DoH-derived 0conf rewrites did not preserve authentication data\n' >&2
  exit 1
}

printf 'PASS: DoH2 URL is normalized and 0conf authentication access is preserved\n'
