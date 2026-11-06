const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-web-safety-'));
const opt = path.join(root, 'opt/de_GWD');
const act = path.join(root, 'act');
const bin = path.join(root, 'bin');
const read = file => fs.readFileSync(path.join(repo, file), 'utf8');
const rewrite = source => source.replaceAll('/opt/de_GWD', opt);
const php = process.env.PHP_BIN || 'php';
fs.mkdirSync(path.join(opt, 'vtrui'), {recursive: true});
fs.mkdirSync(act);
fs.mkdirSync(bin);
fs.copyFileSync(path.join(repo, 'resource/client/ui-web/act/_request.php'), path.join(act, '_request.php'));
const marker = path.join(root, 'must-not-exist');
function endpoint(name, params, auth = true) {
  const source = read(`resource/client/ui-web/act/${name}.php`)
    .replace("<?php require_once('../auth.php'); ?>", `<?php $auth = ${auth ? 'true' : 'false'}; ?>`)
    .replace(/\bexec\(/g, 'fixture_exec(').replace(/\bpassthru\(/g, 'fixture_passthru(');
  const params64 = Buffer.from(JSON.stringify(params)).toString('base64');
  const prelude = `<?php $_GET=json_decode(base64_decode('${params64}'),true); $calls=[];
    function fixture_exec($cmd, &$output=null, &$status=null) {global $calls; $calls[]=$cmd; $output=[]; $status=0; return '';}
    function fixture_passthru($cmd) {global $calls; $calls[]=$cmd;}
    register_shutdown_function(function(){global $calls; echo "\\nFIXTURE:".json_encode(['status'=>http_response_code(),'calls'=>$calls]);}); ?>`;
  const script = path.join(act, `${name}.php`);
  fs.writeFileSync(script, prelude + rewrite(source));
  const result = cp.spawnSync(php, [script], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  const [body, metadata] = result.stdout.split('\nFIXTURE:');
  return {...JSON.parse(metadata), body};
}
function writeConfig(value) {fs.writeFileSync(path.join(opt, '0conf'), JSON.stringify(value));}
const specialPath = '/quote"back\\slash<&';
const node = {domain: 'fixture.example:443', tls: 'fixture.example', uuid: '00000000-0000-4000-8000-000000000001', path: specialPath, protocol: 'vless', name: '\"><img src=x onerror=alert(1)>'};
try {
  writeConfig({v2node: [node], untouched: true});
  for (const name of ['checkDDNSip', 'pingTCP', 'pingTCPDOH1', 'pingTCPDOH2', 'pingTCPDoG', 'speedT', 'testBaidu', 'testGlobal', 'uptime']) {
    const result = endpoint(name, {}, false);
    assert.equal(result.status, 401, name);
    assert.deepEqual(result.calls, [], name);
  }
  for (const [name, key] of [['NodeChange','nodenum'], ['NodeCUchange','nodeCUnum'], ['NodeDTchange','nodeDTnum'], ['WGgenCkey','WGnum'], ['WGqr','WGnum'], ['pingTCP','pingTCP'], ['speedT','speedT'], ['autoUpdateHour','autoUpdateHourINDEX']]) {
    const malicious = `0; touch ${marker}`;
    for (const value of [malicious, ['0'], '-1']) {
      const result = endpoint(name, {[key]: value});
      assert.equal(result.status, 400, name);
      assert.deepEqual(result.calls, [], name);
    }
    const result = endpoint(name, {[key]: name === 'WGqr' ? '1' : '0'});
    assert.notEqual(result.status, 400, name);
    assert(result.calls.length, name);
  }
  for (const name of ['getNFSlist', 'offNFS']) {
    const key = name === 'offNFS' ? 'NFSpoint' : 'NFSserver';
    assert.equal(endpoint(name, {[key]: 'x\n; touch '+marker}).status, 400);
  }
  const mount = `/mnt/a' ; touch ${marker}`;
  const mountResult = endpoint('offNFS', {NFSpoint: mount});
  const shell = cp.spawnSync('/bin/bash', ['-c', 'sudo() { printf "%s\\n" "$@"; }; '+mountResult.calls[0]], {encoding:'utf8'});
  assert.equal(shell.status, 0, shell.stderr);
  assert(shell.stdout.includes(mount), 'quoted mount argument must remain literal');
  assert(!fs.existsSync(marker));
  const corrupt = '{invalid';
  fs.writeFileSync(path.join(opt, '0conf'), corrupt);
  assert.equal(endpoint('NodeSave', {nodeList: [node]}).status, 500);
  assert.equal(fs.readFileSync(path.join(opt, '0conf'), 'utf8'), corrupt);
  writeConfig({v2node: [], untouched: true});
  assert.notEqual(endpoint('NodeSave', {nodeList: [node]}).status, 500);
  assert.equal(JSON.parse(fs.readFileSync(path.join(opt, '0conf'))).v2node[0].path, specialPath);

  const page = read('resource/client/ui-web/nodes.php');
  const fragment = page.slice(page.indexOf('$de_GWDconf->v2node = array_values'), page.indexOf('?>', page.indexOf('$de_GWDconf->v2node = array_values')));
  const render = cp.spawnSync(php, ['-r', `$de_GWDconf=json_decode(base64_decode('${Buffer.from(JSON.stringify({v2node:[node]})).toString('base64')}')); ${fragment}`], {encoding:'utf8'});
  assert.equal(render.status, 0, render.stderr);
  assert(!render.stdout.includes('<img'));
  assert(render.stdout.includes('&quot;&gt;&lt;img'));
  assert(!page.includes('value="${tlsValue}"'));
  assert(page.includes(".val(tlsValue)"));

  for (const name of ['ui-V2outbound', 'ui-NodeChange', 'ui-NodeOne', 'ui-speedT', 'ui-pingTCP']) {
    fs.writeFileSync(path.join(opt, name), rewrite(read('resource/client/ui-script/'+name)), {mode:0o755});
  }
  fs.writeFileSync(path.join(bin, 'systemctl'), '#!/bin/bash\nexit 0\n', {mode:0o755});
  const environment = {...process.env, PATH:bin+':'+process.env.PATH};
  const runtime = path.join(opt, 'vtrui/config.json');
  const run = (name,args=[]) => cp.spawnSync('/bin/bash', [path.join(opt,name),...args], {encoding:'utf8', env:environment});
  writeConfig({v2node:[node], update:{v2node:{...node,domain:'fixture.example',port:'443'}}, untouched:true});
  fs.writeFileSync(runtime, JSON.stringify({outbounds:[{tag:'default'},{tag:'direct',protocol:'freedom'}]}));
  fs.chmodSync(runtime, 0o640);
  let result = run('ui-NodeChange',['0']);
  assert.equal(result.status, 0, result.stderr);
  writeConfig({v2node:[{...node,domain:'fixture.example'}],update:{v2node:{}},untouched:true});
  result = run('ui-NodeChange',['0']);
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(runtime)).outbounds[0].settings.vnext[0].port,443);
  let generated = JSON.parse(fs.readFileSync(runtime));
  assert.equal(generated.outbounds[0].streamSettings.wsSettings.path, specialPath);
  assert.equal(generated.outbounds[1].tag,'direct');
  assert.equal(fs.statSync(runtime).mode & 0o777, 0o640);
  let config = JSON.parse(fs.readFileSync(path.join(opt,'0conf')));
  assert.equal(config.update.v2node.path,specialPath);
  assert.equal(config.v2nodeDIV.outboundNodes.default.tls,node.tls);
  result = run('ui-NodeOne');
  assert.equal(result.status, 0, result.stderr);
  generated = JSON.parse(fs.readFileSync(runtime));
  assert.equal(generated.outbounds[0].streamSettings.wsSettings.path,specialPath);
  assert.equal(generated.outbounds[1].protocol,'freedom');
  const originalRuntime = fs.readFileSync(runtime,'utf8');
  writeConfig({v2node:[node], update:{v2node:{...node,domain:'invalid/host',port:'443'}}});
  const originalConfig = fs.readFileSync(path.join(opt,'0conf'),'utf8');
  result = run('ui-NodeOne');
  assert.notEqual(result.status,0);
  assert.equal(fs.readFileSync(runtime,'utf8'),originalRuntime,'failed rebuild must preserve runtime');
  assert.equal(fs.readFileSync(path.join(opt,'0conf'),'utf8'),originalConfig);
  fs.writeFileSync(runtime,corrupt);
  result = run('ui-NodeChange',['0']);
  assert.notEqual(result.status,0);
  assert.equal(fs.readFileSync(runtime,'utf8'),corrupt);
  assert.equal(fs.readFileSync(path.join(opt,'0conf'),'utf8'),originalConfig);

  writeConfig({v2node:[node]});
  const callsFile = path.join(root,'network-calls');
  fs.writeFileSync(path.join(bin,'timeout'),'#!/bin/bash\nprintf "%s\\n" "$@" >"$FIXTURE_CALLS"\n', {mode:0o755});
  environment.FIXTURE_CALLS = callsFile;
  result = run('ui-speedT',['0']);
  assert.equal(result.status,0,result.stderr);
  const argumentsList = fs.readFileSync(callsFile,'utf8').trim().split('\n');
  assert.equal(argumentsList[0],'30');
  assert(argumentsList.includes('--tries=1'));
  assert(argumentsList.includes('--read-timeout=10'));
  fs.rmSync(callsFile);
  result = run('ui-speedT',['0; touch '+marker]);
  assert.notEqual(result.status,0);
  assert(!fs.existsSync(callsFile));
  assert(!fs.existsSync(marker));
  console.log('PASS: Web authentication, literal shell arguments, corrupt-config rejection, escaped node HTML, JSON-safe paths, failed-build preservation and bounded speed tests');
} finally {
  fs.rmSync(root,{recursive:true,force:true});
}
