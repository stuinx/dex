const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('resource/client/ui-web/forward.php');
const save = read('resource/client/ui-script/ui-FWD1save');
const status = read('resource/client/ui-script/ui-checkFWD1');
const pageScript = page.slice(page.indexOf('function buttonFWD1upstream'), page.indexOf('function buttonFWD1save'));
assert(/protocol\s*\?\?[^\n]*!==\s*['"]vless['"]/i.test(page), 'FWD1 list must only offer VLESS nodes');
assert(/substr\(\$node->path,\s*0,\s*1\)\s*!==\s*['"]\/['"]/.test(page), 'FWD1 list must only offer nodes with a WebSocket path');
assert(/json_encode\([^\n]*uuid/i.test(page), 'FWD1 option value must carry full node identity');
assert(/fromjson/.test(save), 'FWD1 save must parse the selected node identity');
for (const field of ['domain', 'uuid', 'path']) {
  assert(new RegExp(`\\.value\\.${field}\\s*==`).test(save), `FWD1 save must match ${field}`);
}
assert(/\.value\.tls\s*==\s*\(\$selected\.tls/.test(save), 'FWD1 save must match the selected TLS server name');
assert(/\.value\.protocol\s*==\s*"vless"/.test(save), 'FWD1 save must reject non-VLESS nodes');
assert(/\.value\.protocol\s*==\s*\$selected\.protocol/.test(save), 'FWD1 save must match the selected protocol identity');
assert(/length\s*==\s*1/.test(save), 'FWD1 save must reject ambiguous or missing upstreams');
assert(/vnext\[0\]\.users\[0\]\.id/.test(status), 'FWD1 status must distinguish upstream UUIDs');
assert(/wsSettings\.path/.test(status), 'FWD1 status must distinguish upstream paths');
assert(/tlsSettings\.serverName/.test(status), 'FWD1 status must distinguish upstream TLS names');
assert(/\$\(buttonFWD1upstream\)\.val\(\)/.test(pageScript), 'FWD1 dropdown must read the clicked option value directly');
assert(/\.domain == \(\$address \+ ":" \+ \$port\)/.test(status), 'FWD1 status must match explicit host:443 node addresses');
const filter = save.match(/v2nodeID=\$\(jq -r --arg upstream "\$FWD1upstream" '([\s\S]*?)' \/opt\/de_GWD\/0conf/);
assert(filter, 'FWD1 save must expose its jq node identity matcher');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-fwd1-identity-'));
try {
  const nodes = [
    {domain: 'same.example:443', uuid: '00000000-0000-4000-8000-000000000001', path: '/shared', protocol: 'vless', tls: 'sni-one.example'},
    {domain: 'same.example:443', uuid: '00000000-0000-4000-8000-000000000001', path: '/shared', protocol: 'vless', tls: 'sni-two.example'},
    {domain: 'tcp.example:443', uuid: '00000000-0000-4000-8000-000000000003', path: '', protocol: 'vless'},
  ];
  const config = path.join(fixture, '0conf');
  fs.writeFileSync(config, JSON.stringify({v2node: nodes}));
  const selected = JSON.stringify({...nodes[1]});
  const result = cp.spawnSync('jq', ['-r', '--arg', 'upstream', selected, filter[1], config], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '1', 'same-address nodes must resolve by UUID, path, and TLS name');
  const legacy = cp.spawnSync('jq', ['-r', '--arg', 'upstream', nodes[0].domain, filter[1], config], {encoding: 'utf8'});
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.equal(legacy.stdout.trim(), '', 'ambiguous legacy address-only selection must be rejected');
} finally {
  fs.rmSync(fixture, {recursive: true, force: true});
}
console.log('PASS: FWD1 upstream selection is VLESS WS-only and keyed by full node identity');
