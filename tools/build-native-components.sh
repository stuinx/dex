#!/usr/bin/env bash
set -euo pipefail

# Run inside Dockerfile.native-components; inputs are pinned source archives.
source_dir=${1:?source archive directory required}
output_dir=${2:?output directory required}
mkdir -p "$output_dir"
cd "$source_dir"
sha256sum --check <<'CHECKSUMS'
3cf46f5ed7504d460125866b7bea99fb357f31d887e2e63b35503310e9b8b6c8  nginx-1.30.6.tar.gz
760ef35fafc1e05844e73ad07e138e9e96fddbf5de02f606249c027f754827da  haproxy-3.2.26.tar.gz
1d21be34f3b7b6d05a8142945e59b3a47665edcdfe0f3ee3d3dbef121f90c08c  ngx_brotli.tar.gz
aaa739962a45b508b2e783b915e6b2b57ed3b12bd4b0feac73acfb144dffa54f  brotli.tar.gz
31963f6eb21c11991bd7b301bed0939570093f45c95ab947e4ac54da5855d4fd  ndk.tar.gz
CHECKSUMS

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
for arch in amd64 arm64; do
  stage="$work_dir/$arch"
  mkdir -p "$stage/nginx" "$stage/haproxy" "$stage/ngx_brotli" "$stage/ndk"
  tar -xzf nginx-1.30.6.tar.gz -C "$stage/nginx" --strip-components=1
  tar -xzf haproxy-3.2.26.tar.gz -C "$stage/haproxy" --strip-components=1
  tar -xzf ngx_brotli.tar.gz -C "$stage/ngx_brotli" --strip-components=1
  tar -xzf ndk.tar.gz -C "$stage/ndk" --strip-components=1
  tar -xzf brotli.tar.gz -C "$stage/ngx_brotli/deps/brotli" --strip-components=1
  cc=gcc
  strip=strip
  lib_arch=x86_64-linux-gnu
  runner=()
  cross=()
  if [[ $arch = arm64 ]]; then
    cc=aarch64-linux-gnu-gcc
    strip=aarch64-linux-gnu-strip
    lib_arch=aarch64-linux-gnu
    runner=(qemu-aarch64 -L /)
    cross=(--crossbuild=Linux:aarch64)
    # Execute configure's target probes with QEMU, without host binfmt changes.
    sed -i 's@/bin/sh -c $NGX_AUTOTEST@qemu-aarch64 -L / $NGX_AUTOTEST@g; s@`$NGX_AUTOTEST`@`qemu-aarch64 -L / $NGX_AUTOTEST`@g' \
      "$stage/nginx/auto/feature" "$stage/nginx/auto/types/sizeof"
    sed -i 's/NGX_MACHINE=i386/NGX_MACHINE=aarch64/' "$stage/nginx/configure"
  fi
  mkdir -p "$stage/ngx_brotli/deps/brotli/out"
  cp "/usr/lib/$lib_arch/libbrotlienc.a" "/usr/lib/$lib_arch/libbrotlicommon.a" "$stage/ngx_brotli/deps/brotli/out/"
  (
    cd "$stage/nginx"
    ./configure "${cross[@]}" --with-cc="$cc" \
      --prefix=/etc/nginx --sbin-path=/usr/sbin/nginx --modules-path=/usr/lib/nginx/modules \
      --conf-path=/etc/nginx/nginx.conf --error-log-path=/var/log/nginx/error.log \
      --http-log-path=/var/log/nginx/access.log --pid-path=/run/nginx.pid --lock-path=/run/nginx.lock \
      --http-client-body-temp-path=/var/cache/nginx/client_temp \
      --http-proxy-temp-path=/var/cache/nginx/proxy_temp \
      --http-fastcgi-temp-path=/var/cache/nginx/fastcgi_temp \
      --http-uwsgi-temp-path=/var/cache/nginx/uwsgi_temp --http-scgi-temp-path=/var/cache/nginx/scgi_temp \
      --user=www-data --group=www-data --with-compat --with-file-aio --with-threads \
      --with-http_ssl_module --with-http_v2_module --with-http_v3_module --with-http_realip_module \
      --with-http_addition_module --with-http_sub_module --with-http_dav_module \
      --with-http_flv_module --with-http_mp4_module --with-http_gunzip_module \
      --with-http_gzip_static_module --with-http_auth_request_module --with-http_random_index_module \
      --with-http_secure_link_module --with-http_degradation_module --with-http_slice_module \
      --with-http_stub_status_module --with-stream --with-stream_ssl_module \
      --with-stream_ssl_preread_module --with-stream_realip_module --with-pcre-jit \
      --add-module="$stage/ngx_brotli" --add-module="$stage/ndk" \
      --with-cc-opt='-O2 -fstack-protector-strong -D_FORTIFY_SOURCE=2 -fPIC' \
      --with-ld-opt='-Wl,-z,relro -Wl,-z,now'
    make -j2
    "$strip" objs/nginx
    cp objs/nginx "$output_dir/nginx_$arch"
    "${runner[@]}" objs/nginx -V 2>"$output_dir/nginx_$arch.build.txt"
  )
  (
    cd "$stage/haproxy"
    make -j2 TARGET=linux-glibc CC="$cc" USE_OPENSSL=1 USE_PCRE2=1 USE_PCRE2_JIT=1 USE_ZLIB=1 USE_SYSTEMD=1
    "$strip" haproxy
    cp haproxy "$output_dir/haproxy_$arch"
    "${runner[@]}" ./haproxy -vv >"$output_dir/haproxy_$arch.build.txt"
  )
done
(cd "$output_dir" && sha256sum nginx_amd64 nginx_arm64 haproxy_amd64 haproxy_arm64 > SHA256SUMS)
