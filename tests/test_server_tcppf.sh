#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
test_root=$(mktemp -d "${TMPDIR:-/tmp}/dex-tcppf-test.XXXXXX")
trap 'rm -rf -- "$test_root"' EXIT

data_dir="$test_root/opt/de_GWD"
nginx_dir="$test_root/etc/nginx/conf.d"
haproxy_dir="$test_root/etc/haproxy"
bin_dir="$test_root/bin"
mkdir -p "$data_dir" "$nginx_dir" "$haproxy_dir" "$bin_dir"

cat >"$bin_dir/haproxy" <<'EOF'
#!/bin/sh
if [ "${FAKE_HAPROXY_FAIL:-0}" = 1 ]; then
  exit 1
fi
exit 0
EOF
chmod +x "$bin_dir/haproxy"

cat >"$nginx_dir/default.conf" <<'EOF'
server_name node.example;
listen 443 default ssl;
EOF

export DE_GWD_TEST_MODE=1
export DE_GWD_DATA_DIR="$data_dir"
export DE_GWD_TCPPF_SETTINGS="$data_dir/tcppf.json"
export DE_GWD_HAPROXY_CONFIG="$haproxy_dir/haproxy.cfg"
export DE_GWD_HAPROXY_SERVICE="$test_root/etc/systemd/system/haproxy.service"
export DE_GWD_HAPROXY_BIN="$bin_dir/haproxy"
export DE_GWD_NGINX_CONF_DIR="$nginx_dir"
export PATH="$bin_dir:$PATH"
export TERM=xterm

set +e
# shellcheck disable=SC1091
source "$repo_dir/server" >/dev/null 2>&1
set -e
type tcppf_add >/dev/null 2>&1 || fail "server did not define tcppf_add (source failed)"

fail(){
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_contains(){
  grep -F -- "$1" "$2" >/dev/null 2>&1 || fail "$3"
}

assert_not_contains(){
  if grep -F -- "$1" "$2" >/dev/null 2>&1; then
    fail "$3"
  fi
}

printf '%s\n' '{"rules":[]}' >"$DE_GWD_TCPPF_SETTINGS"
printf '%s\n' 'upstream-one.example:8443' '20001' | tcppf_add >/dev/null
printf '%s\n' 'upstream-two.example:9443' '20002' | tcppf_add >/dev/null

[[ $(jq '.rules | length' "$DE_GWD_TCPPF_SETTINGS") = 2 ]] || fail "two TCP forwarding rules were not persisted"
assert_contains 'frontend p20001' "$DE_GWD_HAPROXY_CONFIG" "first frontend was not rendered"
assert_contains 'server endpoint upstream-one.example:8443' "$DE_GWD_HAPROXY_CONFIG" "first upstream was not rendered"
assert_contains 'frontend p20002' "$DE_GWD_HAPROXY_CONFIG" "second frontend was not rendered"
assert_contains 'server endpoint upstream-two.example:9443' "$DE_GWD_HAPROXY_CONFIG" "second upstream was not rendered"
assert_contains 'mode                  tcp' "$DE_GWD_HAPROXY_CONFIG" "HAProxy was not forced to mode tcp"

cat >"$DE_GWD_HAPROXY_CONFIG" <<'EOF'
frontend relay0
  bind :20960
  default_backend relay0
backend relay0
  server endpoint hnn.example:32096 check resolvers local init-addr none
EOF
tcppf_load
if tcppf_runtime_matches; then
  fail "stale HAProxy config was treated as in sync with tcppf.json"
fi
tcppf_sync_runtime >/dev/null
assert_contains 'frontend p20001' "$DE_GWD_HAPROXY_CONFIG" "sync did not restore json frontends"
assert_contains 'frontend p20002' "$DE_GWD_HAPROXY_CONFIG" "sync did not restore second frontend"
assert_not_contains 'frontend relay0' "$DE_GWD_HAPROXY_CONFIG" "sync left legacy frontend"

if printf '%s\n' 'duplicate.example:443' '20002' | tcppf_add >/dev/null 2>&1; then
  fail "duplicate local port was accepted"
fi
[[ $(jq '.rules | length' "$DE_GWD_TCPPF_SETTINGS") = 2 ]] || fail "duplicate rejection changed settings"

if printf '%s\n' 'nginx-conflict.example:443' '443' | tcppf_add >/dev/null 2>&1; then
  fail "nginx listen port was accepted as a forward port"
fi

printf '%s\n' '20001' | tcppf_del >/dev/null
[[ $(jq '.rules | length' "$DE_GWD_TCPPF_SETTINGS") = 1 ]] || fail "single-rule deletion removed the wrong number of rules"
assert_not_contains 'frontend p20001' "$DE_GWD_HAPROXY_CONFIG" "deleted frontend remained in HAProxy config"
assert_contains 'frontend p20002' "$DE_GWD_HAPROXY_CONFIG" "remaining frontend was removed"

tcppf_del_all >/dev/null
[[ $(jq '.rules | length' "$DE_GWD_TCPPF_SETTINGS") = 0 ]] || fail "delete-all did not clear persisted rules"
[[ ! -e $DE_GWD_HAPROXY_CONFIG ]] || fail "delete-all did not remove the HAProxy config"

rm -f -- "$DE_GWD_TCPPF_SETTINGS"
cat >"$DE_GWD_HAPROXY_CONFIG" <<'EOF'
frontend legacy-name
  bind :21001
  default_backend legacy-name

backend legacy-name
  server endpoint [2001:db8::1]:10443 check resolvers local init-addr none
EOF
tcppf_load
[[ $(jq '.rules | length' "$DE_GWD_TCPPF_SETTINGS") = 1 ]] || fail "legacy HAProxy rule was not imported"
jq -e '.rules[0].localPort == 21001 and .rules[0].upstream == "[2001:db8::1]:10443"' "$DE_GWD_TCPPF_SETTINGS" >/dev/null || fail "legacy HAProxy rule was imported incorrectly"

tcppf_apply_runtime
cp "$DE_GWD_TCPPF_SETTINGS" "$test_root/settings.before"
cp "$DE_GWD_HAPROXY_CONFIG" "$test_root/config.before"
candidate="$test_root/candidate.json"
jq '.rules += [{localPort:21002,upstream:"rollback.example:443"}]' "$DE_GWD_TCPPF_SETTINGS" >"$candidate"
export FAKE_HAPROXY_FAIL=1
if tcppf_apply_transaction "$candidate" >/dev/null 2>&1; then
  fail "invalid HAProxy validation was reported as success"
fi
unset FAKE_HAPROXY_FAIL
cmp -s "$test_root/settings.before" "$DE_GWD_TCPPF_SETTINGS" || fail "failed apply did not restore JSON state"
cmp -s "$test_root/config.before" "$DE_GWD_HAPROXY_CONFIG" || fail "failed apply did not restore HAProxy config"

parsed=$(parseDomainPort 'hk.abc.com:2096') || fail "host:port parse failed"
[[ $parsed = "hk.abc.com 2096" ]] || fail "host:port parse mismatch"
parsed=$(parseDomainPort '[2001:db8::1]:443') || fail "ipv6 parse failed"
[[ $parsed = "2001:db8::1 443" ]] || fail "ipv6 parse mismatch"
[[ $(formatDomainPort '2001:db8::1' '443') = '[2001:db8::1]:443' ]] || fail "ipv6 format mismatch"

printf '%s\n' 'PASS: server menu 44 supports multiple persistent TCP forwarding rules'
