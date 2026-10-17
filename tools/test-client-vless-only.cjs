const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-vless-only-'));
const opt = path.join(root, 'opt/de_GWD');
fs.mkdirSync(path.join(opt, 'vtrui'), {recursive: true});
const read = file => fs.readFileSync(path.join(repo, file), 'utf8');
const vless = {domain: 'vless.example:443', name: 'VLESS', uuid: '00000000-0000-4000-8000-000000000001', path: '/vless', tls: 'vless.example', protocol: 'vless'};
const vmess = {...vless, name: 'legacy', protocol: 'vmess'};
const config = path.join(opt, '0conf');
const runtime = path.join(opt, 'vtrui/config.json');
const before = {v2node: [vless, vmess, {...vmess, protocol: undefined}], untouched: true};
for (const file of ['client', 'resource/client/ui-script/ui-NodeSave']) {
  fs.writeFileSync(config, JSON.stringify(before));
  const cleanup = read(file).split('\n').find(line => line.startsWith("jq '.v2node |= map(select(.protocol"));
  assert(cleanup, file);
  const result = cp.spawnSync('/bin/bash', ['-c', `sponge() { local data; data=$(cat); printf '%s\\n' "$data" > "$1"; }\n` + cleanup.replaceAll('/opt/de_GWD', opt)], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(config, 'utf8')), {...before, v2node: [vless]});
}
fs.writeFileSync(config, JSON.stringify({update: {v2node: vmess}}));
fs.writeFileSync(runtime, JSON.stringify({outbounds: [{tag: 'untouched'}]}));
const originalRuntime = fs.readFileSync(runtime, 'utf8');
const rejectedRebuild = cp.spawnSync('/bin/bash', ['-c', read('resource/client/ui-script/ui-NodeOne').replaceAll('/opt/de_GWD', opt)], {encoding: 'utf8'});
assert.notEqual(rejectedRebuild.status, 0);
assert.equal(fs.readFileSync(runtime, 'utf8'), originalRuntime);

const php = read('resource/client/ui-web/act/NodeSave.php')
  .replace("<?php require_once('../auth.php'); ?>", '<?php $auth = true; ?>')
  .replaceAll('/opt/de_GWD/0conf', config)
  .replace("exec('sudo /opt/de_GWD/ui-NodeSave r &');", '');
for (const nodes of [[vmess], [{...vless, protocol: undefined}], [vless], []]) {
  fs.writeFileSync(config, JSON.stringify(before));
  const encoded = Buffer.from(JSON.stringify({nodeList: nodes})).toString('base64');
  const script = path.join(root, 'save.php');
  fs.writeFileSync(script, `<?php $_GET = json_decode(base64_decode('${encoded}'), true); ?>` + php);
  const result = cp.spawnSync(process.env.PHP_BIN || 'php', [script], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  const saved = JSON.parse(fs.readFileSync(config, 'utf8'));
  if (nodes.some(node => node.protocol !== 'vless')) {
    assert.match(result.stdout, /Only VLESS nodes are supported/);
    assert.deepEqual(saved, JSON.parse(JSON.stringify(before)));
  } else {
    assert.deepEqual(saved.v2node, nodes);
    assert.equal(saved.untouched, true);
  }
}
assert.doesNotMatch(read('resource/client/ui-web/nodes.php'), /option value="vmess"/);
for (const file of ['resource/client/ui-script/ui-FWD1save', 'resource/client/ui-script/ui-RproxyCsave']) {
  const original = cp.execFileSync('git', ['show', `HEAD:${file}`], {cwd: repo, encoding: 'utf8'});
  assert.equal(read(file), original, 'Internal tunnel protocol must remain unchanged');
}
console.log('PASS: VLESS-only node cleanup, PHP save validation, rejected legacy rebuild, and unchanged internal tunnels');
