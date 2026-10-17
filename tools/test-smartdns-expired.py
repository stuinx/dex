#!/usr/bin/env python3
"""Exercise SmartDNS upstream certificate expiry checks against a local DoH stub."""

from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import os
from pathlib import Path
import shutil
import socket
import ssl
import subprocess
import tempfile
import threading
import time

BASE = Path('/root/dex-full-acceptance-20261017')
SMARTDNS = Path('/opt/de_GWD/smartdns/smartdns')
DNS_PORT = 15432
HTTPS_PORT = 15433
ANSWER = '203.0.113.42'
VALID_NAME = 'valid.expiry-test.invalid'
EXPIRED_NAME = 'expired.expiry-test.invalid'


def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f'command failed ({result.returncode}): {args[0]} {result.stderr[-800:]}')
    return result.stdout


def assert_port_free(port):
    with socket.socket() as sock:
        try:
            sock.bind(('127.0.0.1', port))
        except OSError as error:
            raise RuntimeError(f'127.0.0.1:{port} is occupied: {error}') from error


def create_certificates(directory):
    ca_key, ca_cert = directory / 'ca.key', directory / 'ca.pem'
    run([
        'openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', str(ca_key), '-out', str(ca_cert), '-days', '3650',
        '-subj', '/CN=dex-expiry-acceptance-test-ca',
        '-addext', 'basicConstraints=critical,CA:TRUE',
        '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
    ])
    (directory / 'index.txt').write_text('')
    (directory / 'serial').write_text('1000\n')
    (directory / 'newcerts').mkdir()
    config = directory / 'ca.cnf'
    config.write_text(f'''[ ca ]
default_ca = test_ca
[ test_ca ]
database = {directory / 'index.txt'}
new_certs_dir = {directory / 'newcerts'}
certificate = {ca_cert}
private_key = {ca_key}
serial = {directory / 'serial'}
default_md = sha256
default_days = 365
policy = test_policy
unique_subject = no
[ test_policy ]
commonName = supplied
''')
    now = datetime.now(timezone.utc)
    leaves = (
        (VALID_NAME, now - timedelta(minutes=5), now + timedelta(days=30)),
        (EXPIRED_NAME, now - timedelta(days=400), now - timedelta(days=30)),
    )
    for name, not_before, not_after in leaves:
        key, csr = directory / f'{name}.key', directory / f'{name}.csr'
        cert, extensions = directory / f'{name}.pem', directory / f'{name}.ext'
        run([
            'openssl', 'req', '-new', '-newkey', 'rsa:2048', '-nodes',
            '-keyout', str(key), '-out', str(csr), '-subj', f'/CN={name}',
        ])
        extensions.write_text(f'''[ server_cert ]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:{name}
''')
        run([
            'openssl', 'ca', '-batch', '-notext', '-config', str(config),
            '-extfile', str(extensions), '-extensions', 'server_cert',
            '-startdate', not_before.strftime('%Y%m%d%H%M%SZ'),
            '-enddate', not_after.strftime('%Y%m%d%H%M%SZ'),
            '-in', str(csr), '-out', str(cert),
        ])
    run(['openssl', 'verify', '-CAfile', str(ca_cert), str(directory / f'{VALID_NAME}.pem')])
    expired = subprocess.run(
        ['openssl', 'verify', '-CAfile', str(ca_cert), str(directory / f'{EXPIRED_NAME}.pem')],
        capture_output=True, text=True,
    )
    if expired.returncode == 0 or 'expired' not in (expired.stdout + expired.stderr).lower():
        raise RuntimeError('OpenSSL did not independently identify the test leaf as expired')
    return ca_cert


def skip_name(packet, offset):
    while offset < len(packet):
        length = packet[offset]
        if length & 0xC0 == 0xC0:
            return offset + 2
        offset += 1
        if length == 0:
            return offset
        offset += length
    raise ValueError('malformed DNS name')


