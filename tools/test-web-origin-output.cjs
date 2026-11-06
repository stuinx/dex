const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-web-origin-'));
const php = process.env.PHP_BIN || 'php';
const read = file => fs.readFileSync(path.join(repo, file), 'utf8');
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64');
try {
  const auth = read('resource/client/ui-web/auth.php').replace("file_get_contents('/opt/de_GWD/0conf')", "json_encode(array('address'=>array('PWD'=>hash('sha256',hash('sha256','fixture-password')))))");
  const cases = [
    [{HTTP_SEC_FETCH_SITE:'cross-site'},403],
    [{HTTP_ORIGIN:'https://evil.example'},403],
    [{HTTP_REFERER:'https://evil.example/path'},403],
    [{HTTP_ORIGIN:'null'},403],
    [{HTTP_ORIGIN:'http://fixture.example:8443'},403],
    [{HTTP_ORIGIN:'https://fixture.example'},403],
    [{HTTP_ORIGIN:'https://fixture.example:8443',HTTP_REFERER:'https://evil.example'},403],
    [{HTTP_ORIGIN:'https://FIXTURE.example:8443',HTTP_REFERER:'https://fixture.example:8443/index.php',HTTP_SEC_FETCH_SITE:'same-origin'},200],
    [{HTTP_HOST:'fixture.example',HTTP_ORIGIN:'https://fixture.example:443'},200],
    [{HTTP_HOST:'[::1]:8443',HTTP_ORIGIN:'https://[::1]:8443'},200],
    [{HTTPS:'off',HTTP_HOST:'fixture.example',HTTP_ORIGIN:'http://fixture.example:80'},200],
    [{HTTPS:'off',HTTP_HOST:'fixture.example',HTTP_X_FORWARDED_PROTO:'https',HTTP_ORIGIN:'https://fixture.example'},403],
    [{},200],
  ];
  for (let i=0;i<cases.length;i++) {
    const [headers,expected] = cases[i];
    const sessions = path.join(root,'sessions-'+i);
    fs.mkdirSync(sessions);
    const server = {SCRIPT_NAME:'/act/NodeSave.php',HTTPS:'on',HTTP_HOST:'fixture.example:8443',...headers};
    const script = path.join(root,'auth-'+i+'.php');
    const prelude = `<?php session_save_path('${sessions}'); $_SERVER=json_decode(base64_decode('${encode(server)}'),true); $_GET=['gwdpw'=>'fixture-password']; register_shutdown_function(function(){global $auth; echo "\\nFIXTURE:".json_encode(['status'=>http_response_code()?:200,'auth'=>$auth??false,'cookie'=>session_get_cookie_params(),'session'=>session_status()]);}); ?>`;
    fs.writeFileSync(script,prelude+auth);
    const result = cp.spawnSync(php,[script],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const metadata=JSON.parse(result.stdout.split('\nFIXTURE:')[1]);
    assert.equal(metadata.status,expected,JSON.stringify(headers));
    assert.equal(metadata.auth,expected===200);
    if (expected===403) {
      assert.deepEqual(fs.readdirSync(sessions),[],'rejected source must not start or write a session');
    } else {
      assert.equal(metadata.cookie.httponly,true);
      assert.equal(metadata.cookie.samesite,'Strict');
      assert.equal(metadata.cookie.secure,server.HTTPS!=='off');
      assert.equal(metadata.session,1,'auth must release the session lock');
    }
  }

  const attack='\"><img/src=x/onerror=alert(1)></textarea><script>alert(1)</script>&';
  const uuid='00000000-0000-4000-8000-000000000001';
  const fixture={
    address:{alias:attack,autoUpdateHour:'off',localIP:attack,upstreamIP:attack},
    app:{jellyfin:'',bitwarden:''},
    v2node:[{domain:'fixture.example:443',tls:'fixture.example',uuid,path:'/path'+attack,name:attack,protocol:'vless'}],
    v2nodeDIV:{nodeDT:{CHNlistProxyIP:[attack],globalProxyIP:[attack],directProxyIP:[attack]},nodeCU:{rulesDomain:[attack],rulesIP:[attack]},ss:{ssAddress:attack,ssPort:attack,ssMethod:attack,ssSecure:attack}},
    dns:{dog:attack,doh:[attack,attack],listB:[attack],listW:[attack]},
    FORWARD:{domain:attack,APIkey:attack,Email:attack,block53:'off',DoGs:{port:attack},FWD0:{port:'443',uuid:[{FWD0uuid:uuid,FWD0mark:attack}]},FWD1:{port:'443',uuid:[{FWD1uuid:uuid,FWD1mark:attack}]},Rproxy:{server:{tunnel:{port:attack,uuid:attack},inStatus:'off',inUUID:[{RproxyS0uuid:attack,RproxyS0mark:attack}],mapping:[{port:attack,protocol:attack}]},client:{tunnel:{address:attack,uuid:attack},mapping:[{extPort:attack,extProtocol:attack,intIP:attack,intPort:attack}]}}},
    ddns:{ddns3322:{domain:attack,user:attack,pwd:attack},ddnsCF:{cfDomain:attack,cfAPIkey:attack,cfEmail:attack}},
    wireguard:{server:{sprivatekey:attack,spublickey:attack,WGaddress:attack,WGport:attack},clients:[{cprivatekey:attack,cpublickey:attack,mark:attack}]},
    update:{updateAddr:attack,updatePort:attack,updateCMD:attack},
  };
  for(const page of ['index','forward','ddns','app','nodes','update']) {
    let source=read(`resource/client/ui-web/${page}.php`).replace("<?php require_once('auth.php'); ?>",'<?php $auth=true; ?>');
    source=source.replace(/\bfile_get_contents\s*\(/g,'fixture_read(').replace(/\bfile_exists\(/g,'fixture_exists(').replace(/\bexec\(/g,'fixture_exec(').replace(/\bshell_exec\(/g,'fixture_shell(').replace(/\bpassthru\(/g,'fixture_passthru(');
    const prefix=`<?php $fixture=json_decode(base64_decode('${encode(fixture)}')); $attack=json_decode(base64_decode('${encode(attack)}')); foreach(['installed','active','on','off','block'] as $constant) define($constant,$constant);
      function fixture_read($file){global $fixture,$attack;if($file==='/opt/de_GWD/0conf')return json_encode($fixture);if(strpos($file,'default.conf')!==false)return 'server_name fixture.example;';if(strpos($file,'smartdns.conf')!==false)return 'server '.$attack."\\n";if(strpos($file,'corefile')!==false)return 'grpc://.:777';return json_encode(['inbounds'=>[[],[]],'outbounds'=>[]]);}
      function fixture_exists($file){return true;}
      function fixture_exec($cmd){return '';}
      function fixture_shell($cmd){global $attack;if(strpos($cmd,'nfsstat')!==false)return '/mnt/'.$attack.' from fixture.example:/'.$attack."\\n";if(strpos($cmd,'ui-checkFWD1')!==false)return $attack."\\n".$attack;return $attack;}
      function fixture_passthru($cmd){if(strpos($cmd,'ui-checkEditionARM')!==false)echo 'amd64';}
      ?>`;
    const script=path.join(root,page+'.php');
    fs.writeFileSync(script,prefix+source);
    const result=cp.spawnSync(php,['-d','display_errors=0',script],{encoding:'utf8'});
    assert.equal(result.status,0,page+': '+result.stderr);
    assert(!result.stdout.includes('<img/src=x/onerror=alert(1)>'),page+' must not emit saved markup');
    assert(!result.stdout.includes('</textarea><script>alert(1)</script>'),page+' must not close a textarea with saved text');
    assert(result.stdout.includes('&quot;&gt;&lt;img/src=x/onerror=alert(1)&gt;'),page+' must retain encoded saved text');
    if(page==='index') {assert(result.stdout.includes('id="nodeDomain0"'));assert(result.stdout.includes('id="nodeshow0">&quot;&gt;&lt;img'));}
    if(page==='ddns') {assert(result.stdout.includes('id="WGmark0"'));assert(!result.stdout.includes('{\\$'));}
    const alias=result.stdout.match(/id="markName"[^>]*value="([^"]*)"/);
    assert(alias,page);
    const decoded=alias[1].replaceAll('&quot;','"').replaceAll('&#039;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
    assert.equal(decoded,attack,page+' input value must round-trip unchanged');
  }
  const index=read('resource/client/ui-web/index.php');
  assert(index.includes('.text(nodeSMname)'));
  assert(!index.includes('.html(data)'));
  const app=read('resource/client/ui-web/app.php');
  assert(!app.includes('>${NFSlistLine}</li>'));
  assert(app.includes('.text(NFSlistLine)'));
  console.log('PASS: browser origin checks reject before session writes, same-origin/default ports/IPv6/CLI remain compatible, cookies and lock release are checked, and six pages preserve text without rendering saved markup');
} finally {fs.rmSync(root,{recursive:true,force:true});}
