"""Run actual Client route generators and traffic in a private filesystem/core."""
import concurrent.futures
import json
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time

source = Path(sys.argv[1])
fixtures = [json.loads(Path(name).read_text()) for name in sys.argv[2:]]
domains = [('youtube', 'www.youtube.com'), ('claude', 'claude.ai'), ('gemini', 'gemini.google.com'), ('grok', 'grok.com'), ('wikipedia', 'en.wikipedia.org'), ('reddit', 'www.reddit.com'), ('github', 'github.com'), ('discord', 'discord.com'), ('telegram', 'telegram.org'), ('x', 'x.com'), ('openai', 'api.openai.com'), ('metaai', 'www.meta.ai'), ('apple', 'www.apple.com')]
with tempfile.TemporaryDirectory(prefix='dex-live-routing-') as directory:
    root = Path(directory)
    for folder in ['vtrui', 'mosdns', 'smartdns', '.repo', 'tmp']:
        (root / folder).mkdir()
    config = json.loads(Path('/opt/de_GWD/0conf').read_text())
    for fixture in fixtures:
        item = fixture['primary']
        config['v2node'].append({'domain': fixture['host'] + ':' + str(item['port']), 'tls': fixture['host'], 'name': 'acceptance-' + fixture['name'], 'uuid': item['uuid'], 'path': item['path'], 'protocol': 'vless'})
    config.setdefault('v2nodeDIV', {})['nodeCU'] = {'rulesDomain': ['domain:example.net'], 'rulesIP': []}
    (root / '0conf').write_text(json.dumps(config))
    runtime = root / 'vtrui/config.json'
    runtime.write_text(Path('/opt/de_GWD/vtrui/config.json').read_text())
    shutil.copyfile('/opt/de_GWD/smartdns/smartdns.conf', root / 'smartdns/smartdns.conf')
    for name in ['Domains.apple.txt', 'Domains.games.txt']:
        shutil.copyfile('/opt/de_GWD/.repo/' + name, root / '.repo' / name)
    for name in ['ui-NodeSM', 'ui-NodeCU', 'ui-V2outbound', 'ui-V2routingDomain', 'ui-submitListBWsm', 'ui-NodeSMcheck', 'ui-NodeCUcheck']:
        text = (source / name).read_text()
        text = text.replace('/tmp/', str(root / 'tmp') + '/').replace('/opt/de_GWD', str(root))
        text = text.replace(str(root) + '/ui-', '/bin/bash ' + str(root) + '/ui-')
        text = re.sub(r'^chmod .*$', ': # Permission operations excluded from isolated fixture test', text, flags=re.M)
        text = re.sub(r'\bsystemctl\b', 'true', text)
        (root / name).write_text(text)
    subprocess.run(['/bin/bash', str(root / 'ui-NodeSM'), 'test'] + ['2'] * 13 + ['0'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['/bin/bash', str(root / 'ui-NodeCU'), 'test', '2'], check=True, stdout=subprocess.DEVNULL)
    candidate = json.loads(runtime.read_text())
    default_tag = candidate['outbounds'][0]['tag']
    assert sum(item.get('tag', '').startswith('nodeSM') for item in candidate['outbounds']) == 13
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0))
        port = reservation.getsockname()[1]
    candidate['inbounds'] = [{'tag': 'acceptance-socks', 'listen': '127.0.0.1', 'port': port, 'protocol': 'socks', 'settings': {'auth': 'noauth', 'udp': True}}]
    log = root / 'access.log'
    candidate['log'] = {'access': str(log), 'error': 'none', 'loglevel': 'warning'}
    runtime.write_text(json.dumps(candidate))
    subprocess.run(['/opt/de_GWD/vtrui/vtrui', 'run', '-test', '-config', str(runtime)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    core = subprocess.Popen(['/opt/de_GWD/vtrui/vtrui', 'run', '-config', str(runtime)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(.5)
        probes = domains + [('custom', 'example.net'), ('default', 'example.com')]

        def request(item):
            key, domain = item
            response = subprocess.run(['curl', '--noproxy', '', '--socks5-hostname', '127.0.0.1:' + str(port), '--max-time', '15', '-sS', '-o', '/dev/null', '-w', '%{http_code}', 'https://' + domain + '/'], capture_output=True, text=True)
            return key, domain, response.stdout, response.returncode

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(request, probes))
        time.sleep(.3)
        lines = log.read_text().splitlines()
        failed = False
        for key, domain, status, code in results:
            expected = 'custom' if key == 'custom' else default_tag if key == 'default' else 'nodeSM' + key
            matched = any(domain in line and re.search(r'(?:->|>>) ' + re.escape(expected) + r'\]', line) for line in lines)
            print('PASS' if matched else 'FAIL', 'route', key, 'expected=' + expected, 'HTTP=' + status, 'curl=' + str(code))
            if not matched:
                print('Route evidence:', '\n'.join(line for line in lines if domain in line))
            failed |= not matched
        assert not failed, 'Some requested routes did not match the expected outbound'
    finally:
        core.terminate()
        core.wait(timeout=5)
