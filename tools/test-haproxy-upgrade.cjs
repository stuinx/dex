const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../server'), 'utf8');
const start = source.indexOf('haproxy_ensureInstalled(){');
const end = source.indexOf('\n}\n', start);
assert(start >= 0 && end > start);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-haproxy-upgrade-'));
try {
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const oldCore = '#!/bin/sh\necho old-core\n';
  const newCore = '#!/bin/sh\n[ "$1" != "-c" ] || [ "$SCENARIO" != "config-failure" ] || exit 1\necho new-core\n';
  const core = path.join(bin, 'haproxy');
  const candidate = path.join(root, 'new-core');
  const config = path.join(root, 'haproxy.cfg');
  const restarts = path.join(root, 'restarts');
  fs.writeFileSync(candidate, newCore, {mode: 0o755});
  fs.writeFileSync(config, 'fixture');
  const hash = crypto.createHash('sha256').update(newCore).digest('hex');
  const fn = source.slice(start, end + 2).replaceAll('/usr/sbin', bin);
  for (const scenario of ['success', 'unchanged', 'inactive', 'download-failure', 'hash-failure', 'config-failure', 'restart-failure']) {
    fs.writeFileSync(core, scenario === 'unchanged' ? newCore : oldCore, {mode: 0o755});
    fs.writeFileSync(restarts, '');
    const result = cp.spawnSync('/bin/bash', ['-c', `
repoBase=https://fixture.invalid
architecture=amd64
haproxyConfig=${JSON.stringify(config)}
haproxy(){ :; }
curl(){
  case "$*" in
    *.sha256sum) echo "$EXPECTED_HASH"; return 0;;
  esac
  [[ $SCENARIO != download-failure ]] || return 22
  local destination
  while (( $# )); do
    if [[ $1 = -o ]]; then destination=$2; break; fi
    shift
  done
  if [[ $SCENARIO = hash-failure ]]; then echo invalid > "$destination"; else cp "$NEW_CORE" "$destination"; fi
}
systemctl(){
  if [[ $1 = is-active ]]; then [[ $SCENARIO != inactive ]] && echo active || echo inactive; return; fi
  echo restart >> "$RESTARTS"
  if [[ $SCENARIO = restart-failure ]] && (( $(wc -l < "$RESTARTS") == 1 )); then return 1; fi
  return 0
}
${fn}
haproxy_ensureInstalled
`], {encoding: 'utf8', timeout: 10000, env: {...process.env, SCENARIO: scenario, EXPECTED_HASH: hash, NEW_CORE: candidate, RESTARTS: restarts}});
    const success = ['success', 'unchanged', 'inactive'].includes(scenario);
    assert.equal(result.status === 0, success, scenario + result.stdout + result.stderr);
    assert.equal(fs.readFileSync(core, 'utf8'), success ? newCore : oldCore, scenario);
    assert.equal(fs.statSync(core).mode & 0o777, 0o755, scenario + ': permission changed');
    const count = fs.readFileSync(restarts, 'utf8').trim().split('\n').filter(Boolean).length;
    assert.equal(count, scenario === 'success' ? 1 : scenario === 'restart-failure' ? 2 : 0, scenario);
    assert.deepEqual(fs.readdirSync(bin), ['haproxy'], scenario + ': leaked staging file');
    console.log('PASS:', scenario);
  }
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
