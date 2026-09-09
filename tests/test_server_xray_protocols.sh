#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
test_root=$(mktemp -d "${TMPDIR:-/tmp}/dex-xray-extra-test.XXXXXX")
trap 'rm -rf -- "$test_root"' EXIT

data_dir="$test_root/opt/de_GWD"
xray_dir="$test_root/opt/de_GWD/vtrui"
mkdir -p "$data_dir" "$xray_dir"

main_uuid="92b22885-ded4-47cc-a932-583e16b1126a"
main_path="/b1126a"
vless_uuid="aaaaaaaa-bbbb-cccc-dddd-eeeeeeffffff"
vless_path="/$(echo "$vless_uuid" | awk '{print substr($0,length($1)-5)}')"

cat >"$xray_dir/config.json" <<EOF
{
  "log": {"access":"none","error":"none","loglevel":"none"},
  "inbounds":[
    {
      "listen":"127.0.0.1",
      "port": 9890,
      "protocol":"vmess",
      "settings":{
        "clients":[{"id":"$main_uuid","alterId":0}]
      },
      "streamSettings":{
        "network":"ws",
        "security":"none",
        "wsSettings":{"path":"$main_path"}
      }
    }
  ]
}
EOF

export DE_GWD_TEST_MODE=1
export DE_GWD_DATA_DIR="$data_dir"
export DE_GWD_XRAY_DIR="$xray_dir"
export DE_GWD_XRAY_BIN="$xray_dir/vtrui"
export DE_GWD_NGINX_CONF_DIR="$test_root/etc/nginx/conf.d"
export DE_GWD_VLESS_NGINX_CONF="$DE_GWD_NGINX_CONF_DIR/vless-ws.conf"
export DE_GWD_VLESS_NGINX_LOCATION="$DE_GWD_NGINX_CONF_DIR/vless-ws-location.inc"
export TERM=xterm
mkdir -p "$DE_GWD_NGINX_CONF_DIR"
cat >"$DE_GWD_NGINX_CONF_DIR/default.conf" <<'EOF'
server_name node.example;
listen 443 default ssl reuseport;
EOF

set +e
# shellcheck disable=SC1091
source "$repo_dir/server" >/dev/null 2>&1
set -e

