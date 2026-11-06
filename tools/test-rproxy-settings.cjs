const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const source = fs.readFileSync(path.resolve(__dirname, '../server'), 'utf8');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-rproxy-settings-'));
function fn(name) {
  const start = source.indexOf(name + '(){');
  assert(start >= 0, name);
  const rest = source.slice(start);
  const next = rest.slice(name.length + 3).search(/^[A-Za-z_][A-Za-z0-9_]*\(\)\{/m);
  return next < 0 ? rest : rest.slice(0, name.length + 3 + next);
}
const functions = ['deGWD_featureValidPort', 'deGWD_featureValidUUID', 'rproxyS_validPort', 'rproxyS_validUUID',
  'rproxyS_validProtocol', 'rproxyS_init', 'rproxyS_requireTunnel', 'rproxyS_validateSettings', 'rproxyS_replaceFile', 'rproxyS_writeConfig']
  .map(fn).join('\n').replace(/\/opt\/de_GWD|\/tmp\//g, match => root + match);
fs.mkdirSync(root + '/opt/de_GWD/RproxyS', {recursive: true});
fs.mkdirSync(root + '/opt/de_GWD/vtrui', {recursive: true});
fs.mkdirSync(root + '/tmp', {recursive: true});
fs.writeFileSync(root + '/opt/de_GWD/vtrui/vtrui', '#!/bin/bash\nexit "${FAIL_CORE:-0}"\n', {mode: 0o700});
const settingsFile = root + '/opt/de_GWD/RproxyS/settings.json';
const configFile = root + '/opt/de_GWD/RproxyS/config.json';
const uuid = '00000000-0000-4000-8000-000000000001';
const extraUUID = '00000000-0000-4000-8000-000000000002';
const settings = {tunnel: {port: 2097, uuid}, inStatus: 'on', mappingStatus: 'on',
  inUUID: [{RproxyS0uuid: extraUUID, RproxyS0mark: 'test-user'}, {RproxyS0uuid: uuid, RproxyS0mark: 'same-as-tunnel'}],
  mapping: [{port: 55500, protocol: 'tcp,udp'}]};
function run(input, failCore = false) {
  fs.writeFileSync(settingsFile, JSON.stringify(input));
  fs.writeFileSync(configFile, 'existing-config');
  fs.chmodSync(configFile, 0o640);
  const result = cp.spawnSync('/bin/bash', ['-s'], {input: functions + '\nrproxyS_writeConfig\n', encoding: 'utf8', timeout: 15000,
    env: {...process.env, FAIL_CORE: failCore ? '1' : '0'}});
  assert.equal(fs.readFileSync(settingsFile, 'utf8'), JSON.stringify(input), 'Settings and user marks must be unchanged');
  assert.equal(fs.statSync(configFile).mode & 0o777, 0o640);
  return result;
}
try {
  let result = run(settings);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  let config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.equal(config.inbounds[0].protocol, 'vmess');
  assert.deepEqual(config.inbounds[0].settings.clients, [{id: uuid, alterId: 0}, {id: extraUUID, alterId: 0}]);
  assert.equal(config.inbounds[1].port, 55500);
  assert.equal(config.inbounds[1].settings.network, 'tcp,udp');

  result = run({...settings, inStatus: 'off'});
  assert.equal(result.status, 0, result.stderr + result.stdout);
  config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.deepEqual(config.inbounds[0].settings.clients, [{id: uuid, alterId: 0}]);
  assert.equal(config.inbounds.length, 2);

  for (const input of [
    {...settings, inUUID: [{RproxyS0uuid: 'invalid'}]},
    {...settings, mapping: [{port: 55500, protocol: 'invalid'}]},
    {port: 2097, uuid, clients: ['unknown-legacy-format'], mapping: []}
  ]) {
    result = run(input);
    assert.notEqual(result.status, 0, 'Invalid or unknown legacy settings must not be rewritten');
    assert.equal(fs.readFileSync(configFile, 'utf8'), 'existing-config');
  }
  result = run(settings, true);
  assert.notEqual(result.status, 0, 'A failed core validation must preserve the current config');
  assert.equal(fs.readFileSync(configFile, 'utf8'), 'existing-config');
  console.log('PASS: RproxyS VMess tunnel/extra users/mappings, disabled users, duplicate primary identity and failed validation preservation');

  const legacy = {port: 2097, uuid, clients: [], mapping: [{port: 55500, protocol: 'tcp,udp'}, {port: 55501, protocol: 'tcp'}], note: {keep: true}};
  const runtime = {inbounds: [{tag: 'reverseTunnel', port: legacy.port, protocol: 'vmess', settings: {clients: [{id: uuid, alterId: 0}]}, streamSettings: {network: 'tcp'}},
    ...legacy.mapping.map((entry, index) => ({tag: 'mapping' + index, port: entry.port, protocol: 'dokodemo-door', settings: {address: '127.0.0.1', port: entry.port, network: entry.protocol}}))]};
  const backupFile = root + '/opt/de_GWD/RproxyS/settings.legacy.json';
  const initialize = () => cp.spawnSync('/bin/bash', ['-s'], {input: functions + '\nrproxyS_init\n', encoding: 'utf8', timeout: 15000});
  for (const [name, input, config, success] of [
    ['empty clients with matching runtime', legacy, runtime, true],
    ['mismatched tunnel port', {...legacy, port: 2098}, runtime, false],
    ['mismatched mapping', {...legacy, mapping: [{port: 55500, protocol: 'udp'}, legacy.mapping[1]]}, runtime, false],
    ['invalid mapping protocol', {...legacy, mapping: [{port: 55500, protocol: 'invalid'}]}, {...runtime, inbounds: [runtime.inbounds[0], {...runtime.inbounds[1], settings: {...runtime.inbounds[1].settings, network: 'invalid'}}]}, false],
    ['unknown nonempty clients', {...legacy, clients: [{id: extraUUID}]}, runtime, false],
    ['extra runtime clients', legacy, {...runtime, inbounds: [{...runtime.inbounds[0], settings: {clients: [{id: uuid, alterId: 0}, {id: extraUUID, alterId: 0}]}}, ...runtime.inbounds.slice(1)]}, false],
    ['noncanonical runtime target', legacy, {...runtime, inbounds: [runtime.inbounds[0], {...runtime.inbounds[1], settings: {...runtime.inbounds[1].settings, address: '192.0.2.1'}}, runtime.inbounds[2]]}, false],
    ['invalid JSON', '{invalid', runtime, false]
  ]) {
    fs.rmSync(backupFile, {force: true});
    const originalSettings = typeof input === 'string' ? input : JSON.stringify(input);
    const originalRuntime = JSON.stringify(config);
    fs.writeFileSync(settingsFile, originalSettings);
    fs.chmodSync(settingsFile, 0o600);
    fs.writeFileSync(configFile, originalRuntime);
    result = initialize();
    assert.equal(result.status === 0, success, name + ': ' + result.stderr + result.stdout);
    assert.equal(fs.statSync(settingsFile).mode & 0o777, 0o600);
    assert.equal(fs.readFileSync(configFile, 'utf8'), originalRuntime, 'Initialization must not change the runtime config');
    if (success) {
      const migrated = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      for (const [key, value] of Object.entries(legacy)) assert.deepEqual(migrated[key], value);
      assert.deepEqual(migrated.tunnel, {port: legacy.port, uuid});
      assert.deepEqual(migrated.inUUID, []);
      assert.equal(migrated.inStatus, 'off');
      assert.equal(migrated.mappingStatus, 'on');
      assert.equal(fs.readFileSync(backupFile, 'utf8'), originalSettings);
      assert.equal(fs.statSync(backupFile).mode & 0o777, 0o600);
      const once = fs.readFileSync(settingsFile, 'utf8');
      assert.equal(initialize().status, 0);
      assert.equal(fs.readFileSync(settingsFile, 'utf8'), once, 'Migration must be idempotent');
      assert.equal(fs.readFileSync(backupFile, 'utf8'), originalSettings, 'The original backup must not be overwritten');
    } else {
      assert.equal(fs.readFileSync(settingsFile, 'utf8'), originalSettings);
      assert(!fs.existsSync(backupFile), 'Rejected migrations must not publish a backup or change settings');
    }
    console.log('PASS: RproxyS legacy ' + name);
  }
  console.log('BOUNDARY: core config validation mocked; legacy migration only accepts verified empty clients and matching runtime identity/mappings');
  fs.rmSync(root, {recursive: true, force: true});
} catch (error) {
  console.error('Fixtures: ' + root);
  throw error;
}
