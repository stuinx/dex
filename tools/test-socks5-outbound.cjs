const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'server'), 'utf8');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-socks5-outbound-test-'));
const opt = path.join(root, 'opt', 'de_GWD');
const tmp = path.join(root, 'tmp');
const configPath = path.join(opt, 'vtrui', 'config.json');
const settingsPath = path.join(opt, 'socks5-outbound.json');

fs.mkdirSync(path.dirname(configPath), {recursive: true});
fs.mkdirSync(tmp, {recursive: true});

function extractFunction(name) {
  const start = source.indexOf(name + '(){');
  assert(start >= 0, `missing ${name}`);
  const rest = source.slice(start);
  const next = rest.slice(name.length + 3).search(/^\w+\(\)\{/m);
  const block = next < 0 ? rest : rest.slice(0, name.length + 3 + next);
  return block.slice(0, block.lastIndexOf('\n}') + 2);
}

function rewrite(value) {
  return value
    .replaceAll('/opt/de_GWD', opt)
    .replaceAll('/tmp/de_GWD', path.join(tmp, 'de_GWD'));
}

const functions = rewrite([
  'XrayOutboundDirect',
  'socks5OutboundSettingsOrDefault',
  'socks5OutboundValidateProfile',
  'socks5OutboundProfiles',
  'socks5OutboundProfile',
  'socks5OutboundValidate',
  'socks5OutboundConfig',
  'socks5OutboundSync',
  'socks5OutboundApply',
  'socks5OutboundStatus',
  'socks5OutboundConfigure',
  'socks5OutboundDisable',
  'socks5OutboundDelete'
].map(extractFunction).join('\n'));

const prelude = `
set -eo pipefail
sponge() {
  local data
  data=$(cat)
  printf '%s\\n' "$data" > "$1"
}
systemctl() {
  if [[ \$1 = is-active ]]; then
    if [[ \$2 = --quiet ]]; then return 1; fi
    printf '%s\\n' inactive
    return 0
  fi
  return 0
}
`;

function run(body, allowFailure = false) {
  const result = cp.spawnSync('/bin/bash', ['-c', `${prelude}${functions}
socks5OutboundSettings=${JSON.stringify(settingsPath)}
${rewrite(body)}`], {
    encoding: 'utf8',
    timeout: 15000
  });
  if (!allowFailure) {
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  }
  return result;
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function reset(config, settings) {
  writeJson(configPath, config);
  fs.rmSync(settingsPath, {force: true});
  if (settings !== undefined) writeJson(settingsPath, settings);
}

const baseConfig = {
  inbounds: [{
    tag: 'extra-socks5',
    protocol: 'socks',
    port: 1080,
    settings: {auth: 'password', udp: true}
  }],
  outbounds: [
    {tag: 'direct', protocol: 'freedom'},
    {tag: 'custom', protocol: 'freedom'}
  ],
  routing: {
    rules: [
      {type: 'field', domain: ['geosite:cn'], outboundTag: 'direct'},
      {type: 'field', domain: ['domain:example.org'], outboundTag: 'custom'}
    ]
  }
};

const enabledSettings = {
  enabled: true,
  server: {
    address: 'proxy.example.test',
    port: 1080,
    username: 'test-user',
    password: 'test-password'
  },
  domains: ['domain:example.com', 'full:api.example.com']
};

const multiSettings = {
  profiles: [
    {
      name: 'sg',
      enabled: true,
      server: {address: 'sg.example.test', port: 1080, username: 'sg-user', password: 'sg-password'},
      domains: ['geosite:netflix', 'geosite:disney']
    },
    {
      name: 'us',
      enabled: true,
      server: {address: 'us.example.test', port: 1081, username: '', password: ''},
      domains: ['domain:claude.ai', 'domain:anthropic.com']
    }
  ]
};

try {
  reset(baseConfig);
  run('XrayOutboundDirect');
  let config = readJson(configPath);
  assert.deepEqual(config.outbounds.map(item => item.tag), ['direct', 'blocked']);
  assert.equal(config.inbounds[0].tag, 'extra-socks5');
  assert.deepEqual(config.routing.rules, baseConfig.routing.rules);
  console.log('PASS: disabled outbound leaves the existing SOCKS5 inbound and routes unchanged');

  reset(baseConfig, enabledSettings);
  run('socks5OutboundSync');
  config = readJson(configPath);
  const socksOutbound = config.outbounds.find(item => item.tag === 'socks5-exit');
  assert.equal(socksOutbound.protocol, 'socks');
  assert.deepEqual(socksOutbound.settings.servers, [{
    address: 'proxy.example.test',
    port: 1080,
    users: [{user: 'test-user', pass: 'test-password'}]
  }]);
  assert.deepEqual(config.routing.rules[0], {
    type: 'field',
    domain: enabledSettings.domains,
    outboundTag: 'socks5-exit'
  });
  assert.deepEqual(config.routing.rules.slice(1), baseConfig.routing.rules);
  const status = run('socks5OutboundStatus');
  assert(!status.stdout.includes(enabledSettings.server.password));
  console.log('PASS: enabled outbound is generated with selected-domain routing and masked status output');
  if (process.env.XRAY_BIN) {
    const result = cp.spawnSync(process.env.XRAY_BIN, ['run', '-test', '-config', configPath], {
      encoding: 'utf8',
      timeout: 15000
    });
    assert.equal(result.status, 0, 'native Xray validation failed for enabled SOCKS5 outbound');
    console.log('PASS: native Xray validation for enabled SOCKS5 outbound');
  }

  reset(baseConfig, multiSettings);
  run('socks5OutboundSync');
  config = readJson(configPath);
  assert.deepEqual(config.outbounds.map(item => item.tag), ['direct', 'custom', 'socks5-exit-sg', 'socks5-exit-us']);
  assert.deepEqual(config.routing.rules.slice(0, 2).map(rule => [rule.domain, rule.outboundTag]), [
    [multiSettings.profiles[0].domains, 'socks5-exit-sg'],
    [multiSettings.profiles[1].domains, 'socks5-exit-us']
  ]);
  assert.deepEqual(config.routing.rules.slice(2), baseConfig.routing.rules);
  const multiStatus = run('socks5OutboundStatus');
  assert(multiStatus.stdout.includes('sg'));
  assert(multiStatus.stdout.includes('us'));
  assert(!multiStatus.stdout.includes('sg-password'));
  console.log('PASS: multiple profiles generate independent outbounds and domain routes');

  run("socks5OutboundDelete <<< $'2\\n'");
  assert.deepEqual(readJson(settingsPath).profiles.map(profile => profile.name), ['sg']);
  config = readJson(configPath);
  assert(config.outbounds.some(item => item.tag === 'socks5-exit-sg'));
  assert(!config.outbounds.some(item => item.tag === 'socks5-exit-us'));
  console.log('PASS: deleting a profile removes only its outbound and routes');

  reset(baseConfig, multiSettings);
  run('socks5OutboundSync');
  run('socks5OutboundDisable');
  assert(readJson(settingsPath).profiles.every(profile => profile.enabled === false));
  config = readJson(configPath);
  assert(!config.outbounds.some(item => item.tag.startsWith('socks5-exit')));
  console.log('PASS: disabling all profiles removes all SOCKS5 outbounds while preserving other routes');

  reset(baseConfig, enabledSettings);
  const addProfile = run("socks5OutboundConfigure <<< $'us\\nus.example.test\\n1081\\nus-user\\nus-password\\ndomain:claude.ai\\n'");
  assert(addProfile.stdout.includes('SOCKS5 outbound'));
  const migratedSettings = readJson(settingsPath);
  assert.deepEqual(migratedSettings.profiles.map(profile => profile.name), ['default', 'us']);
  config = readJson(configPath);
  assert(config.outbounds.some(item => item.tag === 'socks5-exit'));
  assert(config.outbounds.some(item => item.tag === 'socks5-exit-us'));
  assert(config.routing.rules.some(rule => rule.outboundTag === 'socks5-exit-us' && rule.domain.includes('domain:claude.ai')));
  console.log('PASS: adding a profile preserves the legacy exit and creates an independent exit');

  reset(baseConfig);
  const emptyDomain = run("socks5OutboundConfigure <<< $'default\\nproxy.example.test\\n1080\\nuser\\npassword\\n\\n'");
  assert.equal(emptyDomain.status, 0, emptyDomain.stderr || emptyDomain.stdout);
  const defaultSettings = readJson(settingsPath);
  assert.equal(defaultSettings.profiles[0].name, 'default');
  assert.deepEqual(defaultSettings.profiles[0].domains, []);
  config = readJson(configPath);
  assert.deepEqual(config.outbounds.map(item => item.tag), ['socks5-exit', ...baseConfig.outbounds.map(item => item.tag)]);
  assert.deepEqual(config.routing.rules, baseConfig.routing.rules);
  console.log('PASS: default SOCKS5 exit accepts empty domain rules and handles unmatched traffic');

  reset(baseConfig, enabledSettings);
  run('socks5OutboundSync');
  const oldSettings = readJson(settingsPath);
  const oldConfig = readJson(configPath);
  const badCandidate = path.join(root, 'bad-candidate.json');
  writeJson(badCandidate, {
    enabled: true,
    server: {address: 'proxy.example.test', port: 1080, username: 'only-user', password: ''},
    domains: ['domain:example.com']
  });
  const invalid = run(`socks5OutboundApply ${JSON.stringify(badCandidate)}`, true);
  assert.notEqual(invalid.status, 0);
  assert.deepEqual(readJson(settingsPath), oldSettings);
  assert.deepEqual(readJson(configPath), oldConfig);
  console.log('PASS: invalid credentials are rejected without changing the active configuration');

  const failingCandidate = path.join(root, 'failing-candidate.json');
  writeJson(failingCandidate, {
    enabled: true,
    server: {address: 'proxy2.example.test', port: 1081, username: '', password: ''},
    domains: ['domain:another.example']
  });
  const xray = path.join(opt, 'vtrui', 'vtrui');
  fs.writeFileSync(xray, '#!/bin/bash\nexit 1\n');
  fs.chmodSync(xray, 0o755);
  const failedApply = run(`socks5OutboundApply ${JSON.stringify(failingCandidate)}`, true);
  assert.notEqual(failedApply.status, 0);
  assert.deepEqual(readJson(settingsPath), oldSettings);
  assert.deepEqual(readJson(configPath), oldConfig);
  console.log('PASS: Xray validation failure restores both settings and runtime configuration');

  fs.rmSync(xray);
  const disableCandidate = path.join(root, 'disable-candidate.json');
  writeJson(disableCandidate, {...enabledSettings, enabled: false});
  run(`socks5OutboundApply ${JSON.stringify(disableCandidate)}`);
  config = readJson(configPath);
  assert(!config.outbounds.some(item => item.tag === 'socks5-exit'));
  assert(!config.routing.rules.some(rule => rule.outboundTag === 'socks5-exit'));
  assert(config.outbounds.some(item => item.tag === 'direct'));
  assert(config.routing.rules.some(rule => rule.outboundTag === 'custom'));
  assert.equal(readJson(settingsPath).enabled, false);
  console.log('PASS: disabling removes only the SOCKS5 outbound and its routing rules');

  console.log(`Fixtures: ${root}`);
} catch (error) {
  console.error(`Fixtures retained: ${root}`);
  throw error;
}
