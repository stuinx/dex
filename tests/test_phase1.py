import re
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def function(path, name):
    source = (ROOT / path).read_text()
    start = re.search(r'^' + name + r'\(\)\s*\{', source, re.M)
    if not start:
        raise AssertionError('Missing function: ' + name)
    end = re.search(r'^}\n(?=\n\n)', source[start.start():], re.M)
    return source[start.start():start.start() + end.end()]


def shell(script):
    return subprocess.run(['bash', '-c', script], text=True, capture_output=True)


def test_failed_probe_uses_exit_code_and_empty_stdout():
    source = (ROOT / 'client').read_text()
    probe = re.search(r'try_connect\(\) \{.*?^}', source, re.M | re.S).group()
    result = shell('curl(){ return 7; }; sleep(){ :; };\n' + probe + '\ntry_connect example.invalid')
    assert result.returncode != 0
    assert result.stdout == ''


def test_successful_probe_exit_zero():
    source = (ROOT / 'client').read_text()
    probe = re.search(r'try_connect\(\) \{.*?^}', source, re.M | re.S).group()
    result = shell('curl(){ return 0; };\n' + probe + '\ntry_connect example.invalid')
    assert result.returncode == 0


def test_install_does_not_stop_stack_on_public_probe_text():
    source = (ROOT / 'client').read_text()
    assert 'not treated as node down' in source
    assert 'Stop mosdns smartdns nftables' not in source


def test_tproxy_after_runtime_rules():
    source = (ROOT / 'client').read_text()
    fetch_at = source.find('fetchRuntimeRules || exit 1')
    nft_at = source.find('installNftables || exit 1')
    pull_at = source.find('\npullpihole')
    first_nft = source.find('\ninstallNftables\n')
    assert pull_at != -1 and fetch_at != -1 and nft_at != -1
    assert pull_at < fetch_at < nft_at
    assert first_nft == -1


def test_pihole_pull_uses_docker_mirrors():
    source = (ROOT / 'client').read_text()
    pull = function('client', 'pullpihole')
    assert 'docker.m.daocloud.io/pihole/pihole:latest' in pull
    assert 'docker.1ms.run/pihole/pihole:latest' in pull
    daemon = function('client', 'writeDockerDaemon')
    assert 'registry-mirrors' in daemon
    assert 'docker.m.daocloud.io' in daemon
    assert 'iptables' in daemon
    assert 'continue without Pi-hole' in source


def test_sudoers_no_wildcard_nopasswd():
    source = (ROOT / 'client').read_text()
    assert 'NOPASSWD:ALL' not in source
    assert '/etc/sudoers.d/degwd' in source


def test_nftables_isolated_and_no_flush_ruleset():
    for script in ['client', 'server']:
        source = (ROOT / script).read_text()
        assert 'ExecStop=/usr/sbin/nft flush ruleset' not in source
        assert 'rm -rf /lib/systemd/system/nftables.service' not in source
        assert 'degwd-nftables.service' in source


def test_tmp_permission_is_1777():
    for script in ['client', 'server']:
        source = (ROOT / script).read_text()
        assert 'chmod 1777 /tmp' in source
        assert 'chmod 777 /tmp' not in source


def test_no_journal_wiping():
    for script in ['client', 'server']:
        assert 'rm -rf /var/log/journal/*' not in (ROOT / script).read_text()


def test_conf_permissions_0640():
    source = (ROOT / 'client').read_text()
    assert 'chmod 666 /opt/de_GWD/0conf' not in source
    assert 'chmod 0640 /opt/de_GWD/0conf' in source


def test_tcp_time_does_not_use_http_date():
    body = function('client', 'preDL')
    assert "grep -i '^date:'" not in body
    assert 'chronyc waitsync' in body


def test_empty_checksum_rejected():
    result = shell(function('client', 'checkSum') + '\ncheckSum /nonexistent-degwd-resource ""')
    assert result.stdout.strip() == 'false'


def test_nodesave_keeps_previous_on_empty_dns():
    source = (ROOT / 'resource/client/ui-script/ui-NodeSave').read_text()
    assert 'keeping previous node set' in source
    assert 'nft -c -f' in source
    assert source.find('>/opt/de_GWD/nftables/IP_V2NODE') > 0


def test_ui_4am_copies_on_probe_failure():
    source = (ROOT / 'resource/client/ui-script/ui_4am').read_text()
    assert 'copy_runtime_from_repo' in source
    assert 'skipped rule download' in source


def test_packaged_ui_matches_source():
    with zipfile.ZipFile(ROOT / 'resource/client/Archive.zip') as archive:
        for name in ['ui-installCER', 'ui-NodeSave', 'ui_4am', 'ui-autoUpdateHour']:
            assert archive.read('ui-script/' + name) == (ROOT / 'resource/client/ui-script' / name).read_bytes()
        assert archive.read('ui-web/index.php') == (ROOT / 'resource/client/ui-web/index.php').read_bytes()


