#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
test_root=$(mktemp -d "${TMPDIR:-/tmp}/dex-client-doh2-test.XXXXXX")
trap 'rm -rf -- "$test_root"' EXIT

data_dir="$test_root/opt/de_GWD"
mkdir -p "$data_dir/coredns" "$data_dir/nftables" "$data_dir/smartdns" "$test_root/bin"
printf '\n' >"$data_dir/coredns/corefile"
jq -n '{dns:{doh:["","https://doh2.example/dns-query"],dog:"",china:"114.114.114.114",doh1re:"",doh2re:""}}' >"$data_dir/0conf"

printf '%s\n' '#!/bin/sh' 'case "$*" in' '*doh2.example*) printf "%s\\n" 203.0.113.53 ;;' '*) exit 0 ;;' 'esac' >"$test_root/bin/dig"
chmod +x "$test_root/bin/dig"
ln -s /usr/bin/true "$test_root/bin/nft"
ln -s /usr/bin/true "$test_root/bin/systemctl"

smartdns_script="$test_root/ui-smartDNS"
sed "s|/opt/de_GWD|$data_dir|g" "$repo_dir/resource/client/ui-script/ui-smartDNS" >"$smartdns_script"
PATH="$test_root/bin:$PATH" bash "$smartdns_script" >/dev/null 2>&1

grep -Fq 'server-https https://203.0.113.53:443/dns-query -host-name doh2.example' "$data_dir/smartdns/smartdns.conf" || {
  printf 'FAIL: DoH2 URL was not normalized to a valid SmartDNS upstream\n' >&2
  exit 1
}

printf 'PASS: DoH2 URL is normalized for SmartDNS\n'
