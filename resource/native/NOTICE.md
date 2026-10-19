# Native component distribution

Nginx 1.30.6 and HAProxy 3.2.26 are built using
`tools/Dockerfile.native-components` and `tools/build-native-components.sh`.
Source URLs, pinned checksums and the verified Nginx signing fingerprint are
recorded in `tools/native-component-sources.json`.

Corresponding source archives, including their original license files, are
provided in `resource/native/sources/`. The build recipe records the small
configure-probe changes used for ARM64 user-mode emulation.

Nginx and ngx_brotli are distributed under the BSD 2-clause license, the
Nginx Development Kit under BSD 3-clause, and Brotli under the MIT license.
Copyright and license notices are in `LICENSES.txt` and the source archives.
HAProxy is distributed under its upstream GPLv2 and applicable component
licenses/OpenSSL exception; see LICENSE and doc/gpl.txt within
haproxy-3.2.26.tar.gz for the complete upstream terms.

Nginx links Brotli statically from Debian bookworm's libbrotli-dev package.
Other system libraries are dynamically linked and remain managed by Debian.
These builds use the standard libc allocator, not the previous custom
mimalloc/tcmalloc linkage; dynamic Perl/XSLT modules are not shipped.
