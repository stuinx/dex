const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-dns-runtime-'));
const opt = path.join(root, 'opt/de_GWD');
const bin = path.join(root, 'bin');
for (const dir of [bin, `${opt}/mosdns`, `${opt}/pihole`, `${opt}/smartdns`, `${opt}/coredns`, `${opt}/nftables`, `${opt}/.repo`]) fs.mkdirSync(dir, {recursive: true});
const log = `${root}/calls`;
const write = (file, text) => fs.writeFileSync(file, text, {mode: 0o755});
const install = name => write(`${opt}/${name}`, fs.readFileSync(`${repo}/resource/client/ui-script/${name}`, 'utf8').replaceAll('/opt/de_GWD', opt).replaceAll('/usr/sbin/nft', `${bin}/nft`));
write(`${bin}/sponge`, '#!/bin/sh\ntarget=$1\ntmp=$(mktemp)\ncat > "$tmp"\ncat "$tmp" > "$target"\nrm "$tmp"\n');
write(`${bin}/systemctl`, '#!/bin/sh\nprintf "systemctl %s\\n" "$*" >> "$CALL_LOG"\nexit 0\n');
write(`${bin}/dig`, '#!/bin/sh\ncase "$*" in *two.example*) echo 192.0.2.20;; *) echo 192.0.2.10;; esac\n');
write(`${bin}/nft`, `#!/bin/sh
printf 'nft %s\\n' "$*" >> "$CALL_LOG"
case "$*" in
  '-c -f '*) [ "\${NFT_FAIL:-}" != check ] || exit 1;;
  '-f '*) [ "\${NFT_FAIL:-}" != apply ] || exit 1;;
esac
exit 0
`);
write(`${bin}/yq`, `#!${process.execPath}
const fs=require('node:fs');
const expression=process.argv[4], file=process.argv[5];
const match=expression.match(/entries \\+= (\\[.*\\])$/);
if (!match) process.exit(1);
for(const value of JSON.parse(match[1])) fs.appendFileSync(file, '        - '+JSON.stringify(value)+'\\n');
`);
// The production dependency is python3-toml; this test shim preserves its data contract.
write(`${root}/toml.py`, 'import json\nload = json.load\ndef dump(data, stream):\n    json.dump(data, stream)\n');
if (process.platform === 'darwin') {
  write(`${bin}/sed`, `#!${process.execPath}\nconst cp=require('node:child_process');let a=process.argv.slice(2).map(x=>x.replaceAll('\\\\s','[[:space:]]'));if(a[0]==='-i')a.splice(1,0,'');process.exit(cp.spawnSync('/usr/bin/sed',a,{stdio:'inherit'}).status??1);\n`);
  write(`${bin}/grep`, `#!${process.execPath}\nconst fs=require('node:fs'),cp=require('node:child_process');const a=process.argv.slice(2);if(a[0]==='-Po'){const matches=fs.readFileSync(0,'utf8').match(new RegExp(a[1],'g'))||[];if(matches.length)console.log(matches.join('\\n'));process.exit(matches.length?0:1)}process.exit(cp.spawnSync('/usr/bin/grep',a,{stdio:'inherit'}).status??1);\n`);
}
const env = {...process.env, PATH: `${bin}:${process.env.PATH}`, PYTHONPATH: root, CALL_LOG: log};
const run = (name, extra = {}) => cp.spawnSync('/bin/bash', [`${opt}/${name}`], {encoding: 'utf8', env: {...env, ...extra}, timeout: 15000});
const state = {v2node: [], dns: {china: '192.0.2.53', doh: ['one.example/dns', 'two.example/dns'], doh1re: '192.0.2.10', doh2re: '192.0.2.20', hosts: {'first.example': '192.0.2.1', 'second.example': '192.0.2.2'}, listB: [], listW: []}};
const reset = () => {
  write(`${opt}/0conf`, JSON.stringify(state));
  write(`${opt}/pihole/pihole.toml`, '{"dns":{}}');
  write(`${opt}/coredns/corefile`, '');
  write(`${opt}/smartdns/smartdns.conf`, 'old');
  write(log, '');
};
let failures = 0;
const check = (name, action) => { try { action(); console.log(`PASS: ${name}`); } catch (error) { failures++; console.error(`FAIL: ${name}: ${error.message}`); } };
install('ui-DNSsplit');
for (const name of ['ui-NodeSave', 'ui-submitListBW', 'ui-submitListBWsm']) write(`${opt}/${name}`, '#!/bin/sh\nexit 0\n');
check('DNS hosts retain all lines and bootstrap DoH entries', () => {
  reset();
  const result = run('ui-DNSsplit');
  assert.equal(result.status, 0, result.stderr);
  const hosts = fs.readFileSync(`${opt}/mosdns/hosts.yaml`, 'utf8');
  for (const entry of ['first.example 192.0.2.1', 'second.example 192.0.2.2', 'one.example 192.0.2.10', 'two.example 192.0.2.20']) assert(hosts.includes(entry), entry);
  assert.deepEqual(JSON.parse(fs.readFileSync(`${opt}/pihole/pihole.toml`, 'utf8')).dns.hosts, ['192.0.2.1 first.example', '192.0.2.2 second.example']);
});
check('DNS generation propagates an upstream generator failure', () => {
  reset();
  write(`${opt}/ui-NodeSave`, '#!/bin/sh\nexit 7\n');
  assert.notEqual(run('ui-DNSsplit').status, 0);
  write(`${opt}/ui-NodeSave`, '#!/bin/sh\nexit 0\n');
});
for (const name of ['ui-smartDNS', 'ui-NodeSave', 'ui-submitListBW']) {
  install(name);
  check(`${name} stages nft changes and preserves installed rule on validation failure`, () => {
    reset();
    const persistent = name === 'ui-smartDNS' ? 'SET_GlobalDNS.nft' : name === 'ui-NodeSave' ? 'SET_V2NODE.nft' : 'SET_listB.nft';
    write(`${opt}/nftables/${persistent}`, 'old');
    assert.notEqual(run(name, {NFT_FAIL: 'check'}).status, 0);
    const calls = fs.readFileSync(log, 'utf8');
    assert(!/^nft flush/m.test(calls), calls);
    assert(!/^nft -f /m.test(calls), calls);
    assert.equal(fs.readFileSync(`${opt}/nftables/${persistent}`, 'utf8'), 'old');
    write(log, '');
    const result = run(name);
    assert.equal(result.status, 0, result.stderr);
    const updated = fs.readFileSync(`${opt}/nftables/${persistent}`, 'utf8');
    assert(updated.startsWith(`#!${bin}/nft -f\n`), 'persistent nft script must retain a valid shebang');
    assert(updated.includes('flush set ip de_GWD '), updated);
    const successCalls = fs.readFileSync(log, 'utf8');
    assert(!/^nft flush/m.test(successCalls), successCalls);
    assert(successCalls.includes('nft -c -f ') && successCalls.includes('nft -f '), successCalls);
    assert(fs.statSync(`${opt}/nftables/${persistent}`).mode & 0o111, 'persistent nft script must stay executable');
    // macOS does not recursively execute our shell-script interpreter shim.
    if (process.platform !== 'darwin') {
      const direct = cp.spawnSync(`${opt}/nftables/${persistent}`, [], {encoding: 'utf8', env, timeout: 10000});
      assert.equal(direct.status, 0, direct.stderr);
    }
  });
}
if (failures) { console.error(`Fixtures: ${root}`); process.exitCode = 1; }
else { console.log('PASS: isolated DNS hosts and nft transaction checks (nft is mocked)'); fs.rmSync(root, {recursive: true, force: true}); }
