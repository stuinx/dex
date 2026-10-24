const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');

const repo = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-debian-test-'));
const sources = Object.fromEntries(['client', 'server', 'resource/kernel/installkernel'].map(file =>
  [file, fs.readFileSync(path.join(repo, file), 'utf8')]));
const functionSource = (source, name) => {
  const signature = `${name}(){`;
  const start = source.indexOf(signature);
  assert(start >= 0);
  const next = source.slice(start + signature.length).search(/^[A-Za-z_][A-Za-z0-9_]*\(\)\{/m);
  assert(next >= 0);
  return source.slice(start, start + signature.length + next);
};

for (const [codename, architecture] of [
  ['bookworm', 'amd64'], ['bookworm', 'arm64'],
  ['trixie', 'amd64'], ['trixie', 'arm64']
]) {
  for (const name of ['client', 'server']) {
    const fixture = path.join(root, `${name}-${codename}-${architecture}`);
    fs.mkdirSync(path.join(fixture, 'etc/apt/sources.list.d'), {recursive: true});
    fs.mkdirSync(path.join(fixture, 'etc/apt/keyrings'), {recursive: true});
    fs.mkdirSync(path.join(fixture, 'etc/sysctl.d'), {recursive: true});
    fs.writeFileSync(path.join(fixture, 'etc/os-release'), `VERSION_CODENAME=${codename}\n`);
    fs.writeFileSync(path.join(fixture, 'etc/sysctl.conf'), 'net.ipv4.ip_forward = 1\n');
    const source = sources[name];
    const platform = source.match(/^debianCodename=.*?\nfi/ms)[0];
    const dependencyName = name === 'client' ? 'pkgDEP2' : 'pkgDEP';
    const dependencies = functionSource(source, dependencyName);
    const sourceBlocks = [...source.matchAll(/cat << EOF >\/etc\/apt\/sources.list\n([\s\S]*?)\nEOF/g)]
      .filter(match => match[1].includes('$debianSuite'));
    assert.equal(sourceBlocks.length, 2, `${name}: install and update APT sources`);
    assert(sourceBlocks.every(match => !/^deb-src\s/m.test(match[1])), `${name}: APT should not download source indexes`);
    if (name === 'server') {
      const installBlock = sourceBlocks.find(match => match[1].includes('deb http://deb.debian.org/debian $debianSuite'));
      assert(installBlock, `${name}: initial install APT sources`);
      const installer = functionSource(source, 'installGWD');
      assert(installer.indexOf('rm -f /etc/apt/sources.list.d/debian.sources') < installer.lastIndexOf('apt-get update'));
      assert(!installer.includes('s/ bullseye / bookworm /g'));
      assert(!installer.includes('s/ buster / bookworm /g'));
      assert(installer.includes('Acquire::Languages=none'));
    }
    const persist = source.match(/if \[\[ \$debianSuite = trixie \]\]; then\n  ln -sf [^\n]+\nfi/)[0];
    const rewrite = text => text.replaceAll('/etc/', `${fixture}/etc/`);
    const run = body => {
      const result = cp.spawnSync('/bin/bash', ['-s'], {
        input: `${rewrite(platform)}\n${body}`,
        env: {...process.env, APT_LOG: path.join(fixture, 'apt.log'), QUERY_LOG: path.join(fixture, 'query.log')},
        encoding: 'utf8', timeout: 15000
      });
      assert.equal(result.status, 0, `${name}/${codename}: ${result.stderr}\n${result.stdout}`);
      return result.stdout;
    };
    const packageName = codename === 'trixie' ? 'libmimalloc3' : 'libmimalloc2.0';
    assert.equal(run('printf "%s %s" "$debianSuite" "$mimallocPackage"'), `${codename} ${packageName}`);
    for (const block of sourceBlocks) {
      run(`chnAPTsource=mirror.example\n${rewrite(block[0])}`);
      const suites = fs.readFileSync(path.join(fixture, 'etc/apt/sources.list'), 'utf8')
        .trim().split('\n').filter(line => line.startsWith('deb')).map(line => line.split(/\s+/)[2]);
      assert(suites.every(suite => [codename, `${codename}-security`, `${codename}-updates`, `${codename}-backports`].includes(suite)));
      assert(new Set(suites).size === 4);
    }
    const mocks = `
dpkg() { [[ $1 != --print-architecture ]] || printf '${architecture}\\n'; return 0; }
dpkg-query() { printf '%s\\n' "$*" >> "$QUERY_LOG"; printf 'install ok installed\\n'; }
nproc() { printf '2\\n'; }
curl() { return 0; }
apt-get() { printf '%s\\n' "$*" >> "$APT_LOG"; }
apt-key() { printf 'legacy-key-cleanup\\n' >> "$APT_LOG"; }
command() {
  if [[ $1 = -v && $2 = apt-key && $debianSuite = trixie ]]; then return 1; fi
  builtin command "$@"
}
`;
    run(`${mocks}\narchitecture=${architecture}\n${rewrite(dependencies)}\n${dependencyName}`);
    const aptLog = fs.readFileSync(path.join(fixture, 'apt.log'), 'utf8');
    assert(aptLog.includes(packageName));
    assert(!aptLog.includes(codename === 'trixie' ? 'libmimalloc2.0' : 'libmimalloc3'));
    if (name === 'client') {
      assert(fs.readFileSync(path.join(fixture, 'etc/apt/sources.list.d/docker.sources'), 'utf8').includes(`Architectures: ${architecture}`));
      assert(fs.readFileSync(path.join(fixture, 'query.log'), 'utf8').includes(packageName));
      const update = functionSource(source, 'updateAPT');
      run(`${mocks}\nchnAPTsource=mirror.example\n${rewrite(update)}\nupdateAPT`);
      assert(fs.readFileSync(path.join(fixture, 'etc/apt/sources.list.d/php.list'), 'utf8').includes(`/php/ ${codename} main`));
      assert.equal(fs.readFileSync(path.join(fixture, 'apt.log'), 'utf8').includes('legacy-key-cleanup'), codename === 'bookworm');
    }
    const configFile = path.join(fixture, 'etc/sysctl.conf');
    const originalMode = fs.statSync(configFile).mode;
    run(rewrite(persist));
    const bootFile = path.join(fixture, 'etc/sysctl.d/99-de-gwd.conf');
    assert.equal(fs.existsSync(bootFile), codename === 'trixie');
    if (codename === 'trixie') {
      assert.equal(fs.realpathSync(bootFile), fs.realpathSync(configFile));
      fs.appendFileSync(configFile, 'net.ipv4.tcp_congestion_control = bbr\n');
      assert(fs.readFileSync(bootFile, 'utf8').includes('tcp_congestion_control'));
    }
    assert.equal(fs.statSync(configFile).mode, originalMode);
  }
}

const kernel = sources['resource/kernel/installkernel'];
const runtime = kernel.match(/cat << "EOF" >\/etc\/rc_kernel.local\n([\s\S]*?)\nEOF/)[1];
const tuning = runtime.slice(runtime.indexOf("sed -i '/net.ipv4.tcp_congestion_control"), runtime.indexOf('\nrm -f /var/cache'));
const kernelFixture = path.join(root, 'kernel');
fs.mkdirSync(path.join(kernelFixture, 'etc/sysctl.d'), {recursive: true});
fs.writeFileSync(path.join(kernelFixture, 'etc/os-release'), 'VERSION_CODENAME=trixie\n');
fs.writeFileSync(path.join(kernelFixture, 'etc/sysctl.conf'), 'net.ipv4.ip_forward = 1\n');
const result = cp.spawnSync('/bin/bash', ['-s'], {
  input: `sysctl() { return 0; }\n${tuning.replaceAll('/etc/', `${kernelFixture}/etc/`)}`,
  encoding: 'utf8', timeout: 15000
});
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.realpathSync(path.join(kernelFixture, 'etc/sysctl.d/99-de-gwd.conf')), fs.realpathSync(path.join(kernelFixture, 'etc/sysctl.conf')));
console.log('PASS: Debian 12/13 install/update sources, dependencies, PHP key handling and persistent sysctl; kernel tuning');
console.log(`Fixtures: ${root}`);
