const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');

const repo = path.resolve(__dirname, '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-custom-routing-'));
const opt = path.join(fixture, 'opt/de_GWD');
const bin = path.join(fixture, 'bin');
for (const dir of [bin, path.join(fixture, 'tmp'), path.join(opt, 'vtrui'), path.join(opt, 'nftables')]) fs.mkdirSync(dir, {recursive: true});
for (const script of ['ui-NodeCU', 'ui-NodeDT', 'ui-NodeCUcheck', 'ui-NodeDTcheck', 'ui-checkNode', 'ui-V2outbound', 'ui-V2routingDomain', 'ui-V2routingIP', 'ui-V2routingSip']) {
  const source = fs.readFileSync(path.join(repo, 'resource/client/ui-script', script), 'utf8')
    .replace(/\/opt\/de_GWD|\/tmp\//g, match => fixture + match);
  fs.writeFileSync(path.join(opt, script), source, {mode: 0o755});
}
fs.writeFileSync(path.join(bin, 'systemctl'), '#!/bin/sh\nexit 0\n', {mode: 0o755});
fs.writeFileSync(path.join(bin, 'sponge'), '#!/bin/sh\ntmp=$(mktemp)\ncat >"$tmp"\ncat "$tmp" >"$1"\nrm -f "$tmp"\n', {mode: 0o755});
fs.writeFileSync(path.join(bin, 'nft'), '#!/bin/sh\nprintf "%s\\n" "$*" >>"$NFT_LOG"\n[ ! -f "$NFT_FAIL" ]\n', {mode: 0o755});
const first = {name: 'first SNI', domain: 'same.example:443', uuid: '00000000-0000-4000-8000-000000000001', path: '/shared', tls: 'first.example', protocol: 'vless'};
const selected = {...first, name: 'selected SNI', tls: 'selected.example'};
const config = path.join(opt, '0conf');
const runtime = path.join(opt, 'vtrui/config.json');
const nftLog = path.join(fixture, 'nft.log');
const nftFail = path.join(fixture, 'nft.fail');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data));
const run = (script, args = [], success = true) => {
  const result = cp.spawnSync('/bin/bash', [path.join(opt, script), ...args], {
    env: {...process.env, PATH: `${bin}:${process.env.PATH}`, NFT_LOG: nftLog, NFT_FAIL: nftFail},
    encoding: 'utf8', timeout: 15000
  });
  assert.equal(result.status === 0, success, `${script}: ${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
};
try {
  for (const [script, tag, settings] of [['ui-NodeCU', 'custom', 'nodeCU'], ['ui-NodeDT', 'divert', 'nodeDT']]) {
    write(config, {v2node: [first, selected], v2nodeDIV: {
      nodeCU: {rulesDomain: ['domain:custom.example'], rulesIP: []},
      nodeDT: {CHNlistProxyIP: [], globalProxyIP: [], directProxyIP: []}
    }});
    write(runtime, {outbounds: [{tag: 'direct', protocol: 'freedom'}], routing: {rules: []}});
    run(script, ['r', '1']);
    let outbound = read(runtime).outbounds.find(out => out.tag === tag);
    assert.equal(outbound.streamSettings.tlsSettings.serverName, selected.tls);
    const reordered = read(config);
    reordered.v2node.reverse();
    write(config, reordered);
    run(script);
    outbound = read(runtime).outbounds.find(out => out.tag === tag);
    assert.equal(outbound.streamSettings.tlsSettings.serverName, selected.tls);
    assert.equal(run(`${script}check`), selected.name);
    assert.equal(read(runtime).outbounds.filter(out => out.tag === tag).length, 1);
    const before = fs.readFileSync(runtime, 'utf8');
    const invalid = read(config);
    invalid.v2node[0].protocol = 'vmess';
    write(config, invalid);
    run(script, ['r', '0'], false);
    assert.equal(fs.readFileSync(runtime, 'utf8'), before);
    invalid.v2node[0].protocol = 'vless';
    delete invalid.v2nodeDIV.outboundNodes[tag];
    write(config, invalid);
    run(script, [], false);
    assert.equal(fs.readFileSync(runtime, 'utf8'), before);
    assert.equal(read(config).v2nodeDIV[settings].address, selected.domain);
    console.log(`PASS ${script}: preserves SNI identity through reorder/rebuild and rejects legacy ambiguity/VMess before changing runtime`);
  }
  const nftCalls = fs.readFileSync(nftLog, 'utf8').trim().split('\n');
  assert(nftCalls.length >= 4);
  assert(nftCalls.every(call => call.startsWith('list set ') || call.startsWith('-c -f ') || call.startsWith('-f ')));
  const state = read(config);
  state.v2nodeDIV.outboundNodes.divert = {uuid: selected.uuid, path: selected.path, protocol: selected.protocol, tls: selected.tls};
  write(config, state);
  fs.writeFileSync(nftFail, 'fail validation');
  const callsBefore = nftCalls.length;
  const persistedRule = path.join(opt, 'nftables/SET_listBlan.nft');
  const beforeRule = fs.readFileSync(persistedRule, 'utf8');
  run('ui-NodeDT', [], false);
  const failedCalls = fs.readFileSync(nftLog, 'utf8').trim().split('\n').slice(callsBefore);
  assert.equal(failedCalls.length, 2);
  assert(failedCalls[1].startsWith('-c -f '));
  assert.equal(fs.readFileSync(persistedRule, 'utf8'), beforeRule);
  console.log('PASS ui-NodeDT: validates nft batches and reports failure without submitting a separate flush');
  const selectedRuntime = read(runtime);
  selectedRuntime.outbounds = [selectedRuntime.outbounds.find(out => out.tag === 'divert')];
  write(runtime, selectedRuntime);
  assert.equal(run('ui-checkNode'), '0');
  console.log('PASS ui-checkNode: matches the selected TLS identity with one jq process');
} finally {
  fs.rmSync(fixture, {recursive: true, force: true});
}
