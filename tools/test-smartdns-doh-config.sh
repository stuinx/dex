#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
test_root=$(mktemp -d "${TMPDIR:-/tmp}/dex-smartdns-doh-test.XXXXXX")
trap 'rm -rf -- "$test_root"' EXIT

export SMARTDNS_CONF="$test_root/smartdns.conf"
export doh1Domain='resolver.sam.example'
export doh1Str='192.0.2.10:8443/dns-query'
export doh2Domain='resolver.sgn.example'
export doh2Str='198.51.100.20/doh-query'

extract_client_config(){
  awk '
    $0 == "cat << EOF >>/opt/de_GWD/smartdns/smartdns.conf" {
      inside = 1
      body = ""
      first = ""
      next
    }
    inside && $0 == "EOF" {
      if (first ~ /^server-https /) {
        printf "cat << EOF >>\"$SMARTDNS_CONF\"\n%sEOF\n", body
        blocks++
      }
      inside = 0
      next
    }
    inside {
      if (first == "") first = $0
      body = body $0 "\n"
    }
    END { if (inside || blocks != 2) exit 1 }
  ' "$repo_root/client" >"$test_root/client-generator.sh"
  /bin/bash "$test_root/client-generator.sh"
}

extract_ui_config(){
  awk '
    index($0, "echo \"server-https https://") == 1 {
      line = $0
      sub(/ >>\/opt\/de_GWD\/smartdns\/smartdns.conf$/, " >>\"$SMARTDNS_CONF\"", line)
      print line
      lines++
    }
    END { if (lines != 2) exit 1 }
  ' "$repo_root/resource/client/ui-script/ui-smartDNS" >"$test_root/ui-generator.sh"
  /bin/bash "$test_root/ui-generator.sh"
}

check_config(){
  local source=$1
  local expected=$2
  local actual=$3
  : >"$SMARTDNS_CONF"
  "$source"
  printf '%s\n' "$expected" >"$test_root/expected.conf"
  if ! diff -u "$test_root/expected.conf" "$SMARTDNS_CONF"; then
    printf 'FAIL: %s generated unexpected SmartDNS config\n' "$source" >&2
    return 1
  fi
  printf 'PASS: %s keeps fixed IP/port/PATH and validates configured hostname\n' "$source"
}

client_expected=$(printf '%s\n' \
  'server-https https://192.0.2.10:8443/dns-query -host-name resolver.sam.example -http-host resolver.sam.example -tls-host-verify resolver.sam.example -group DNS_global' \
  'server-https https://198.51.100.20/doh-query -host-name resolver.sgn.example -http-host resolver.sgn.example -tls-host-verify resolver.sgn.example -group DNS_global')
ui_expected=$(printf '%s\n' \
  'server-https https://192.0.2.10:8443/dns-query -host-name resolver.sam.example -http-host resolver.sam.example -tls-host-verify resolver.sam.example -group DNS_global -exclude-default-group' \
  'server-https https://198.51.100.20/doh-query -host-name resolver.sgn.example -http-host resolver.sgn.example -tls-host-verify resolver.sgn.example -group DNS_global -exclude-default-group')

check_config extract_client_config "$client_expected" client
check_config extract_ui_config "$ui_expected" ui-smartDNS
