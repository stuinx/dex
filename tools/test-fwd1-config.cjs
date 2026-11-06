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
const upstream = {domain: 'same.example:8443', uuid: '00000000-0000-4000-8000-000000000002', path: '/quote"back\\slash<&', protocol: 'vless', tls: 'sni.example'};
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
  assert.equal(generated.inbounds[0].streamSettings.tlsSettings.certificates[0].keyFile, path.join(ssl, 'de_GWD.key'));
  const runtimeFile = path.join(opt, 'vtrui1/config.json');
  const originalRuntime = fs.readFileSync(runtimeFile, 'utf8');
  config.FORWARD.FWD1.uuid[0].FWD1uuid = 'invalid"uuid';
  fs.writeFileSync(path.join(opt, '0conf'), JSON.stringify(config));
  const rejected = cp.spawnSync('/bin/bash', ['-c', prelude + script], {encoding: 'utf8'});
  assert.notEqual(rejected.status, 0);
  assert.equal(fs.readFileSync(runtimeFile, 'utf8'), originalRuntime, 'bad UUID must preserve existing FWD1 runtime');

  config.FORWARD.FWD0 = {port:'00443',uuid:[{FWD0uuid:'10000000-0000-4000-8000-000000000001'}]};
  fs.writeFileSync(path.join(opt, '0conf'), JSON.stringify(config));
  const mainRuntime = path.join(opt,'vtrui/config.json');
  fs.writeFileSync(mainRuntime, JSON.stringify({inbounds:[{tag:'transparent'}],outbounds:[{tag:'default'}]}));
  let fwd0 = fs.readFileSync(path.join(root,'resource/client/ui-script/ui-FWD0save'),'utf8').replaceAll('/opt/de_GWD',opt).replaceAll('/var/www/ssl',ssl);
  const fwd0Result = cp.spawnSync('/bin/bash',['-c',prelude+fwd0,'fixture','r'],{encoding:'utf8'});
  assert.equal(fwd0Result.status,0,fwd0Result.stderr);
  const fwd0Config = JSON.parse(fs.readFileSync(mainRuntime));
  assert.equal(fwd0Config.inbounds[0].tag,'transparent');
  assert.equal(fwd0Config.inbounds[1].settings.clients[0].id,config.FORWARD.FWD0.uuid[0].FWD0uuid);
  assert.equal(fwd0Config.inbounds[1].streamSettings.tlsSettings.certificates[0].keyFile,path.join(ssl,'de_GWD.key'));
  const originalMain = fs.readFileSync(mainRuntime,'utf8');
  config.FORWARD.FWD0.uuid[0].FWD0uuid='invalid"uuid';
  fs.writeFileSync(path.join(opt,'0conf'),JSON.stringify(config));
  const rejectedFwd0 = cp.spawnSync('/bin/bash',['-c',prelude+fwd0,'fixture','r'],{encoding:'utf8'});
  assert.notEqual(rejectedFwd0.status,0);
  assert.equal(fs.readFileSync(mainRuntime,'utf8'),originalMain);
  console.log('PASS: FWD0/FWD1 JSON-safe VLESS WS TLS generation and invalid-UUID preservation');
} finally {
  fs.rmSync(fixture, {recursive: true, force: true});
}
