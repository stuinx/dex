const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../client'), 'utf8');
const start = source.indexOf('haproxy_syncFirewall(){');
const end = source.indexOf('\n}\n', start);
assert(start >= 0 && end > start);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-haproxy-firewall-'));
try {
  for (const scenario of ['cold-start', 'active']) {
    const nftDir = path.join(root, scenario);
    fs.mkdirSync(nftDir);
    const nftFile = path.join(nftDir, 'nftables');
    const calls = path.join(nftDir, 'nft-calls');
    fs.writeFileSync(nftFile, '                ip saddr @listBlan accept\n');
    const fn = source.slice(start, end + 2).replaceAll('/opt/de_GWD/nftables', nftDir);
    const result = cp.spawnSync('/bin/bash', ['-c', `
haproxy_extractRules(){ printf '8443\\t127.0.0.1:3000\\n'; }
haproxy_validPort(){ [[ $1 =~ ^[0-9]+$ ]] && (( $1 >= 1 && $1 <= 65535 )); }
sed(){ awk '/ip saddr @listBlan/ {print "                tcp dport @HAProxyPort accept"} {print}' "$3" > "$3.tmp" && mv "$3.tmp" "$3"; }
nft(){
  printf '%s\\n' "$*" >> "$NFT_CALLS"
  if [[ "$*" = 'list chain ip de_GWD prerouting' || "$*" = '-a list chain ip de_GWD prerouting' ]]; then
    [[ $SCENARIO != active ]] && return 1
    printf 'tcp dport @HAProxyPort accept\\n'
    return 0
  fi
  return 0
}
${fn}
haproxy_syncFirewall
`], {encoding: 'utf8', timeout: 10000, env: {...process.env, SCENARIO: scenario, NFT_CALLS: calls}});

    assert.equal(result.status, 0, scenario + result.stdout + result.stderr);
    assert.match(fs.readFileSync(nftFile, 'utf8'), /tcp dport @HAProxyPort accept/);
    assert.match(fs.readFileSync(path.join(nftDir, 'SET_HAProxyPort.nft'), 'utf8'), /elements = \{ 8443 \}/);
    const nftCalls = fs.readFileSync(calls, 'utf8').trim().split('\n');
    if (scenario === 'cold-start') {
      assert.deepEqual(nftCalls, ['list chain ip de_GWD prerouting']);
    } else {
      assert.deepEqual(nftCalls, [
        'list chain ip de_GWD prerouting',
        'list set ip de_GWD HAProxyPort',
        '-a list chain ip de_GWD prerouting',
        'flush set ip de_GWD HAProxyPort',
        'add element ip de_GWD HAProxyPort { 8443 }'
      ]);
    }
    console.log('PASS:', scenario);
  }
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
