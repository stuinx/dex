"""Exercise candidate Nginx/HAProxy without touching production services."""
import base64
import hashlib
import http.server
from pathlib import Path
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time

binary_dir = Path(sys.argv[1])
arch = sys.argv[2]
runner = ['qemu-aarch64', '-L', '/'] if arch == 'arm64' else []
nginx = runner + [str(binary_dir / ('nginx_' + arch))]
haproxy = runner + [str(binary_dir / ('haproxy_' + arch))]


class Backend(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.headers.get('Upgrade', '').lower() == 'websocket':
            digest = hashlib.sha1((self.headers['Sec-WebSocket-Key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()
            self.send_response(101)
            self.send_header('Upgrade', 'websocket')
            self.send_header('Connection', 'Upgrade')
            self.send_header('Sec-WebSocket-Accept', base64.b64encode(digest).decode())
            self.end_headers()
        else:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'candidate-backend-ok')

    def log_message(self, *_):
        pass


def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def request(number, route='/', tls=False, extra=''):
    connection = socket.create_connection(('127.0.0.1', number), timeout=5)
    if tls:
        context = ssl._create_unverified_context()
        connection = context.wrap_socket(connection, server_hostname='localhost')
    with connection:
        connection.sendall(('GET ' + route + ' HTTP/1.1\r\nHost: localhost\r\n' + extra + '\r\n').encode())
        response = connection.recv(8192)
    return response


backend = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Backend)
threading.Thread(target=backend.serve_forever, daemon=True).start()
children = []
try:
    with tempfile.TemporaryDirectory(prefix='dex-native-test-') as directory:
        root = Path(directory)
        plain, secure, forward = port(), port(), port()
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', str(root / 'key'), '-out', str(root / 'cert')], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        config = root / 'nginx.conf'
        config.write_text(f'''
error_log {root}/nginx.log;
pid {root}/nginx.pid;
events {{ worker_connections 64; }}
http {{
 access_log off;
 client_body_temp_path {root}/body;
 proxy_temp_path {root}/proxy;
 fastcgi_temp_path {root}/fastcgi;
 uwsgi_temp_path {root}/uwsgi;
 scgi_temp_path {root}/scgi;
 brotli on; brotli_types text/plain; brotli_min_length 20;
 server {{
  listen 127.0.0.1:{plain};
  listen 127.0.0.1:{secure} ssl;
  http2 on;
  ssl_certificate {root}/cert; ssl_certificate_key {root}/key;
  location / {{ default_type text/plain; return 200 "{'candidate-body-' * 100}"; }}
  location /ws {{
   proxy_pass http://127.0.0.1:{backend.server_address[1]};
   proxy_http_version 1.1;
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection upgrade;
  }}
 }}
}}
''')
        check = subprocess.run(nginx + ['-t', '-p', str(root), '-c', str(config)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        assert check.returncode == 0, check.stderr
        children.append(subprocess.Popen(nginx + ['-p', str(root), '-c', str(config), '-g', 'daemon off; master_process off;'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        time.sleep(1)
        assert b'200 OK' in request(plain)
        assert b'Content-Encoding: br' in request(plain, extra='Accept-Encoding: br\r\n')
        assert b'200 OK' in request(secure, tls=True)
        upgrade = 'Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n'
        assert b'101 Switching Protocols' in request(secure, '/ws', tls=True, extra=upgrade)
        context = ssl._create_unverified_context()
        context.set_alpn_protocols(['h2'])
        with context.wrap_socket(socket.create_connection(('127.0.0.1', secure)), server_hostname='localhost') as connection:
            assert connection.selected_alpn_protocol() == 'h2'
        print('PASS:', arch, 'Nginx HTTP, HTTPS, Brotli, WebSocket TLS handshake, HTTP/2 ALPN')
        proxy = root / 'haproxy.cfg'
        proxy.write_text(f'''global
 maxconn 64
 nbthread 1
defaults
 mode tcp
 timeout connect 2s
 timeout client 5s
 timeout server 5s
frontend fixture
 bind 127.0.0.1:{forward}
 default_backend target
backend target
 server node 127.0.0.1:{plain}
''')
        subprocess.run(haproxy + ['-c', '-f', str(proxy)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        with (root / 'haproxy.log').open('w') as log:
            children.append(subprocess.Popen(haproxy + ['-db', '-f', str(proxy)], stdout=log, stderr=log))
        for _ in range(50):
            if children[-1].poll() is not None:
                raise RuntimeError((root / 'haproxy.log').read_text())
            try:
                with socket.create_connection(('127.0.0.1', forward), timeout=.2):
                    break
            except OSError:
                time.sleep(.1)
        assert b'200 OK' in request(forward)
        print('PASS:', arch, 'HAProxy configuration and TCP forwarding')
finally:
    for child in children:
        child.terminate()
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
    backend.shutdown()
    backend.server_close()