def test_client_github_downloads_use_proxy():
    source = (ROOT / 'client').read_text()
    assert 'gh_candidates' in source
    assert 'wget_gh' in source
    assert 'curl_gh' in source
    assert 'https://ghfast.top/' in source
    assert 'https://gh-proxy.com/' in source
    pre = function('client', 'preDL')
    assert 'wget_gh /tmp/de_GWD.zip' in pre
    repo = function('client', 'repoDL')
    assert 'wget_gh /tmp/nginx' in repo
    assert 'wget_gh /tmp/client.zip' in repo
    result = shell(
        function('client', 'gh_candidates')
        + '\nGH_PROXY=off gh_candidates https://raw.githubusercontent.com/stuinx/dex/main/x\n'
    )
    assert result.stdout.strip() == 'https://raw.githubusercontent.com/stuinx/dex/main/x'
    result = shell(
        function('client', 'gh_candidates')
        + '\ngh_candidates https://raw.githubusercontent.com/stuinx/dex/main/x\n'
    )
    out = result.stdout.split()
    assert out[0] == 'https://ghfast.top/https://raw.githubusercontent.com/stuinx/dex/main/x'
    assert 'https://gh-proxy.com/https://raw.githubusercontent.com/stuinx/dex/main/x' in out
    assert out[-1] == 'https://raw.githubusercontent.com/stuinx/dex/main/x'
    ui4 = (ROOT / 'resource/client/ui-script/ui_4am').read_text()
    assert 'wget_gh /tmp/geosite.dat' in ui4
    auto = (ROOT / 'resource/client/ui-script/ui-autoUpdateHour').read_text()
    assert 'ghfast.top/https://raw.githubusercontent.com/stuinx/dex/main/client' in auto


def test_runtime_does_not_fetch_original_repo():
    banned = (
        'jacyl4/de_GWD',
        'de-gwd.accxio.workers.dev',
        'deepwiki.com/jacyl4',
        'starchart.cc/jacyl4',
    )
    skip_suffixes = {'.zip', '.png', '.jpg', '.jpeg', '.woff2', '.svg'}
    skip_names = {'NOTICE.md', 'LICENSE.md'}
    hits = []
    for path in ROOT.rglob('*'):
        if not path.is_file() or path.suffix.lower() in skip_suffixes or path.name in skip_names:
            continue
        if '.git' in path.parts or 'tests' in path.parts:
            continue
        text = path.read_text(errors='ignore')
        for token in banned:
            if token in text:
                hits.append(str(path.relative_to(ROOT)) + ': ' + token)
    assert hits == []
    client = (ROOT / 'client').read_text()
    server = (ROOT / 'server').read_text()
    assert 'raw.githubusercontent.com/stuinx/dex' in client
    assert 'raw.githubusercontent.com/stuinx/dex' in server
    assert 'github.com/stuinx/dex/releases' in (ROOT / 'resource/client/ui-web/index.php').read_text()


def test_server_rproxy_matches_client_schema():
    save = (ROOT / 'resource/server/rproxyS-save').read_text()
    apply = (ROOT / 'resource/server/rproxyS-apply').read_text()
    client_c = (ROOT / 'resource/client/ui-script/ui-RproxyCsave').read_text()
    assert 'reverse.localhost' in save
    assert '"tag": "reverseTunnel"' in save
    assert 'reverseTunnelWS' not in save
    assert '/rpws' not in save
    assert 'tcp+udp' in save
    assert 'conflicts with nginx' in save
    assert 'FORWARD.Rproxy.server' in apply
    assert '55443 is nginx' in apply
    assert 'RPROXY_TUNNEL_PORT:-55444' in apply
    server = (ROOT / 'server').read_text()
    assert '22. RproxyS' in server
    assert '    22)\n    installRproxyS' in server
    assert 'Extra UUID for' in server
    assert 'default tcp+udp' in server
    assert 'mapProto="tcp,udp"' in server
    assert 'address": "$domain"' in client_c
    assert '"network": "tcp"' in client_c
    assert '/rpws' not in client_c


def test_acme_issues_full_domain_not_last_two_labels():
    cer = (ROOT / 'resource/client/ui-script/ui-installCER').read_text()
    srv = (ROOT / 'server').read_text()
    for source in (cer, srv):
        assert '--issue --dns dns_cf -d $domain -d *.$domain' in source
        assert '--installcert -d $domain' in source
        assert '-d $topDomain -d *.$topDomain' not in source


if __name__ == '__main__':
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith('test_') and callable(fn):
            try:
                fn()
                print('ok', name)
            except Exception as exc:
                failed += 1
                print('FAIL', name, exc)
    raise SystemExit(failed)
