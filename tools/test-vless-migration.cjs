// Run installer functions only inside a temporary filesystem, with service operations mocked.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-vless-test-'));
const server = fs.readFileSync(path.join(repo, 'server'), 'utf8');
const opt = root + '/opt/de_GWD';
const nginx = root + '/etc/nginx/conf.d';
fs.mkdirSync(opt + '/vtrui', {recursive:true});
fs.mkdirSync(nginx, {recursive:true});
const rewrite = s => s.replaceAll('/opt/de_GWD', opt).replaceAll('/etc/nginx', root + '/etc/nginx');
function fn(name, source=server) {
  const start = source.indexOf(name + '(){');
  assert(start >= 0, name);
  const rest = source.slice(start);
  const next = rest.slice(name.length + 3).search(/^\w+\(\)\{/m);
  const block = next < 0 ? rest : rest.slice(0, name.length + 3 + next);
  return block.slice(0, block.lastIndexOf('\n}') + 2);
}
const funcs = ['mainInbound','mainVmessLocation','nginxWebConf','XrayInbound','extra_settingsOrDefault',
  'extra_validateSettings','extraNginxWebConf','extraXrayInbounds','extra_applyCandidate','mainMigrate','extra_vmess'];
const prelude = `set -eo pipefail
sponge() { local data; data=$(cat); printf '%s\\n' "$data" > "$1"; }
${process.platform === 'darwin' ? `sed() { if [[ $1 = -i ]]; then shift; command sed -i '' "$@"; else command sed "$@"; fi; }` : ''}
systemctl() { [[ $1 != is-active ]] || echo active; }
nginx() { [[ \${FAIL_NGINX:-0} != 1 ]]; }
extra_mainDomain() { echo example.test; }
extra_mainPort() { echo 443; }
extraSettings='${opt}/extra-inbounds.json'
extraVlessWSConf='${nginx}/vless-ws.conf'
`;
// The config test invocation is mocked here; native Xray validation is a separate check.
const functions = rewrite(funcs.map(n => fn(n)).join('\n')).replaceAll(opt + '/vtrui/vtrui run -test -confdir ' + opt + '/vtrui', 'true');
function run(body, args=[]) {
  const result = cp.spawnSync('/bin/bash', ['-c', prelude + functions + '\n' + rewrite(body), 'test', ...args], {encoding:'utf8',timeout:15000});
  assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
  return result.stdout;
}
const read = p => JSON.parse(fs.readFileSync(opt + '/' + p, 'utf8'));
const write = (p,data) => fs.writeFileSync(opt + '/' + p, JSON.stringify(data));
const uuid = '00000000-0000-4000-8000-000000000001';
const old = {inbounds:[{listen:'127.0.0.1',port:9890,protocol:'vmess',settings:{clients:[{id:uuid,alterId:0},{id:'00000000-0000-4000-8000-000000000002',alterId:0}]},streamSettings:{network:'ws',security:'none',wsSettings:{path:'/legacy'}}}],outbounds:[{tag:'direct',protocol:'freedom'}],routing:{rules:[]}};
function reset() {
  write('vtrui/config.json',old);
  fs.writeFileSync(nginx + '/default.conf','upstream xray {\n server 127.0.0.1:9890;\n}\nserver {\n# V2_START\nlocation /legacy {\n proxy_pass http://xray;\n}\n# V2_END\n}\n');
  fs.rmSync(opt + '/extra-inbounds.json',{force:true});
}
try {
  reset();
  const before = fs.readFileSync(opt + '/vtrui/config.json','utf8');
  const beforeNginx = fs.readFileSync(nginx + '/default.conf','utf8');
  run('FAIL_NGINX=1; if mainMigrate; then exit 7; fi');
  assert.equal(fs.readFileSync(opt + '/vtrui/config.json','utf8'),before);
  assert.equal(fs.readFileSync(nginx + '/default.conf','utf8'),beforeNginx);
  assert(!fs.existsSync(opt + '/extra-inbounds.json'));
  run('mainMigrate');
  let config = read('vtrui/config.json');
  assert.equal(config.inbounds[0].protocol,'vless');
  assert.equal(config.inbounds[0].tag,'main');
  assert.equal(config.inbounds[0].port,9892);
  assert.equal(config.inbounds[0].streamSettings.wsSettings.path,'/legacy-vless');
  assert.equal(config.inbounds[0].settings.decryption,'none');
  assert(!('alterId' in config.inbounds[0].settings.clients[0]));
  assert.deepEqual(config.inbounds.find(i=>i.tag==='extra-vmess'),{...old.inbounds[0],tag:'extra-vmess'});
  assert.deepEqual(config.outbounds,old.outbounds);
  fs.writeFileSync(root + '/server-migrated.json',JSON.stringify(config,null,2));
  const migrated = fs.readFileSync(opt + '/vtrui/config.json','utf8');
  run('mainMigrate');
  assert.equal(fs.readFileSync(opt + '/vtrui/config.json','utf8'),migrated);
  assert(fs.readFileSync(nginx + '/default.conf','utf8').includes('location = /legacy'));
  // Reorder inbounds to prove tag-based selection during later menu operations.
  config.inbounds.reverse(); write('vtrui/config.json',config);
  run('extra_vmess <<< $\'2\\n0\\n\'');
  config=read('vtrui/config.json');
  assert.equal(config.inbounds.length,1);
  assert.equal(config.inbounds[0].streamSettings.wsSettings.path,'/legacy-vless');
  run('extra_vmess <<< $\'1\\n0\\n\'');
  assert.equal(read('vtrui/config.json').inbounds.length,2);
  // Fresh install defaults to VLESS, without a compatibility inbound.
  fs.rmSync(opt + '/extra-inbounds.json');
  fs.rmSync(opt + '/vtrui/config.json');
  run(`path=/fresh; uuids=${uuid}; XrayInbound`);
  assert.equal(read('vtrui/config.json').inbounds[0].protocol,'vless');
  assert.equal(read('vtrui/config.json').inbounds.length,1);
  run('extra_vmess <<< $\'1\\n0\\n\'');
  assert.equal(read('vtrui/config.json').inbounds.find(i=>i.tag==='extra-vmess').streamSettings.wsSettings.path,'/fresh-vmess');
  // Client scripts: absent protocol stays VMess, VLESS survives node changes and rebuilds.
  for (const protocol of [undefined,'vmess','vless']) {
    const node={domain:'example.test:443',tls:'example.test',uuid,path:'/fresh',protocol};
    write('0conf',{v2node:[node],update:{v2node:{...node,domain:'example.test',port:'443'}}});
    for (const name of ['ui-NodeChange','ui-changeNodeSS0','ui-V2outbound']) {
      write('vtrui/config.json',{outbounds:[]});
      const source=fs.readFileSync(path.join(repo,'resource/client/ui-script',name),'utf8').replace(/^chmod .*$/mg,'');
      run(source, name==='ui-V2outbound' ? ['default',node.domain,node.tls,uuid,node.path] : ['0']);
      const outbound=read('vtrui/config.json').outbounds[0];
      assert.equal(outbound.protocol,protocol||'vmess');
      assert.equal(outbound.streamSettings.sockopt.mark,255);
      if(protocol==='vless') {
        assert.equal(outbound.settings.vnext[0].users[0].encryption,'none');
        assert(!('alterId' in outbound.settings.vnext[0].users[0]));
      }
      fs.writeFileSync(root + '/client-' + (protocol||'legacy') + '.json',JSON.stringify({outbounds:[outbound]},null,2));
    }
  }
  const both=[{domain:'example.test',tls:'example.test',uuid,path:'/legacy',name:'old'},
    {domain:'example.test',tls:'example.test',uuid,path:'/new',protocol:'vless',name:'new'}];
  write('0conf',{v2node:both});
  write('vtrui/config.json',{outbounds:[]});
  const builder=fs.readFileSync(path.join(repo,'resource/client/ui-script/ui-V2outbound'),'utf8');
  run('set +e\n'+builder,['nodeSMyoutube','example.test','example.test',uuid,'/new']);
  write('vtrui/config.json',{outbounds:[]});
  run('set +e\n'+builder,['nodeSMyoutube','example.test','example.test\nexample.test',uuid+'\n'+uuid,'/legacy\n/new']);
  assert.equal(read('vtrui/config.json').outbounds[0].protocol,'vless');
  assert.equal(read('vtrui/config.json').outbounds[0].streamSettings.wsSettings.path,'/new');
  const check=fs.readFileSync(path.join(repo,'resource/client/ui-script/ui-NodeSMcheck'),'utf8').split('\n\n\n')[0];
  assert.equal(run(check).trim(),'2\nnew');
  if(process.env.XRAY_BIN) {
    for(const name of ['server-migrated','client-legacy','client-vmess','client-vless']) {
      const result=cp.spawnSync(process.env.XRAY_BIN,['run','-test','-config',root+'/'+name+'.json'],{encoding:'utf8',timeout:15000});
      assert.equal(result.status,0,name+': '+result.stderr+'\n'+result.stdout);
    }
    console.log('PASS: native Xray configuration validation');
  }
  console.log('PASS: migration, rollback, idempotency, reordered inbounds, compatibility toggle, fresh install, client protocol preservation');
  console.log('Fixtures: '+root);
  module.exports = root;
} catch(error) { console.error('Fixtures retained: '+root); throw error; }
