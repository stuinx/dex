const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-socks5-udp-'));
const opt = path.join(root, 'opt/de_GWD');
fs.mkdirSync(path.join(opt, 'vtrui'), {recursive: true});
const source = fs.readFileSync(path.join(repo, 'server'), 'utf8');
const start = source.indexOf('extraXrayInbounds(){');
assert(start >= 0);
const end = source.indexOf('\n}\n', start);
const fn = source.slice(start, end + 2).replaceAll('/opt/de_GWD', opt);
const settings = path.join(opt, 'extra-inbounds.json');
const config = path.join(opt, 'vtrui/config.json');
fs.writeFileSync(settings, JSON.stringify({socks5: {enabled: true, domain: 'udp.example.test', port: 1080, user: 'test', password: 'test-password'}}));
const original = {inbounds: [{tag: 'main', protocol: 'vless', port: 9890}], outbounds: [{tag: 'direct', protocol: 'freedom'}]};
function run(address) {
  fs.writeFileSync(config, JSON.stringify(original));
  return cp.spawnSync('/bin/bash', ['-c', `set -eo pipefail
extraSettings=${JSON.stringify(settings)}
extra_validateSettings() { return 0; }
sponge() { local data; data=$(cat); printf '%s\\n' "$data" > "$1"; }
getent() { [[ -n "$TEST_UDP_IP" ]] || return 2; printf '%s STREAM udp.example.test\\n' "$TEST_UDP_IP"; }
${fn}
extraXrayInbounds
`], {env: {...process.env, TEST_UDP_IP: address}, encoding: 'utf8', timeout: 5000});
}
for (const address of ['203.0.113.8', '192.0.2.8']) {
  const result = run(address);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const generated = JSON.parse(fs.readFileSync(config, 'utf8'));
  const socks = generated.inbounds.find(item => item.tag === 'extra-socks5');
  assert.equal(socks.settings.ip, address);
  assert.equal(socks.listen, '0.0.0.0');
  assert.equal(socks.settings.udp, true);
  assert.deepEqual(socks.settings.accounts, [{user: 'test', pass: 'test-password'}]);
  assert.deepEqual(generated.inbounds[0], original.inbounds[0]);
}
assert.notEqual(run('').status, 0, 'Unresolved UDP address must fail');
const disabled = JSON.parse(fs.readFileSync(settings, 'utf8'));
disabled.socks5.enabled = false;
fs.writeFileSync(settings, JSON.stringify(disabled));
assert.equal(run('').status, 0, 'Disabled SOCKS5 must not require DNS resolution');
assert.deepEqual(JSON.parse(fs.readFileSync(config, 'utf8')), original);
console.log('PASS: SOCKS5 UDP advertises the node IPv4 address, preserves other settings and rejects failed resolution');
