#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
test_root=$(mktemp -d "${TMPDIR:-/tmp}/dex-rproxys-save-test.XXXXXX")
trap 'rm -rf -- "$test_root"' EXIT

data_dir="$test_root/opt/de_GWD"
mkdir -p "$data_dir/vtrui" "$data_dir/RproxyS" "$test_root/etc/systemd/system" "$test_root/var/www/ssl" "$test_root/bin"
cp -f -- /usr/bin/true "$data_dir/vtrui/vtrui"

cat >"$test_root/bin/systemctl" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x "$test_root/bin/systemctl"

save_script="$test_root/rproxyS-save"
sed -e "s|/opt/de_GWD|$data_dir|g" \
    -e "s|/etc/systemd/system|$test_root/etc/systemd/system|g" \
    -e "s|/var/www/ssl|$test_root/var/www/ssl|g" \
    "$repo_dir/resource/server/rproxyS-save" >"$save_script"
client_save_script="$test_root/ui-RproxySsave"
sed -e "s|/opt/de_GWD|$data_dir|g" \
    -e "s|/etc/systemd/system|$test_root/etc/systemd/system|g" \
    -e "s|/var/www/ssl|$test_root/var/www/ssl|g" \
    "$repo_dir/resource/client/ui-script/ui-RproxySsave" >"$client_save_script"

jq -n '{FORWARD:{Rproxy:{server:{inStatus:"off",mappingStatus:"on",tunnel:{port:20000,uuid:"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"},inUUID:[],mapping:[{port:20001,protocol:"sctp"}]}}}}' >"$data_dir/0conf"
printf '%s\n' 'old-config' >"$data_dir/RproxyS/config.json"
cp -p -- "$data_dir/RproxyS/config.json" "$test_root/config.before"

if PATH="$test_root/bin:$PATH" bash "$save_script" >/dev/null 2>&1; then
  printf 'FAIL: unsupported mapping protocol was accepted\n' >&2
  exit 1
fi
cmp -s "$test_root/config.before" "$data_dir/RproxyS/config.json" || {
  printf 'FAIL: invalid mapping replaced existing RproxyS config\n' >&2
  exit 1
}
[[ ! -e $data_dir/RproxyS/RproxyS ]] || {
  printf 'FAIL: invalid mapping installed the RproxyS binary\n' >&2
  exit 1
}

jq '.FORWARD.Rproxy.server.mapping[0].protocol="tcp+udp"' "$data_dir/0conf" >"$test_root/0conf.valid"
mv -f -- "$test_root/0conf.valid" "$data_dir/0conf"
PATH="$test_root/bin:$PATH" bash "$save_script" >/dev/null

mode=$(stat -c '%a' "$data_dir/RproxyS/config.json" 2>/dev/null || stat -f '%Lp' "$data_dir/RproxyS/config.json")
[[ $mode = 600 ]] || {
  printf 'FAIL: RproxyS config mode was %s, expected 600\n' "$mode" >&2
  exit 1
}
jq -e '.inbounds[0].port == 20000 and .inbounds[0].settings.clients[0].id == "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" and .inbounds[1].settings.network == "tcp,udp"' \
  "$data_dir/RproxyS/config.json" >/dev/null || {
  printf 'FAIL: valid RproxyS config schema mismatch\n' >&2
  exit 1
}

jq '.FORWARD.Rproxy.server.mapping[0].protocol="sctp"' "$data_dir/0conf" >"$test_root/0conf.invalid-client"
mv -f -- "$test_root/0conf.invalid-client" "$data_dir/0conf"
cp -f -- "$data_dir/RproxyS/config.json" "$test_root/client-config.before"
if PATH="$test_root/bin:$PATH" bash "$client_save_script" >/dev/null 2>&1; then
  printf 'FAIL: client accepted unsupported mapping protocol\n' >&2
  exit 1
fi
cmp -s "$test_root/client-config.before" "$data_dir/RproxyS/config.json" || {
  printf 'FAIL: client invalid mapping replaced RproxyS config\n' >&2
  exit 1
}

jq '.FORWARD.Rproxy.server.mapping[0].protocol="udp"' "$data_dir/0conf" >"$test_root/0conf.client-valid"
mv -f -- "$test_root/0conf.client-valid" "$data_dir/0conf"
PATH="$test_root/bin:$PATH" bash "$client_save_script" >/dev/null
jq -e '.inbounds[1].settings.network == "udp"' "$data_dir/RproxyS/config.json" >/dev/null || {
  jq . "$data_dir/RproxyS/config.json" >&2
  printf 'FAIL: client valid RproxyS config schema mismatch\n' >&2
  exit 1
}

printf 'PASS: server and client RproxyS save validate before replacing config\n'
