const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-fwd1-config-'));
const opt = path.join(fixture, 'opt/de_GWD');
const ssl = path.join(fixture, 'var/www/ssl');
const systemd = path.join(fixture, 'etc/systemd/system');
const legacySystemd = path.join(fixture, 'lib/systemd/system');
const upstream = {domain: 'same.example:8443', uuid: '00000000-0000-4000-8000-000000000002', path: '/upstream', protocol: 'vless', tls: 'sni.example'};
const config = {
  FORWARD: {FWD1: {port: '00443', uuid: [{FWD1uuid: '10000000-0000-4000-8000-000000000001'}], upstream: JSON.stringify(upstream)}},
  v2node: [
    {...upstream, name: 'first', uuid: '00000000-0000-4000-8000-000000000001', path: '/first'},
    {...upstream, name: 'selected'},
  ],
};
try {
  fs.mkdirSync(path.join(opt, 'vtrui'), {recursive: true});
  fs.mkdirSync(ssl, {recursive: true});
  fs.mkdirSync(systemd, {recursive: true});
  fs.mkdirSync(legacySystemd, {recursive: true});
  fs.writeFileSync(path.join(opt, 'vtrui/vtrui'), 'fixture executable');
  fs.writeFileSync(path.join(opt, '0conf'), JSON.stringify(config));
  fs.writeFileSync(path.join(ssl, 'de_GWD.cer'), 'fixture cert');
  fs.writeFileSync(path.join(ssl, 'de_GWD.key'), 'fixture key');
  let script = fs.readFileSync(path.join(root, 'resource/client/ui-script/ui-FWD1save'), 'utf8');
  for (const [from, to] of [
    ['/opt/de_GWD', opt],
    ['/var/www/ssl', ssl],
    ['/etc/systemd/system', systemd],
    ['/lib/systemd/system', legacySystemd],
    ['/tmp/vtruiDomains', path.join(fixture, 'tmp/vtruiDomains')],
  ]) script = script.replaceAll(from, to);
  const prelude = 'sponge(){ local target="$1" temp; temp=$(mktemp); cat >"$temp"; mv "$temp" "$target"; }; systemctl(){ return 0; }; ';
  const result = cp.spawnSync('/bin/bash', ['-c', prelude + script], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const generated = JSON.parse(fs.readFileSync(path.join(opt, 'vtrui1/config.json'), 'utf8'));
  assert.equal(generated.inbounds[0].port, 443);
  assert.equal(generated.inbounds[0].protocol, 'vless');
  assert.equal(generated.inbounds[0].streamSettings.network, 'ws');
  assert.equal(generated.inbounds[0].streamSettings.security, 'tls');
  assert.equal(generated.inbounds[0].streamSettings.wsSettings.path, '/000001');
  assert.equal(generated.inbounds[0].settings.clients[0].id, '10000000-0000-4000-8000-000000000001');
  assert.equal(generated.outbounds[0].protocol, 'vless');
  assert.equal(generated.outbounds[0].settings.vnext[0].users[0].id, upstream.uuid);
  assert.equal(generated.outbounds[0].streamSettings.network, 'ws');
  assert.equal(generated.outbounds[0].streamSettings.security, 'tls');
  assert.equal(generated.outbounds[0].streamSettings.wsSettings.path, upstream.path);
  assert.equal(generated.outbounds[0].streamSettings.tlsSettings.serverName, upstream.tls);
  console.log('PASS: FWD1 emits valid VLESS WS TLS inbound and selected VLESS WS TLS upstream');
} finally {
  fs.rmSync(fixture, {recursive: true, force: true});
}
