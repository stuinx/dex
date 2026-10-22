const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');

const repo = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-nodesm-test-'));
const opt = path.join(root, 'opt/de_GWD');
const bin = path.join(root, 'bin');
fs.mkdirSync(path.join(opt, 'vtrui'), {recursive: true});
fs.mkdirSync(path.join(opt, 'smartdns'), {recursive: true});
fs.mkdirSync(path.join(opt, 'mosdns'), {recursive: true});
fs.mkdirSync(path.join(opt, '.repo'), {recursive: true});
fs.mkdirSync(bin, {recursive: true});

const rewrite = source => source.replaceAll('/opt/de_GWD', opt);
const write = (file, content, mode = 0o755) => {
  fs.writeFileSync(file, content);
  fs.chmodSync(file, mode);
};

write(path.join(bin, 'sponge'), `#!/bin/sh
target=$1
tmp=$(mktemp)
cat > "$tmp"
mv "$tmp" "$target"
`);
write(path.join(bin, 'systemctl'), '#!/bin/sh\nexit 0\n');
fs.writeFileSync(path.join(opt, '.repo/Domains.apple.txt'), 'apple.example\n');
fs.writeFileSync(path.join(opt, '.repo/Domains.games.txt'), 'games.example\n');
fs.writeFileSync(path.join(opt, 'smartdns/smartdns.conf'), '# test\n');

for (const name of ['ui-NodeSM', 'ui-V2routingDomain', 'ui-V2outbound', 'ui-submitListBWsm', 'ui-NodeSMcheck']) {
  write(path.join(opt, name), rewrite(fs.readFileSync(path.join(repo, 'resource/client/ui-script', name), 'utf8')));
}

const nodeA = {
  name: 'VLESS-A', domain: 'a.example:443', tls: 'a.example',
  uuid: '00000000-0000-4000-8000-000000000001', path: '/a', protocol: 'vless'
};
const nodeB = {
  name: 'VLESS-B', domain: 'b.example:8443', tls: 'b.example',
  uuid: '00000000-0000-4000-8000-000000000002', path: '/b', protocol: 'vless'
};
const oldConfig = {
  v2node: [nodeA, nodeB],
  v2nodeDIV: {
    nodeSM: {netflix: 'old.example', hdh: 'old.example', bahamut: 'old.example', steam: 'proxy'},
    outboundNodes: {nodeSMnetflix: {uuid: nodeA.uuid, path: nodeA.path, protocol: nodeA.protocol}}
  },
  dns: {listB: [], listW: []}
};
const xrayConfig = {
  outbounds: [
    {tag: 'direct', protocol: 'freedom'},
    {tag: 'nodeSMnetflix', protocol: 'vmess', settings: {vnext: [{address: 'old.example', port: 443, users: [{id: nodeA.uuid}]}]}},
    {tag: 'unrelated', protocol: 'freedom'}
  ],
  routing: {rules: [
    {domain: ['geosite:netflix'], outboundTag: 'nodeSMnetflix'},
    {domain: ['domain:keep.example'], outboundTag: 'unrelated'}
  ]}
};
const writeConfig = () => {
  fs.writeFileSync(path.join(opt, '0conf'), JSON.stringify(oldConfig));
  fs.writeFileSync(path.join(opt, 'vtrui/config.json'), JSON.stringify(xrayConfig));
};
const readJson = file => JSON.parse(fs.readFileSync(path.join(opt, file), 'utf8'));
const run = (script, args = []) => {
  const result = cp.spawnSync('/bin/bash', [path.join(opt, script), ...args], {
    encoding: 'utf8',
    env: {...process.env, PATH: `${bin}:${process.env.PATH}`},
    timeout: 15000
  });
  assert.equal(result.status, 0, `${script}: ${result.stderr}\n${result.stdout}`);
  return result.stdout;
};

