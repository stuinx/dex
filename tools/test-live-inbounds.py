"""Test an exported, private Server fixture using an isolated Client core."""
import ipaddress
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import tempfile
import time


def exact(connection, count):
    result = b''
    while len(result) < count:
        block = connection.recv(count - len(result))
        if not block:
            raise RuntimeError('SOCKS control connection closed')
        result += block
    return result


def udp_probe(port):
    with socket.create_connection(('127.0.0.1', port), timeout=8) as control:
        control.sendall(b'\x05\x01\x00')
        assert exact(control, 2) == b'\x05\x00'
        control.sendall(b'\x05\x03\x00\x01' + b'\x00' * 6)
        header = exact(control, 4)
        assert header == b'\x05\x00\x00\x01'
        relay = socket.inet_ntoa(exact(control, 4))
        relay_port = struct.unpack('!H', exact(control, 2))[0]
        transaction = os.urandom(12)
        packet = b'\x00\x00\x00\x01' + socket.inet_aton(socket.gethostbyname('stun.cloudflare.com')) + struct.pack('!H', 3478)
        packet += struct.pack('!HHI12s', 1, 0, 0x2112A442, transaction)
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
            udp.settimeout(10)
            udp.sendto(packet, (relay if relay != '0.0.0.0' else '127.0.0.1', relay_port))
            reply = udp.recv(2048)[10:]
        assert reply[:2] == b'\x01\x01' and reply[8:20] == transaction
        offset = 20
        while offset + 4 <= len(reply):
            kind, length = struct.unpack('!HH', reply[offset:offset + 4])
            value = reply[offset + 4:offset + 4 + length]
            if kind == 0x20 and len(value) >= 8 and value[1] == 1:
                return str(ipaddress.IPv4Address(struct.unpack('!I', value[4:8])[0] ^ 0x2112A442))
            offset += 4 + ((length + 3) // 4) * 4
        raise RuntimeError('No STUN mapped address')


if sys.argv[1] == '--probe':
    print('PASS: local SOCKS UDP STUN egress', udp_probe(int(sys.argv[2])))
    sys.exit(0)

fixture = json.loads(Path(sys.argv[1]).read_text())
host = fixture['host']
extra = fixture['extra']
cases = [('primary', fixture['primary'], 'vless')]
for key, protocol in [('vless_ws', 'vless'), ('vmess_ws', 'vmess'), ('reality', 'vless'), ('socks5', 'socks')]:
    item = extra.get(key, {})
    if item.get('enabled'):
        cases.append((key, item, protocol))
    else:
        print('NOT CONFIGURED:', fixture['name'], key)

failed = False
for kind, item, protocol in cases:
    with tempfile.TemporaryDirectory(prefix='dex-live-inbound-') as directory:
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1', 0))
            local_port = reservation.getsockname()[1]
        stream = {'sockopt': {'mark': 255}}
        if kind == 'socks5':
            settings = {'servers': [{'address': host, 'port': int(item['port']), 'users': [{'user': item['user'], 'pass': item['password']}]}]}
        else:
            user = {'id': item['uuid']}
            user.update({'encryption': 'none'} if protocol == 'vless' else {'security': 'auto', 'alterId': 0})
            settings = {'vnext': [{'address': item.get('domain') or host, 'port': int(item['port']), 'users': [user]}]}
            if kind == 'reality':
                if item.get('flow'):
                    user['flow'] = item['flow']
                stream.update({'network': 'tcp', 'security': 'reality', 'realitySettings': {'serverName': item['serverName'], 'fingerprint': 'chrome', 'publicKey': item['publicKey'], 'shortId': item['shortId']}})
            else:
                name = item.get('domain') or host
                stream.update({'network': 'ws', 'security': 'tls', 'tlsSettings': {'serverName': name}, 'wsSettings': {'path': item['path'], 'headers': {'Host': name}}})
        config = {'log': {'loglevel': 'none'}, 'inbounds': [{'listen': '127.0.0.1', 'port': local_port, 'protocol': 'socks', 'settings': {'auth': 'noauth', 'udp': True}}], 'outbounds': [{'protocol': protocol, 'settings': settings, 'streamSettings': stream}]}
        path = Path(directory) / 'config.json'
        path.write_text(json.dumps(config))
        core = subprocess.Popen(['/opt/de_GWD/vtrui/vtrui', 'run', '-config', str(path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(50):
                if core.poll() is not None:
                    raise RuntimeError('Test core exited')
                try:
                    with socket.create_connection(('127.0.0.1', local_port), timeout=.2):
                        break
                except OSError:
                    time.sleep(.1)
            request = subprocess.run(['curl', '-fsS', '--max-time', '20', '--noproxy', '', '--socks5-hostname', '127.0.0.1:' + str(local_port), '-o', '/dev/null', '-w', '%{http_code}', 'https://example.com/'], capture_output=True, text=True)
            assert request.returncode == 0 and request.stdout == '200', 'HTTPS request failed'
            print('PASS:', fixture['name'], kind, 'TLS/HTTPS 200')
            print('PASS:', fixture['name'], kind, 'UDP STUN egress', udp_probe(local_port))
        except Exception as error:
            failed = True
            print('FAIL:', fixture['name'], kind, type(error).__name__, str(error))
        finally:
            core.terminate()
            try:
                core.wait(timeout=5)
            except subprocess.TimeoutExpired:
                core.kill()
                core.wait()
sys.exit(1 if failed else 0)
