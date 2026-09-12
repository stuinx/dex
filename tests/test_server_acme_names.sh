#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
export DE_GWD_TEST_MODE=1
export TERM=xterm
set +e
# shellcheck disable=SC1091
source "$repo_dir/server" >/dev/null 2>&1
set -e

fail(){ printf 'FAIL: %s\n' "$1" >&2; exit 1; }
type acmeWildcardNames >/dev/null 2>&1 || fail "acmeWildcardNames missing"

[[ $(acmeWildcardNames 'host.zone.example') = '*.zone.example *.host.zone.example' ]] || fail "3 labels should be *.parent *.host"
[[ $(acmeWildcardNames 'a.b.c.d') = '*.b.c.d *.a.b.c.d' ]] || fail "4 labels should be *.parent *.host"
[[ $(acmeWildcardNames 'example.com') = 'example.com *.example.com' ]] || fail "2 labels should be apex + *.apex"
if acmeWildcardNames '' >/dev/null 2>&1; then fail "empty domain accepted"; fi

cer="$repo_dir/resource/client/ui-script/ui-installCER"
grep -q 'acmeWildcardNames' "$cer" || fail "ui-installCER missing acmeWildcardNames"
grep -q -- '--issue --dns dns_cf -d "$n1" -d "$n2"' "$cer" || fail "ui-installCER issue must use n1 n2"
grep -q -- 'acmeInstallCert "$n1"' "$cer" || fail "ui-installCER installcert must use n1"
grep -q -- '--installcert -d "$certDomain"' "$cer" || fail "ui-installCER installcert helper missing"
if grep -Fq -- '-d $domain -d *.$domain' "$cer"; then fail "ui-installCER still uses apex+wildcard SAN"; fi
if grep -Fq -- '-d $topDomain -d *.$topDomain' "$cer"; then fail "ui-installCER still uses last-two-labels SAN"; fi
echo OK