try {
  writeConfig();
  const invalid = readJson('0conf');
  invalid.v2node[1].protocol = 'vmess';
  fs.writeFileSync(path.join(opt, '0conf'), JSON.stringify(invalid));
  const beforeInvalid = fs.readFileSync(path.join(opt, 'vtrui/config.json'), 'utf8');
  const rejected = cp.spawnSync('/bin/bash', [path.join(opt, 'ui-NodeSM'), 'r', '2'], {
    encoding: 'utf8', env: {...process.env, PATH: `${bin}:${process.env.PATH}`}, timeout: 15000
  });
  assert.notEqual(rejected.status, 0);
  assert.equal(fs.readFileSync(path.join(opt, 'vtrui/config.json'), 'utf8'), beforeInvalid);
  writeConfig();
  run('ui-NodeSM', ['r', '1', '2', '1', '0', '0', '0', '0', '0', '0', '0', '0', '2', '0', '1']);
  let config = readJson('vtrui/config.json');
  let tags = config.outbounds.map(outbound => outbound.tag);
  assert.deepEqual(tags.filter(tag => tag.startsWith('nodeSM')), ['nodeSMyoutube', 'nodeSMclaude', 'nodeSMgemini', 'nodeSMmetaai']);
  assert.equal(config.outbounds.find(outbound => outbound.tag === 'nodeSMyoutube').protocol, 'vless');
  assert.equal(config.outbounds.find(outbound => outbound.tag === 'nodeSMclaude').protocol, 'vless');
  assert.equal(config.outbounds.find(outbound => outbound.tag === 'nodeSMgemini').protocol, 'vless');
  assert.equal(config.outbounds.find(outbound => outbound.tag === 'nodeSMmetaai').protocol, 'vless');
  assert(config.routing.rules.some(rule => rule.outboundTag === 'nodeSMclaude' && rule.domain.includes('domain:claude.ai')));
  assert(config.routing.rules.some(rule => rule.outboundTag === 'nodeSMgemini' && rule.domain.includes('domain:gemini.google.com')));
  assert(config.routing.rules.some(rule => rule.outboundTag === 'nodeSMmetaai' && ['geosite:facebook', 'geosite:instagram', 'geosite:messenger', 'geosite:whatsapp', 'geosite:threads', 'geosite:oculus', 'domain:meta.ai', 'domain:muse.ai'].every(domain => rule.domain.includes(domain))));
  assert(!config.routing.rules.some(rule => rule.outboundTag === 'nodeSMnetflix'));
  assert(config.routing.rules.some(rule => rule.outboundTag === 'unrelated'));

  let state = readJson('0conf');
  assert.equal(state.v2nodeDIV.nodeSM.youtube, nodeA.domain);
  assert.equal(state.v2nodeDIV.nodeSM.claude, nodeB.domain);
  assert.equal(state.v2nodeDIV.nodeSM.gemini, nodeA.domain);
  assert.equal(state.v2nodeDIV.nodeSM.metaai, nodeB.domain);
  assert.equal(state.v2nodeDIV.nodeSM.steam, 'proxy');
  assert.equal(state.v2nodeDIV.nodeSM.netflix, undefined);
  assert.equal(state.v2nodeDIV.nodeSM.status, 'on');

  const check = run('ui-NodeSMcheck').trim().split('\n');
  assert.deepEqual(check.slice(0, 6), ['1', 'VLESS-A', '2', 'VLESS-B', '1', 'VLESS-A']);
  assert.deepEqual(check.slice(22, 24), ['2', 'VLESS-B']);
  assert.deepEqual(check.slice(-2), ['1', '默认代理']);

  run('ui-NodeSM');
  config = readJson('vtrui/config.json');
  assert.equal(config.outbounds.filter(outbound => outbound.tag === 'nodeSMyoutube').length, 1);
  assert.equal(config.outbounds.filter(outbound => outbound.tag === 'nodeSMclaude').length, 1);
  assert.equal(config.routing.rules.filter(rule => rule.outboundTag === 'nodeSMclaude').length, 1);

  run('ui-NodeSM', ['r', ...Array(12).fill('0'), '1', '0']);
  config = readJson('vtrui/config.json');
  assert(config.routing.rules.some(rule => rule.outboundTag === 'nodeSMapple' && rule.domain.includes('geosite:apple')));
  assert(!config.routing.rules.some(rule => rule.domain.includes('geosite:apple-ads')));

  run('ui-NodeSM', ['r', ...Array(14).fill('0')]);
  config = readJson('vtrui/config.json');
  assert(!config.outbounds.some(outbound => outbound.tag.startsWith('nodeSM')));
  assert(config.routing.rules.some(rule => rule.outboundTag === 'direct' && rule.domain.includes('geosite:apple')));
  assert(!config.routing.rules.some(rule => rule.domain.includes('geosite:apple-ads')));
  assert(config.routing.rules.some(rule => rule.outboundTag === 'direct' && rule.domain.includes('domain:steamserver.net')));
  assert.equal(readJson('0conf').v2nodeDIV.nodeSM.status, 'off');
  console.log('PASS: VLESS predefined routes including Meta AI, rejected VMess selection, legacy cleanup, rebuild, reset, and status detection');
  console.log(`Fixtures: ${root}`);
} catch (error) {
  console.error(`Fixtures retained: ${root}`);
  throw error;
}
