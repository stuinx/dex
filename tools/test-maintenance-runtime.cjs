const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-maintenance-'));
const opt = path.join(root, 'opt/de_GWD');
const bin = path.join(root, 'bin');
for (const dir of [bin, `${opt}/.repo`, `${opt}/vtrui`, `${opt}/nftables`, `${root}/etc/dnsmasq.d`, `${root}/var/log`, `${root}/var/www/html/restore`, `${root}/tmp`, `${root}/home`]) {
  fs.mkdirSync(dir, {recursive: true});
}
const log = path.join(root, 'calls');
const write = (file, text, mode = 0o755) => fs.writeFileSync(file, text, {mode});
const rewrite = text => text.replace(/\/opt\/de_GWD|\/var\/log|\/var\/www|\/tmp\/|\/root\/\.acme\.sh|\/etc\/dnsmasq\.d/g,
  match => match === '/root/.acme.sh' ? `${root}/acme` : root + match);
for (const name of ['ui_2h', 'ui_4h', 'ui_4am']) write(`${opt}/${name}`, rewrite(fs.readFileSync(`${repo}/resource/client/ui-script/${name}`, 'utf8')));
write(`${opt}/tcpTime`, '#!/bin/sh\nexit 0\n');
for (const name of ['service', 'systemctl', 'nft', 'openssl', 'flock']) {
  write(`${bin}/${name}`, `#!/bin/sh\nprintf '%s\\n' '${name} '"$*" >> "$CALL_LOG"\n[ '${name}' != flock ] || exit "\${LOCK_STATUS:-0}"\ncase "$*" in '-c -f '*) exit "\${NFT_CHECK_STATUS:-0}";; esac\nexit 0\n`);
}
write(`${bin}/timeout`, '#!/bin/sh\nprintf "timeout %s\\n" "$*" >> "$CALL_LOG"\nshift 3\nexec "$@"\n');
write(`${bin}/curl`, `#!${process.execPath}
const fs=require('node:fs'),crypto=require('node:crypto');
const a=process.argv.slice(2);fs.appendFileSync(process.env.CALL_LOG,'curl '+a.join(' ')+'\\n');
if(!process.env.RULES_SUCCESS)process.exit(22);
const target=a[a.indexOf('-o')+1],url=a.at(-1),name=url.split('/').at(-1);
const source=name.replace(/\\.sha256sum$/,'');
const data=source==='IPchnroute'?'192.0.2.0/24\\n':'fixture '+source+'\\n';
if(name.endsWith('.sha256sum'))fs.writeFileSync(target,crypto.createHash('sha256').update(data).digest('hex')+'\\n');
else fs.writeFileSync(target,process.env.BAD_RESOURCE===source?'bad checksum':data);
`);
const env = {...process.env, PATH: `${bin}:${process.env.PATH}`, CALL_LOG: log};
const run = (name, args = [], extra = {}) => cp.spawnSync('/bin/bash', [`${opt}/${name}`, ...args], {encoding: 'utf8', env: {...env, ...extra}, timeout: 10000});
let failures = 0;
const check = (name, action) => { try { action(); console.log(`PASS: ${name}`); } catch (error) { failures++; console.error(`FAIL: ${name}: ${error.message}`); } };
check('housekeeping preserves unrelated files, update entrypoint, and valid backup', () => {
  const keep = [`${root}/tmp/tmp.other-app`, `${root}/tmp/systemd-private-test`, `${root}/home/client-notes`, `${root}/var/log/auth.log`, `${opt}/update`];
  keep.forEach(file => write(file, 'keep'));
  write(`${opt}/0conf`, '{invalid');
  write(`${opt}/0conf_bak`, '{"valid":true}');
  run('ui_2h');
  keep.forEach(file => assert(fs.existsSync(file), file));
  assert.equal(fs.readFileSync(`${opt}/0conf_bak`, 'utf8'), '{"valid":true}');
  assert.deepEqual(JSON.parse(fs.readFileSync(`${opt}/0conf`, 'utf8')), {valid: true});
});
check('DNS update handles both restart flags and propagates failures', () => {
  write(`${opt}/ui-smartDNS`, '#!/bin/sh\nexit "${DNS_STATUS:-0}"\n');
  write(`${opt}/ui-DNSsplit`, '#!/bin/sh\nexit "${SPLIT_STATUS:-0}"\n');
  write(log, '');
  assert.equal(run('ui_4h', ['r', 'n']).status, 0);
  const calls = fs.readFileSync(log, 'utf8');
  for (const service of ['smartdns', 'mosdns', 'nftables']) assert(calls.includes(`systemctl restart ${service}`), service);
  assert.notEqual(run('ui_4h', ['r'], {DNS_STATUS: '7'}).status, 0);
  assert.notEqual(run('ui_4h', ['n'], {SPLIT_STATUS: '8'}).status, 0);
});
check('rule metadata failure leaves cron running and uses bounded downloads', () => {
  write(log, '');
  assert.notEqual(run('ui_4am', ['u']).status, 0);
  const calls = fs.readFileSync(log, 'utf8');
  assert(!calls.includes('service cron stop'), calls);
  const downloads = calls.split('\n').filter(line => line.startsWith('curl ') && !line.includes(' -I'));
  assert(downloads.length > 0);
  downloads.forEach(line => assert(line.includes('--max-time') && line.includes('--connect-timeout') && line.includes('--retry'), line));
});
const files = ['geosite.dat', 'geoip.dat', 'IPchnroute', 'Domains.chn.txt', 'Domains.apple.txt', 'Domains.games.txt', '99-bogus-nxdomain.china.conf'];
check('rule checksum mismatch preserves all previous resources', () => {
  files.forEach(file => write(`${opt}/.repo/${file}`, 'old'));
  assert.notEqual(run('ui_4am', [], {RULES_SUCCESS: '1', BAD_RESOURCE: 'Domains.games.txt'}).status, 0);
  files.forEach(file => assert.equal(fs.readFileSync(`${opt}/.repo/${file}`, 'utf8'), 'old'));
});
check('rule success commits resources and validates one nft transaction', () => {
  write(log, '');
  const result = run('ui_4am', ['u'], {RULES_SUCCESS: '1'});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(`${opt}/vtrui/geosite.dat`, 'utf8'), 'fixture geosite.dat\n');
  const calls = fs.readFileSync(log, 'utf8');
  assert(!calls.includes('service cron stop'));
  assert(!/^nft flush/m.test(calls));
  assert(calls.includes('nft -c -f ') && calls.includes('nft -f '), calls);
  assert(fs.readFileSync(`${opt}/nftables/SET_CHNROUTE.nft`, 'utf8').includes('flush set ip de_GWD CHNROUTE'));
  assert(!fs.readdirSync(`${opt}/.repo`, {withFileTypes: true}).some(entry => entry.isDirectory() && entry.name.startsWith('.rules-update.')));
});
check('rule validation failure preserves installed nft rules', () => {
  write(`${opt}/nftables/SET_CHNROUTE.nft`, 'old');
  write(log, '');
  assert.notEqual(run('ui_4am', [], {RULES_SUCCESS: '1', NFT_CHECK_STATUS: '1'}).status, 0);
  assert.equal(fs.readFileSync(`${opt}/nftables/SET_CHNROUTE.nft`, 'utf8'), 'old');
  assert(!/^nft -f /m.test(fs.readFileSync(log, 'utf8')));
});
check('overlapping rule update exits before touching network or services', () => {
  write(log, '');
  assert.equal(run('ui_4am', [], {LOCK_STATUS: '1'}).status, 0);
  assert(!fs.readFileSync(log, 'utf8').includes('curl '));
});
if (failures) { console.error(`Fixtures: ${root}`); process.exitCode = 1; }
else { console.log('PASS: isolated maintenance runtime checks'); fs.rmSync(root, {recursive: true, force: true}); }