def build_response(query):
    if len(query) < 17:
        return None
    end = skip_name(query, 12)
    if end + 4 > len(query):
        return None
    question = query[12:end + 4]
    qtype = int.from_bytes(query[end:end + 2], 'big')
    if qtype != 1:
        return query[:2] + b'\x81\x80\x00\x01\x00\x00\x00\x00\x00\x00' + question
    answer = b'\xc0\x0c\x00\x01\x00\x01\x00\x00\x00\x1e\x00\x04' + ipaddress.IPv4Address(ANSWER).packed
    return query[:2] + b'\x81\x80\x00\x01\x00\x01\x00\x00\x00\x00' + question + answer


def encode_question(name):
    labels = b''.join(bytes((len(label),)) + label.encode('ascii') for label in name.split('.'))
    return labels + b'\x00\x00\x01\x00\x01'


class DohHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        host = self.headers.get('Host', '').split(':', 1)[0].lower()
        self.server.observed_hosts.append(host)
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        response = build_response(body)
        if self.path != '/dns-query' or response is None:
            self.send_error(400)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/dns-message')
        self.send_header('Content-Length', str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def log_message(self, _format, *_args):
        return


class QuietThreadingHTTPServer(ThreadingHTTPServer):
    def handle_error(self, _request, _client_address):
        return


def start_https_stub(directory):
    valid = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    valid.load_cert_chain(str(directory / f'{VALID_NAME}.pem'), str(directory / f'{VALID_NAME}.key'))
    expired = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    expired.load_cert_chain(str(directory / f'{EXPIRED_NAME}.pem'), str(directory / f'{EXPIRED_NAME}.key'))
    observed_sni = []

    def select_leaf(sock, server_name, _context):
        normalized = (server_name or '').lower()
        observed_sni.append(normalized)
        if normalized == EXPIRED_NAME:
            sock.context = expired
        return None

    valid.set_servername_callback(select_leaf)
    try:
        server = QuietThreadingHTTPServer(('127.0.0.1', HTTPS_PORT), DohHandler)
    except OSError:
        server = QuietThreadingHTTPServer(('127.0.0.1', 0), DohHandler)
    server.observed_hosts = []
    server.daemon_threads = True
    server.socket = valid.wrap_socket(server.socket, server_side=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread, observed_sni, server.server_address[1]


def make_config(directory, ca_cert, domain, https_port):
    config = directory / f'smartdns-{domain.split(".")[0]}.conf'
    config.write_text(f'''bind 127.0.0.1:{DNS_PORT}
bind-tcp 127.0.0.1:{DNS_PORT}
no-pidfile yes
no-daemon yes
log-level debug
cache-size 0
serve-expired no
ca-file {ca_cert}
server-https https://127.0.0.1:{https_port}/dns-query -host-name {domain} -http-host {domain} -tls-host-verify {domain}
''')
    return config


def stop_smartdns(process, log_file):
    if process is not None and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
    if log_file is not None:
        log_file.flush()
        log_file.close()


def start_smartdns(config, log_path):
    log_file = open(log_path, 'w', encoding='utf-8')
    process = subprocess.Popen(
        [str(SMARTDNS), '-f', '-c', str(config), '-p', '-', '-x'],
        stdout=log_file, stderr=subprocess.STDOUT, start_new_session=True,
    )
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if process.poll() is not None:
            log_file.flush()
            log_file.close()
            raise RuntimeError(f'SmartDNS exited during startup; see {log_path.name}')
        try:
            with socket.create_connection(('127.0.0.1', DNS_PORT), timeout=0.2):
                return process, log_file
        except OSError:
            time.sleep(0.1)
    stop_smartdns(process, log_file)
    raise RuntimeError('SmartDNS did not open the isolated TCP DNS port')


def query_a(name):
    identifier = os.urandom(2)
    query = identifier + b'\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00' + encode_question(name)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.settimeout(4)
        sock.sendto(query, ('127.0.0.1', DNS_PORT))
        try:
            response, _ = sock.recvfrom(4096)
        except socket.timeout:
            return None
    if len(response) < 12 or response[:2] != identifier:
        return None
    count = int.from_bytes(response[6:8], 'big')
    offset = skip_name(response, 12) + 4
    addresses = []
    for _ in range(count):
        offset = skip_name(response, offset)
        if offset + 10 > len(response):
            break
        rtype = int.from_bytes(response[offset:offset + 2], 'big')
        length = int.from_bytes(response[offset + 8:offset + 10], 'big')
        data = response[offset + 10:offset + 10 + length]
        if rtype == 1 and length == 4:
            addresses.append(str(ipaddress.IPv4Address(data)))
        offset += 10 + length
    return addresses


def run_case(directory, ca_cert, domain, https_port, should_answer):
    config = make_config(directory, ca_cert, domain, https_port)
    log_path = directory / f'{domain.split(".")[0]}.log'
    process = log_file = None
    try:
        process, log_file = start_smartdns(config, log_path)
        answers = query_a(domain)
        time.sleep(0.3)
        alive = process.poll() is None
        log_file.flush()
        log_text = log_path.read_text(errors='replace').lower()
        if should_answer:
            if not alive or answers != [ANSWER]:
                print('SMARTDNS_DIAGNOSTICS:')
                print('\n'.join(log_text.splitlines()[-60:]))
                raise RuntimeError(f'valid leaf case failed; answer={answers}, process_alive={alive}')
            print(f'PASS: valid leaf returned {ANSWER}; isolated SmartDNS stayed active')
        else:
            if not alive or answers not in (None, []):
                print('SMARTDNS_DIAGNOSTICS:')
                print('\n'.join(log_text.splitlines()[-60:]))
                raise RuntimeError(f'expired leaf unexpectedly answered; answer={answers}, process_alive={alive}')
            if 'expired' not in log_text:
                print('SMARTDNS_DIAGNOSTICS:')
                print('\n'.join(log_text.splitlines()[-60:]))
                raise RuntimeError('expired leaf produced no answer but SmartDNS log lacked an expiry reason')
            print('PASS: expired leaf produced no A answer; SmartDNS stayed active; log identifies expiry')
    finally:
        stop_smartdns(process, log_file)


def main():
    if os.geteuid() != 0:
        raise RuntimeError('run remotely as root on vm1224')
    if not SMARTDNS.is_file() or not os.access(SMARTDNS, os.X_OK):
        raise RuntimeError('installed SmartDNS binary is unavailable')
    if not shutil.which('openssl'):
        raise RuntimeError('openssl is unavailable')
    assert_port_free(DNS_PORT)
    BASE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='smartdns-expired-', dir=BASE) as temp:
        directory = Path(temp)
        ca_cert = create_certificates(directory)
        stub, thread, observed_sni, https_port = start_https_stub(directory)
        try:
            run_case(directory, ca_cert, VALID_NAME, https_port, True)
            run_case(directory, ca_cert, EXPIRED_NAME, https_port, False)
            expected = {VALID_NAME, EXPIRED_NAME}
            if not expected.issubset(set(observed_sni)):
                raise RuntimeError('DoH stub did not observe both configured SNI hostnames')
            if VALID_NAME not in stub.observed_hosts:
                raise RuntimeError('DoH stub did not observe the matching valid-case HTTP Host')
            print('PASS: DoH stub observed valid SNI and matching HTTP Host; expired SNI reached TLS validation')
            print(f'PASS: isolated loopback DNS {DNS_PORT} and HTTPS {https_port}; temporary CA and keys removed')
        finally:
            stub.shutdown()
            stub.server_close()
            thread.join(timeout=3)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'FAIL: {type(error).__name__}: {error}')
        raise SystemExit(1)

