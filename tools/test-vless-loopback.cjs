// Optional native Xray data-plane test. TLS/Nginx and Linux TProxy need Debian acceptance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');
const dgram = require('node:dgram');
const cp = require('node:child_process');
const {promisify} = require('node:util');
assert(process.env.XRAY_BIN, 'Set XRAY_BIN to an Xray executable');
const root = require('./test-vless-migration.cjs');
const children=[];
async function listen(server) {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return server.address().port;
}
async function freePort() {
  const server=net.createServer(); const port=await listen(server);
  await new Promise(r=>server.close(r)); return port;
}
async function launch(name,config,port) {
  const file=root+'/'+name+'.json'; fs.writeFileSync(file,JSON.stringify(config));
  const child=cp.spawn(process.env.XRAY_BIN,['run','-config',file],{stdio:['ignore','pipe','pipe']});
  children.push(child); let log='';
  child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
  for(let i=0;i<100;i++) {
    assert(child.exitCode===null,name+' exited: '+log);
    const ready=await new Promise(resolve=>{
      const socket=net.connect(port,'127.0.0.1');
      socket.on('connect',()=>{socket.destroy();resolve(true);});
      socket.on('error',()=>resolve(false));
    });
    if(ready)return;
    await new Promise(r=>setTimeout(r,50));
  }
  throw Error(name+' listener timed out: '+log);
}
function socksUDP(port,target) {
  return new Promise((resolve,reject)=>{
    const tcp=net.connect(port,'127.0.0.1');const udp=dgram.createSocket('udp4');
    let stage=0,buffer=Buffer.alloc(0);
    const timer=setTimeout(()=>finish(Error('UDP timeout')),5000);
    function finish(error) { clearTimeout(timer);tcp.destroy();udp.close();error?reject(error):resolve(); }
    udp.bind(0,'127.0.0.1');
    tcp.on('error',finish);udp.on('error',finish);
    tcp.on('connect',()=>tcp.write(Buffer.from([5,1,0])));
    tcp.on('data',data=>{
      buffer=Buffer.concat([buffer,data]);
      if(stage===0 && buffer.length>=2) {
        if(buffer[1]!==0)return finish(Error('SOCKS authentication failed'));
        buffer=buffer.subarray(2);stage=1;tcp.write(Buffer.from([5,3,0,1,0,0,0,0,0,0]));
      }
      if(stage===1 && buffer.length>=10) {
        if(buffer[1]!==0 || buffer[3]!==1)return finish(Error('SOCKS UDP association failed'));
        stage=2;const relay=buffer.readUInt16BE(8);
        const header=Buffer.from([0,0,0,1,127,0,0,1,target>>8,target&255]);
        udp.send(Buffer.concat([header,Buffer.from('dex-udp')]),relay,'127.0.0.1');
      }
    });
    udp.on('message',data=>{try {assert.equal(data.subarray(10).toString(),'dex-udp');finish();}catch(e){finish(e);}});
  });
}
(async()=>{
  const target=http.createServer((req,res)=>res.end('dex-loopback-ok'));
  const udp=dgram.createSocket('udp4');
  try {
    const targetPort=await listen(target);
    await new Promise(r=>udp.bind(0,'127.0.0.1',r));
    udp.on('message',(data,peer)=>udp.send(data,peer.port,peer.address));
    const server=JSON.parse(fs.readFileSync(root+'/server-migrated.json'));
    for(const inbound of server.inbounds) {inbound.port=await freePort();delete inbound.streamSettings.sockopt;}
    await launch('loop-server',server,server.inbounds[0].port);
    for(const protocol of ['vmess','vless']) {
      const inbound=server.inbounds.find(i=>i.protocol===protocol);
      const client=JSON.parse(fs.readFileSync(root+'/client-'+protocol+'.json'));
      const out=client.outbounds[0];const port=await freePort();
      out.settings.vnext[0].address='127.0.0.1';out.settings.vnext[0].port=inbound.port;
      out.streamSettings.wsSettings.path=inbound.streamSettings.wsSettings.path;
      out.streamSettings.security='none';delete out.streamSettings.tlsSettings;delete out.streamSettings.sockopt;
      client.inbounds=[{listen:'127.0.0.1',port,protocol:'socks',settings:{auth:'noauth',udp:true}}];
      await launch('loop-'+protocol,client,port);
      const {stdout}=await promisify(cp.execFile)('curl',['-fsS','--max-time','8','--noproxy','','--socks5-hostname','127.0.0.1:'+port,'http://127.0.0.1:'+targetPort]);
      assert.equal(stdout,'dex-loopback-ok');
      await socksUDP(port,udp.address().port);
      console.log('PASS: '+protocol+' WebSocket TCP + UDP loopback');
    }
  } finally {
    for(const child of children)child.kill();
    target.close();udp.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
