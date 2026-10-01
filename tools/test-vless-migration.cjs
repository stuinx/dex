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
const funcs = ['mainInbound','extraVmessWSNginxConf','nginxWebConf','XrayInbound','extra_settingsOrDefault',
  'extra_validateSettings','extraNginxWebConf','extraXrayInbounds','extra_applyCandidate','extra_printNodes','extra_uriEncode','extra_vlessWSUrl','mainMigrate','extra_vmessWS','extra_vlessWS',
  'deGWD_featureValidPort','deGWD_featureValidUUID','deGWD_featureValidHost','deGWD_featureUUID','deGWD_featureParseHostPort',
  'extra_validPort','extra_validUUID','extra_validHost','extra_parseDomainPort'];
const prelude = `set -eo pipefail
sponge() { local data; data=$(cat); printf '%s\\n' "$data" > "$1"; }
qrencode() { :; }
${process.platform === 'darwin' ? `sed() { if [[ $1 = -i ]]; then shift; command sed -i '' "$@"; else command sed "$@"; fi; }` : ''}
systemctl() { [[ $1 != is-active ]] || echo active; }
nginx() { [[ \${FAIL_NGINX:-0} != 1 ]]; }
extra_mainDomain() { echo example.test; }
extra_mainPort() { echo 443; }
extra_portAvailable() { return 0; }
extra_certificateCovers() { return 0; }
extraSettings='${opt}/extra-inbounds.json'
extraVlessWSConf='${nginx}/vless-ws.conf'
legacyVmessConf='${nginx}/vmess.conf'
extraVmessWSConf='${nginx}/vmess-ws.conf'
`;
// The config test invocation is mocked here; native Xray validation is a separate check.
const functions = rewrite(funcs.map(n => fn(n)).join('\n')).replaceAll(opt + '/vtrui/vtrui run -test -confdir ' + opt + '/vtrui', 'true');
function run(body, args=[]) {
  const uuidMock = `deGWD_featureUUID() { printf '%s\\n' '11111111-1111-4111-8111-111111111111'; }`;
  const result = cp.spawnSync('/bin/bash', ['-c', prelude + functions + '\n' + uuidMock + '\n' + rewrite(body), 'test', ...args], {encoding:'utf8',timeout:15000});
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
  assert.equal(config.inbounds[0].port,9890);
  assert.equal(config.inbounds[0].streamSettings.wsSettings.path,'/legacy');
  assert.equal(config.inbounds[0].settings.decryption,'none');
  assert(!('alterId' in config.inbounds[0].settings.clients[0]));
  assert.equal(config.inbounds.filter(i=>i.tag==='extra-vmess').length,0);
  assert.deepEqual(config.outbounds,old.outbounds);
  assert(!('vmess' in read('extra-inbounds.json')));
  fs.writeFileSync(root + '/server-migrated.json',JSON.stringify(config,null,2));
  const migrated = fs.readFileSync(opt + '/vtrui/config.json','utf8');
  run('mainMigrate');
  assert.equal(fs.readFileSync(opt + '/vtrui/config.json','utf8'),migrated);
  const migratedNginx=fs.readFileSync(nginx + '/default.conf','utf8');
  assert(migratedNginx.includes('location /legacy'));
  assert(!migratedNginx.includes('VMESS_COMPAT'));
  run('extra_vmessWS <<< $\'1\\nvmess-ws.example:55445\\n\'');
  assert(!('vmess' in read('extra-inbounds.json')));
  assert.equal(read('vtrui/config.json').inbounds.filter(i=>i.tag==='extra-vmess').length,0);
  assert.equal(read('vtrui/config.json').inbounds.filter(i=>i.tag==='extra-vmess-ws').length,1);
  run('extra_vmessWS <<< $\'2\\n\'');
  assert.equal(read('extra-inbounds.json').vmess_ws.enabled,false);
  // Reorder inbounds to prove tag-based selection during later menu operations.
  config.inbounds.reverse(); write('vtrui/config.json',config);
  // Fresh install defaults to VLESS, without a compatibility inbound.
  fs.rmSync(opt + '/extra-inbounds.json');
  fs.rmSync(opt + '/vtrui/config.json');
  run(`path=/fresh; uuids=${uuid}; XrayInbound`);
  assert.equal(read('vtrui/config.json').inbounds[0].protocol,'vless');
  assert.equal(read('vtrui/config.json').inbounds.length,1);
  run('extra_vmessWS <<< $\'1\\nvmess-ws.example:55445\\n0\\n\'');
  assert.equal(read('vtrui/config.json').inbounds.filter(i=>i.tag==='extra-vmess-ws').length,1);
  const vmessWSConfig=read('vtrui/config.json').inbounds.find(i=>i.tag==='extra-vmess-ws');
  assert.equal(vmessWSConfig.port,9893);
  assert.match(vmessWSConfig.streamSettings.wsSettings.path,/^\/[A-Za-z0-9_-]{8}$/);
  assert.match(vmessWSConfig.settings.clients[0].id,/^[0-9a-f-]{36}$/);
  const vmessWSSettings=read('extra-inbounds.json');
  assert.equal(vmessWSSettings.vmess_ws.domain,'vmess-ws.example');
  assert.equal(vmessWSSettings.vmess_ws.port,55445);
  assert.match(run('extra_printNodes'),/VMess WebSocket TLS/);
  assert.match(run('extra_printNodes'),/TLS:\s+vmess-ws\.example/);
  assert.match(fs.readFileSync(nginx + '/vmess-ws.conf','utf8'),/server_name vmess-ws\.example;/);
  assert.match(fs.readFileSync(nginx + '/vmess-ws.conf','utf8'),/proxy_pass http:\/\/127\.0\.0\.1:9893/);
  assert.match(fs.readFileSync(nginx + '/vmess-ws.conf','utf8'),/include .*\/\.ssl_certs;/);
  // The original jacyl client passes only address, TLS host, UUID and PATH; omitted protocol means VMess.
  const legacyClientNode={
    domain:vmessWSSettings.vmess_ws.domain+':'+vmessWSSettings.vmess_ws.port,
    tls:vmessWSSettings.vmess_ws.domain,
    uuid:vmessWSSettings.vmess_ws.uuid,
    path:vmessWSSettings.vmess_ws.path
  };
  const configBeforeLegacyClient=read('vtrui/config.json');
  write('0conf',{v2node:[legacyClientNode]});
  write('vtrui/config.json',{outbounds:[]});
  const clientBuilder=fs.readFileSync(path.join(repo,'resource/client/ui-script/ui-V2outbound'),'utf8');
  run(clientBuilder,['vmess-extra',legacyClientNode.domain,legacyClientNode.tls,legacyClientNode.uuid,legacyClientNode.path]);
  const legacyClientOutbound=read('vtrui/config.json').outbounds[0];
  assert.equal(legacyClientOutbound.protocol,'vmess');
  assert.equal(legacyClientOutbound.settings.vnext[0].address,legacyClientNode.domain.split(':')[0]);
  assert.equal(legacyClientOutbound.settings.vnext[0].port,vmessWSSettings.vmess_ws.port);
  assert.equal(legacyClientOutbound.settings.vnext[0].users[0].id,legacyClientNode.uuid);
  assert.equal(legacyClientOutbound.settings.vnext[0].users[0].alterId,0);
  assert.equal(legacyClientOutbound.streamSettings.network,'ws');
  assert.equal(legacyClientOutbound.streamSettings.security,'tls');
  assert.equal(legacyClientOutbound.streamSettings.wsSettings.path,legacyClientNode.path);
  assert.equal(legacyClientOutbound.streamSettings.wsSettings.headers.Host,legacyClientNode.tls);
  assert.equal(legacyClientOutbound.streamSettings.tlsSettings.serverName,legacyClientNode.tls);
  write('vtrui/config.json',configBeforeLegacyClient);
  run('extra_vlessWS <<< $\'1\\nvless-ws.example:55446\\n\'');
  assert.equal(read('vtrui/config.json').inbounds.filter(i=>i.tag==='extra-vmess-ws').length,1);
  assert.equal(read('vtrui/config.json').inbounds.filter(i=>i.tag==='extra-vless-ws').length,1);
  assert.match(fs.readFileSync(nginx + '/vless-ws.conf','utf8'),/include .*\/\.ssl_certs;/);
  run('extra_vlessWS <<< $\'2\\n\'');
  assert.equal(read('vtrui/config.json').inbounds.filter(i=>i.tag==='extra-vless-ws').length,0);
  assert(!fs.existsSync(nginx + '/vless-ws.conf'));
  run('extra_vmessWS <<< $\'2\\n\'');
  assert.equal(read('vtrui/config.json').inbounds.filter(i=>i.tag==='extra-vmess-ws').length,0);
  assert.equal(read('extra-inbounds.json').vmess_ws.enabled,false);
  assert(!fs.existsSync(nginx + '/vmess-ws.conf'));
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
  assert.deepEqual(run(check).trim().split('\n').slice(0,2),['2','new']);
  if(process.env.XRAY_BIN) {
    for(const name of ['server-migrated','client-legacy','client-vmess','client-vless']) {
      const result=cp.spawnSync(process.env.XRAY_BIN,['run','-test','-config',root+'/'+name+'.json'],{encoding:'utf8',timeout:15000});
      assert.equal(result.status,0,name+': '+result.stderr+'\n'+result.stdout);
    }
    console.log('PASS: native Xray configuration validation');
  }
  console.log('PASS: migration, rollback, idempotency, reordered inbounds, VMess/VLESS WS coexistence, fresh install, client protocol preservation');
  console.log('Fixtures: '+root);
  module.exports = root;
} catch(error) { console.error('Fixtures retained: '+root); throw error; }
