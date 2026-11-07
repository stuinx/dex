const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-install-safety-'));
const sources = Object.fromEntries(['client', 'server', 'resource/client/ui-script/ui-installDocker', 'resource/client/ui-script/ui-updateSave', 'resource/client/ui-script/ui-autoUpdateHour']
  .map(file => [file, fs.readFileSync(path.join(repo, file), 'utf8')]));
function fn(source, name) {
  const start = source.indexOf(name + '(){');
  assert(start >= 0, name);
  const rest = source.slice(start);
  const next = rest.slice(name.length + 3).search(/^[A-Za-z_][A-Za-z0-9_]*\(\)\{/m);
  return next < 0 ? rest : rest.slice(0, name.length + 3 + next);
}
function fixture(name) {
  const dir = path.join(root, name);
  for (const item of ['tmp', 'opt/de_GWD/.repo', 'etc/apt/keyrings', 'etc/apt/sources.list.d', 'etc/nginx/conf.d', 'etc/systemd/system', 'var/www/html/act']) {
    fs.mkdirSync(path.join(dir, item), {recursive: true});
  }
  fs.writeFileSync(path.join(dir, 'etc/os-release'), 'VERSION_CODENAME=bookworm\n');
  fs.writeFileSync(path.join(dir, 'etc/nginx/conf.d/default.conf'), 'fastcgi_pass unix:/run/php/php7.4-fpm.sock;\n');
  fs.writeFileSync(path.join(dir, 'etc/systemd/system/updateGWD.service'), 'ExecStart=previous\n');
  return dir;
}
function run(dir, source, body = '', env = {}) {
  const rewritten = source.replace(/\/(?:opt\/de_GWD|etc|var\/www|usr|lib|tmp)(?=\/|[\s"'])/g, match => dir + match);
  return cp.spawnSync('/bin/bash', ['-s'], {
    input: `
WHITE='' RED='' GREEN='' cRES=''
repoBase=https://repo.invalid
systemctl() { printf '%s\\n' "$*" >> "$FIXTURE/service.log"; }
kill() { :; }
ps() { :; }
tmux() { :; }
chown() { :; }
install() { local destination; for destination in "$@"; do :; done; : > "$destination"; }
apt-get() { :; }
apt-key() { :; }
dpkg() { [[ $1 != --print-architecture ]] || printf 'amd64\\n'; return 0; }
dpkg-query() { printf 'install ok installed\\n'; }
timeout() { while [[ $1 == --* ]]; do shift; done; shift; "$@"; }
curl() {
  local output=''
  while (( $# )); do
    case $1 in -o|-fsSLo) output=$2; shift ;; esac
    shift
  done
  if [[ -z $output ]]; then printf '%s\\n' "\${REMOTE_VERSION:-new-version}"; return 0; fi
  [[ $MODE != empty ]] && printf '%s' "$PAYLOAD" > "$output"
  [[ $MODE != fail ]]
}
wget() {
  local output='' url=''
  printf '%s\\n' "$*" >> "$FIXTURE/download-args.log"
  while (( $# )); do
    case $1 in -cqO|-qO|-O) output=$2; shift ;; https://*) url=$1 ;; esac
    shift
  done
  printf '%s\\n' "$url" >> "$FIXTURE/download.log"
  [[ -n $output ]] || return 2
  [[ $MODE != empty ]] && printf '%s' "$PAYLOAD" > "$output"
  [[ $MODE != fail ]]
}
${process.platform === 'darwin' ? 'sed() { if [[ $1 = -i && $2 == /ExecStart=/c* ]]; then printf "%s\\n" "${2#*c\\\\}" > "$3"; elif [[ $1 = -i ]]; then shift; command sed -i "" "$@"; else command sed "$@"; fi; }' : ''}
${rewritten}
${body}
`,
    cwd: dir, encoding: 'utf8', timeout: 15000,
    env: {...process.env, FIXTURE: dir, MODE: 'success', PAYLOAD: 'replacement-content\n', ...env}
  });
}
const failures = [];
function check(name, test) {
  try { test(); console.log('PASS: ' + name); }
  catch (error) { failures.push(name + ': ' + error.message); console.error('FAIL: ' + name + ': ' + error.message); }
}

for (const [file, name, target] of [
  ['client', 'pkgDEP2', 'docker.asc'],
  ['client', 'updateAPT', 'deb.sury.org.gpg'],
  ['resource/client/ui-script/ui-installDocker', 'installDocker', 'docker.asc']
]) {
  for (const mode of ['fail', 'empty']) {
    check(`${name} preserves existing key on ${mode}`, () => {
      const dir = fixture(name + '-' + mode);
      const key = path.join(dir, 'etc/apt/keyrings', target);
      fs.writeFileSync(key, 'existing-key');
      fs.writeFileSync(path.join(dir, 'etc/apt/sources.list'), 'existing-sources\n');
      const result = run(dir, fn(sources[file], name), name, {MODE: mode});
      assert.notEqual(result.status, 0, result.stderr + result.stdout);
      assert.equal(fs.readFileSync(key, 'utf8'), 'existing-key');
      assert.deepEqual(fs.readdirSync(path.dirname(key)), [target]);
      assert.equal(fs.readFileSync(path.join(dir, 'etc/apt/sources.list'), 'utf8'), 'existing-sources\n');
    });
  }
}

check('PHP upgrade preserves an existing ionCube requirement', () => {
  const dir = fixture('php-ioncube-preflight');
  fs.mkdirSync(path.join(dir, 'usr/local/ioncube'), {recursive: true});
  const result = run(dir, fn(sources.client, 'installDep'), 'phpVersion=8.5\ninstallDep');
  assert.notEqual(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /ionCube.*PHP 8\.5 loader missing/);
  assert(!fs.existsSync(path.join(dir, 'service.log')), 'PHP service actions must not start without the matching loader');
});

for (const file of ['client', 'server']) {
  for (const mode of ['fail', 'empty', 'success']) {
    check(`${file} version metadata ${mode}`, () => {
      const dir = fixture(file + '-version-' + mode);
      const target = path.join(dir, file === 'client' ? 'opt/de_GWD/.repo/version.php' : 'opt/de_GWD/version.php');
      fs.writeFileSync(target, 'existing-version\n');
      const source = fn(sources[file], 'repoDL');
      const block = source.slice(source.indexOf('localVer='), source.indexOf('\nfor requiredResource') >= 0 ? source.indexOf('\nfor requiredResource') : source.lastIndexOf('\necho -e'));
      const result = run(dir, `versionDownload(){\n${block}\nreturn 0\n}`, 'versionDownload', {MODE: mode, PAYLOAD: 'new-version\n'});
      assert.equal(result.status === 0, mode === 'success', result.stderr + result.stdout);
      assert.equal(fs.readFileSync(target, 'utf8'), mode === 'success' ? 'new-version\n' : 'existing-version\n');
    });
  }
}

for (const mode of ['fail', 'incomplete', 'success']) {
  check(`Web UI extraction ${mode}`, () => {
    const dir = fixture('webui-' + mode);
    const web = path.join(dir, 'var/www/html/index.php');
    const script = path.join(dir, 'opt/de_GWD/ui-updateSave');
    fs.writeFileSync(web, 'existing-web');
    fs.writeFileSync(script, 'existing-script');
    fs.writeFileSync(path.join(dir, 'opt/de_GWD/.repo/version.php'), 'test-version\n');
    const archiveRoot = path.join(dir, 'package');
    for (const item of ['ui-script/ui-updateSave', 'ui-script/ui_4am', 'ui-web/index.php', 'ui-web/auth.php', 'ui-web/act/NodeSave.php']) {
      fs.mkdirSync(path.dirname(path.join(archiveRoot, item)), {recursive: true});
      fs.writeFileSync(path.join(archiveRoot, item), 'replacement-' + path.basename(item));
    }
    cp.execFileSync('zip', ['-qr', path.join(dir, 'opt/de_GWD/.repo/client.zip'), '.'], {cwd: archiveRoot});
    const mocks = `
unzip() {
  [[ $MODE != fail ]] || return 50
  [[ $MODE != incomplete ]] || return 0
  command unzip "$@"
}
dd() { :; }
`;
    const result = run(dir, mocks + fn(sources.client, 'installWebUI'), 'installWebUI', {MODE: mode});
    assert.equal(result.status === 0, mode === 'success', result.stderr + result.stdout);
    assert.equal(fs.readFileSync(web, 'utf8'), mode === 'success' ? 'replacement-index.php' : 'existing-web');
    assert.equal(fs.readFileSync(script, 'utf8'), mode === 'success' ? 'replacement-ui-updateSave' : 'existing-script');
  });
}

for (const [mode, command, port, payload] of [
  ['fail', 'bash <(wget -qO- "https://repo.invalid/client")', '3000', '#!/bin/bash\nprintf partial\n'],
  ['empty', 'bash <(wget -qO- https://repo.invalid/client)', '3000', ''],
  ['success', 'bash <(wget -qO- https://repo.invalid/client)', '3000', 'if\n'],
  ['success', 'bash <(wget -qO- https://repo.invalid/client)', '70000', '#!/bin/bash\nprintf installer\n'],
  ['success', 'bash <(wget -qO- "https://repo.invalid/client")', '3000', '#!/bin/bash\nprintf installer\n'],
  ['success', "bash <(wget -qO- 'https://repo.invalid/client')", '3000', '#!/bin/bash\nprintf installer\n'],
  ['success', 'bash <(wget -qO- https://repo.invalid/client)', '3000', '#!/bin/bash\nprintf installer\n']
]) {
  check(`update preparation ${mode}/${port}/${command.includes('"') ? 'double' : command.includes("'") ? 'single' : 'bare'}/${payload.startsWith('if') ? 'syntax-error' : 'shell'}`, () => {
    const dir = fixture('update-' + fs.readdirSync(root).length);
    const target = path.join(dir, 'opt/de_GWD/update');
    fs.writeFileSync(target, '#!/bin/bash\n# existing installer\n');
    fs.writeFileSync(path.join(dir, 'opt/de_GWD/0conf'), JSON.stringify({update: {updateCMD: command, updatePort: port}}));
    const result = run(dir, sources['resource/client/ui-script/ui-updateSave'], '', {MODE: mode, PAYLOAD: payload});
    const expectedSuccess = mode === 'success' && port === '3000' && !payload.startsWith('if');
    assert.equal(result.status === 0, expectedSuccess, result.stderr + result.stdout);
    assert.equal(fs.readFileSync(target, 'utf8'), expectedSuccess ? payload : '#!/bin/bash\n# existing installer\n');
    if (fs.existsSync(path.join(dir, 'service.log'))) {
      const actions = fs.readFileSync(path.join(dir, 'service.log'), 'utf8');
      assert(!actions.includes('stop nftables'), actions);
      assert(expectedSuccess, 'Failed preparation must not change services');
    }
    if (expectedSuccess) assert.equal(fs.readFileSync(path.join(dir, 'download.log'), 'utf8').trim(), 'https://repo.invalid/client');
    if (expectedSuccess) assert(fs.readFileSync(path.join(dir, 'etc/systemd/system/updateGWD.service'), 'utf8').includes('-p 3000'));
  });
}

for (const mode of ['fail', 'syntax-error', 'success']) {
  check(`server automatic update ${mode}`, () => {
    const dir = fixture('auto-update-' + mode);
    fs.writeFileSync(path.join(dir, 'opt/de_GWD/version.php'), 'v1.0.0\n');
    const source = sources.server.match(/cat << "EOF" >>\/opt\/de_GWD\/autoUpdate\n([\s\S]*?)\nEOF/)[1];
    const payload = '#!/bin/bash\nupdateGWD(){ printf executed > "$FIXTURE/auto-executed"; }\n' +
      '# large but potentially interrupted download\n'.repeat(2000) + (mode === 'syntax-error' ? 'if\n' : 'start_menu\n');
    const result = run(dir, source, '', {MODE: mode === 'fail' ? 'fail' : 'success', PAYLOAD: payload, REMOTE_VERSION: 'v2.0.0'});
    assert.equal(fs.existsSync(path.join(dir, 'auto-executed')), mode === 'success', 'Incomplete installers must not run');
    assert.equal(result.status === 0, mode === 'success', result.stderr + result.stdout);
  });
}

for (const mode of ['fail', 'syntax-error', 'installer-failure', 'success']) {
  check(`client automatic update ${mode}`, () => {
    const dir = fixture('client-auto-update-' + mode);
    fs.writeFileSync(path.join(dir, 'var/www/html/act/version.php'), 'v1.0.0\n');
    const source = sources['resource/client/ui-script/ui-autoUpdateHour'].match(/cat << "EOF" >\/opt\/de_GWD\/autoUpdate\n([\s\S]*?)\nEOF/)[1];
    const payload = '#!/bin/bash\nupdateGWD(){ printf executed > "$FIXTURE/auto-executed"; printf "fastcgi_pass unix:/run/php/php8.5-fpm.sock;\\n" > "$FIXTURE/etc/nginx/conf.d/default.conf"; printf "php8.5-fpm\\n" > "$FIXTURE/opt/de_GWD/php-fpm-service"; return ' +
      (mode === 'installer-failure' ? '1' : '0') + '; }\n' + '# potentially interrupted download\n'.repeat(2500) +
      (mode === 'syntax-error' ? 'if\n' : 'start_menu\n');
    const result = run(dir, source, '', {MODE: mode === 'fail' ? 'fail' : 'success', PAYLOAD: payload, REMOTE_VERSION: 'v2.0.0'});
    const installerStarted = ['success', 'installer-failure'].includes(mode);
    assert.equal(fs.existsSync(path.join(dir, 'auto-executed')), installerStarted);
    assert.equal(result.status === 0, mode === 'success', result.stderr + result.stdout);
    const actions = fs.existsSync(path.join(dir, 'service.log')) ? fs.readFileSync(path.join(dir, 'service.log'), 'utf8') : '';
    assert.equal(actions.includes('stop php7.4-fpm'), installerStarted);
    assert.equal(actions.includes('restart php8.5-fpm'), installerStarted, 'The Nginx-selected PHP-FPM service must be restored');
    assert(fs.readFileSync(path.join(dir, 'download-args.log'), 'utf8').includes('--connect-timeout=10'));
    if (installerStarted) assert(fs.readFileSync(path.join(dir, 'download.log'), 'utf8').includes('https://ghfast.top/https://raw.githubusercontent.com/stuinx/dex/dev/client'));
  });
}

if (failures.length) {
  console.error(failures.join('\n'));
  console.error('Fixtures: ' + root);
  process.exitCode = 1;
} else {
  fs.rmSync(root, {recursive: true, force: true});
}