fail(){
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

type extraInboundsAppend >/dev/null 2>&1 || fail "server did not define extraInboundsAppend"
type extraVlessWsNginxBlock >/dev/null 2>&1 || fail "server did not define extraVlessWsNginxBlock"
type extraVlessWsNginxConf >/dev/null 2>&1 || fail "server did not define extraVlessWsNginxConf"
type extraVlessWsWriteNginx >/dev/null 2>&1 || fail "server did not define extraVlessWsWriteNginx"
type extraParseInstallAddr >/dev/null 2>&1 || fail "server did not define extraParseInstallAddr"
type extraStatusPrint >/dev/null 2>&1 || fail "server did not define extraStatusPrint"
type extraInboundsStatus >/dev/null 2>&1 || fail "server did not define extraInboundsStatus"
type rproxySstatus >/dev/null 2>&1 || fail "server did not define rproxySstatus"
type changeXrayNode >/dev/null 2>&1 || fail "server did not define changeXrayNode"

parsed=$(extraParseInstallAddr 'node.example:2096') || fail "install-style domain:port parse failed"
[[ $parsed = "node.example 2096" ]] || fail "install-style domain:port mismatch"
parsed=$(extraParseInstallAddr 'node.example') || fail "install-style domain-only parse failed"
[[ $parsed = "node.example 443" ]] || fail "install-style default port is not 443"
if extraParseInstallAddr '' >/dev/null 2>&1; then
  fail "empty domain was accepted"
fi
tcppf_port_available 2096 || fail "new listen port was treated as occupied"
if tcppf_port_available 443 >/dev/null 2>&1; then
  fail "main nginx listen port was accepted"
fi

assert_main_vmess(){
  jq -e --arg uuid "$main_uuid" --arg path "$main_path" '
    .inbounds[0].protocol == "vmess"
    and .inbounds[0].listen == "127.0.0.1"
    and .inbounds[0].port == 9890
    and .inbounds[0].streamSettings.network == "ws"
    and .inbounds[0].streamSettings.security == "none"
    and .inbounds[0].streamSettings.wsSettings.path == $path
    and .inbounds[0].settings.clients[0].id == $uuid
  ' "$xray_dir/config.json" >/dev/null || fail "$1"
}

# VLESS path uses the same last-6-of-UUID formula as installGWD VMess.
[[ $vless_path = "/ffffff" ]] || fail "VLESS path formula diverged from VMess (got $vless_path)"

jq -n --arg uuid "$vless_uuid" --arg path "$vless_path" \
  '{enabled:true,domain:"vless.example",port:2096,uuid:$uuid,path:$path}' >"$data_dir/extra-vlessws.json"
jq -n '{enabled:true,domain:"node.example",port:18443,uuid:"11111111-2222-3333-4444-555555555555",flow:"xtls-rprx-vision",dest:"127.0.0.1:443",serverName:"node.example",privateKey:"priv",publicKey:"pub",shortId:"abcd1234"}' \
  >"$data_dir/extra-reality.json"
jq -n '{enabled:true,domain:"node.example",port:11080,user:"u1",password:"p1"}' >"$data_dir/extra-socks5.json"
jq -n '{enabled:true,rules:[{port:18080,target:"127.0.0.1",targetPort:80,network:"tcp,udp"},{port:18081,target:"10.0.0.1",targetPort:443,network:"tcp"}]}' \
  >"$data_dir/extra-dokodemo.json"

extraInboundsAppend
assert_main_vmess "appending extras changed main VMess inbound[0]"

jq -e '
  [.inbounds[] | select(.tag != null) | .tag] == ["extra-vless-ws","extra-vless-reality","extra-socks5","extra-dokodemo-0","extra-dokodemo-1"]
' "$xray_dir/config.json" >/dev/null || fail "extra inbound tags mismatch"

status=$(extraStatusPrint)
[[ $status == *'VLESS WS TLS'* ]] || fail "enabled VLESS WS was not shown in extra status"
[[ $status == *'VLESS REALITY'* ]] || fail "enabled REALITY was not shown in extra status"
[[ $status == *'SOCKS5'* ]] || fail "enabled SOCKS5 was not shown in extra status"
[[ $status == *'dokodemo-door'* ]] || fail "enabled dokodemo was not shown in extra status"
view=$(extraInboundsStatus)
[[ $view == *'vless.example:2096'* ]] || fail "view menu missing VLESS WS address"
[[ $view == *'node.example:18443'* ]] || fail "view menu missing REALITY address"
[[ $view == *'18080 -> 127.0.0.1:80'* ]] || fail "view menu missing dokodemo rule"
[[ $view == *'Extra inbounds'* ]] || fail "view menu missing Extra inbounds header"
printf '%s\n' '{"tunnelPort":10086,"tunnelUUID":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","clients":[],"mappings":[{"port":10087,"protocol":"tcp"}]}' >"$data_dir/rproxys.json"
rs=$(rproxySstatus)
[[ $rs == *'10086'* ]] || fail "RproxyS status missing tunnel port"
[[ $rs == *'10087'* ]] || fail "RproxyS status missing mapping port"

jq -e --arg uuid "$vless_uuid" --arg path "$vless_path" '
  .inbounds[] | select(.tag=="extra-vless-ws") |
  .protocol=="vless"
  and .listen=="127.0.0.1"
  and .port==9891
  and .streamSettings.network=="ws"
  and .streamSettings.security=="none"
  and .streamSettings.wsSettings.path==$path
  and .settings.clients[0].id==$uuid
  and (.settings.clients[0].flow|not)
' "$xray_dir/config.json" >/dev/null || fail "VLESS WS inbound did not follow VMess (loopback WS, TLS none, path last-6)"

jq -e '
  .inbounds[] | select(.tag=="extra-vless-reality") |
  .protocol=="vless" and .streamSettings.network=="tcp" and .streamSettings.security=="reality"
  and .settings.clients[0].flow=="xtls-rprx-vision"
' "$xray_dir/config.json" >/dev/null || fail "REALITY inbound mismatch"

jq -e '
  .inbounds[] | select(.tag=="extra-socks5") |
  .protocol=="socks" and .settings.auth=="password" and .settings.udp==true
  and .settings.accounts[0].user=="u1"
' "$xray_dir/config.json" >/dev/null || fail "SOCKS5 inbound mismatch"

jq -e '
  [.inbounds[] | select(.protocol=="dokodemo-door") | .port] == [18080,18081]
' "$xray_dir/config.json" >/dev/null || fail "dokodemo multi-rule mismatch"

extraInboundsAppend
[[ $(jq '[.inbounds[] | select((.tag // "") | startswith("extra-"))] | length' "$xray_dir/config.json") = 5 ]] || fail "second append duplicated extra inbounds"
assert_main_vmess "second append changed main VMess inbound[0]"

extraVlessWsWriteNginx
[[ -f $DE_GWD_VLESS_NGINX_CONF ]] || fail "VLESS WS nginx file was not written"
[[ ! -e $DE_GWD_VLESS_NGINX_LOCATION ]] || fail "shared location snippet should not be written"
[[ -z $(extraVlessWsNginxBlock) ]] || fail "VLESS WS was injected into main default.conf"
conf=$(cat "$DE_GWD_VLESS_NGINX_CONF")
[[ $conf == *'upstream vlessws'* ]] || fail "standalone VLESS nginx missing upstream"
[[ $conf == *'127.0.0.1:9891'* ]] || fail "standalone VLESS nginx missing loopback 9891"
[[ $conf == *'listen 2096 ssl'* ]] || fail "standalone VLESS nginx missing listen port"
[[ $conf == *'server_name vless.example;'* ]] || fail "standalone VLESS nginx missing server_name"
[[ $conf == *"location $vless_path"* ]] || fail "standalone VLESS nginx missing WS location"
[[ $conf == *'if ($http_upgrade != "websocket") { return 404; }'* ]] || fail "standalone VLESS nginx did not copy VMess WS 404 guard"
[[ $conf == *'proxy_pass                  http://vlessws;'* ]] || fail "standalone VLESS nginx proxy_pass mismatch"
assert_not_contains(){
  if grep -F -- "$1" "$2" >/dev/null 2>&1; then fail "$3"; fi
}
assert_not_contains 'vless.example' "$DE_GWD_NGINX_CONF_DIR/default.conf" "VLESS domain leaked into main nginx"
assert_not_contains '2096' "$DE_GWD_NGINX_CONF_DIR/default.conf" "VLESS port leaked into main nginx"

jq '{enabled:false}' "$data_dir/extra-vlessws.json" | sponge "$data_dir/extra-vlessws.json"
jq '{enabled:false}' "$data_dir/extra-reality.json" | sponge "$data_dir/extra-reality.json"
jq '{enabled:false}' "$data_dir/extra-socks5.json" | sponge "$data_dir/extra-socks5.json"
jq '{enabled:false,rules:[]}' "$data_dir/extra-dokodemo.json" | sponge "$data_dir/extra-dokodemo.json"
extraInboundsAppend
assert_main_vmess "disabling extras changed main VMess inbound[0]"
[[ $(jq '.inbounds | length' "$xray_dir/config.json") = 1 ]] || fail "disabled extras were not removed"
extraVlessWsWriteNginx
[[ ! -e $DE_GWD_VLESS_NGINX_CONF ]] || fail "disabled VLESS WS left standalone nginx conf"
[[ ! -e $DE_GWD_VLESS_NGINX_LOCATION ]] || fail "disabled VLESS WS left location snippet"
[[ -z $(extraVlessWsNginxBlock) ]] || fail "disabled VLESS WS still emitted nginx include"
[[ -z $(extraStatusPrint) ]] || fail "disabled extras still shown in extra status"

echo OK
