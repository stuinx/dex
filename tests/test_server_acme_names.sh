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
echo OK
