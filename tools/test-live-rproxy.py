"""Pair an idle, existing reverse portal with a temporary generated Client."""
import http.server
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time

fixture = json.loads(Path(sys.argv[1]).read_text())
source = Path(sys.argv[2]).read_text()
assert source.count('RproxyCoutStatus=') == 1
generator = source[source.index('RproxyCoutStatus='):source.index('\nchmod 666')]


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'dex-rproxy-ok')

    def log_message(self, *_):
        pass


httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
local_port = httpd.server_address[1]
udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
udp.bind(('127.0.0.1', local_port))
udp.settimeout(.5)
stopping = threading.Event()


def echo_udp():
    while not stopping.is_set():
        try:
            data, peer = udp.recvfrom(1024)
            udp.sendto(data, peer)
        except socket.timeout:
            continue
        except OSError:
            break


threading.Thread(target=httpd.serve_forever, daemon=True).start()
threading.Thread(target=echo_udp, daemon=True).start()
core = None
try:
    with tempfile.TemporaryDirectory(prefix='dex-rproxy-live-') as directory:
        root = Path(directory)
        (root / 'RproxyC').mkdir()
        config = {'FORWARD': {'Rproxy': {'client': {
            'outStatus': 'off', 'mappingStatus': 'on',
            'tunnel': {'address': fixture.get('tunnelHost', fixture['host']) + ':' + str(fixture['port']), 'uuid': fixture['uuid']},
            'mapping': [{'extPort': fixture['mappingPort'], 'extProtocol': 'tcp,udp', 'intIP': '127.0.0.1', 'intPort': local_port}],
        }}}}
        (root / '0conf').write_text(json.dumps(config))
        script = generator.replace('/opt/de_GWD/RproxyC', str(root / 'RproxyC')).replace('/opt/de_GWD/0conf', str(root / '0conf'))
        subprocess.run(['/bin/bash', '-c', script], check=True, stdout=subprocess.DEVNULL)
        candidate = root / 'RproxyC/config.json'
        subprocess.run(['/opt/de_GWD/vtrui/vtrui', 'run', '-test', '-config', str(candidate)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        core = subprocess.Popen(['/opt/de_GWD/vtrui/vtrui', 'run', '-config', str(candidate)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        # Allow the reverse bridge's connection pool to form before its first request.
        time.sleep(3)
        host = socket.gethostbyname(fixture['host'])
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as request:
            request.settimeout(10)
            request.setsockopt(socket.SOL_SOCKET, socket.SO_MARK, 255)
            request.connect((host, fixture['mappingPort']))
            request.sendall(b'GET / HTTP/1.0\r\nHost: dex-test\r\n\r\n')
            response = b''
            while True:
                block = request.recv(4096)
                if not block:
                    break
                response += block
        assert b'dex-rproxy-ok' in response, 'Reverse TCP echo not received'
        print('PASS:', fixture['name'], 'existing RproxyS + generated RproxyC TCP mapping')
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as request:
            request.settimeout(10)
            request.setsockopt(socket.SOL_SOCKET, socket.SO_MARK, 255)
            request.sendto(b'dex-rproxy-udp', (host, fixture['mappingPort']))
            data, _ = request.recvfrom(1024)
        assert data == b'dex-rproxy-udp'
        print('PASS:', fixture['name'], 'existing RproxyS + generated RproxyC UDP mapping')
finally:
    if core is not None:
        core.terminate()
        core.wait(timeout=5)
    stopping.set()
    udp.close()
    httpd.shutdown()
    httpd.server_close()
