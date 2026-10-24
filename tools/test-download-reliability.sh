#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
test_root=$(mktemp -d "${TMPDIR:-/tmp}/de-gwd-download-test.XXXXXX")
trap 'rm -rf -- "$test_root"' EXIT
printf 'Bash: %s (%s)\n' "$BASH_VERSION" "$BASH"

sha256_text(){
  printf '%s' "$1" | sha256sum | awk '{print$1}'
}

extract_function(){
  local name=$1
  local source_file=$2
  awk -v declaration="${name}(){" '$0 == declaration {inside=1} inside {print} inside && /^}$/ {exit}' "$source_file"
}

report_case_failure(){
  local fixture=$1
  local reason=$2
  printf 'FAIL: %s\n' "$reason" >&2
  if [[ -f $fixture/output.log ]]; then
    printf '%s\n' 'Sanitized output.log:' >&2
    sed -E -e "s|$fixture|<fixture>|g" -e 's#https?://[^[:space:]]+#<url>#g' "$fixture/output.log" >&2
  else
    printf '%s\n' 'output.log is missing' >&2
  fi
  if [[ -f $fixture/args.log ]]; then
    printf '%s\n' 'Sanitized args.log:' >&2
    sed -E -e "s|$fixture|<fixture>|g" -e 's#https?://[^[:space:]]+#<url>#g' "$fixture/args.log" >&2
  else
    printf '%s\n' 'args.log is missing' >&2
  fi
}

run_client_case(){
  local mode=$1
  local fixture="$test_root/client-$mode"
  local oldPayload='existing-valid-client-config'
  local goodPayload='replacement-client-config'
  local partialPayload='partial-client-download'
  local target="$fixture/opt/de_GWD/.repo/nginxConf.zip"
  local status=0
  mkdir -p "$fixture/usr/sbin" "$fixture/opt/de_GWD/.repo" "$fixture/tmp"
  printf '%s' 'current-nginx' >"$fixture/usr/sbin/nginx"
  printf '%s' 'current-client-archive' >"$fixture/opt/de_GWD/.repo/client.zip"
  printf '%s\n' 'old-version' >"$fixture/opt/de_GWD/.repo/version.php"
  printf '%s' "$oldPayload" >"$target"

  (
    set +e
    WHITE='' RED='' GREEN='' cRES=''
    repoBase='https://repo.invalid'
    architecture=amd64
    TTYD_Ver=1.7.7
    DOWNLOAD_MODE=$mode
    ARG_LOG="$fixture/args.log"
    HASH_NGINX=$(sha256_text 'current-nginx')
    HASH_CONFIG=$(sha256_text "$goodPayload")
    HASH_ARCHIVE=$(sha256_text 'current-client-archive')
    GOOD_PAYLOAD=$goodPayload
    PARTIAL_PAYLOAD=$partialPayload

    extract_function checkSum "$repo_root/client" >"$fixture/checkSum.bash"
    source "$fixture/checkSum.bash"
    extract_function repoDL "$repo_root/client" | sed \
      -e "s|/tmp/|$fixture/tmp/|g" \
      -e "s|/opt/de_GWD/.repo|$fixture/opt/de_GWD/.repo|g" \
      -e "s|/usr/sbin/nginx|$fixture/usr/sbin/nginx|g" >"$fixture/repoDL.bash"
    source "$fixture/repoDL.bash"

    timeout(){
      printf 'timeout %s\n' "$*" >>"$ARG_LOG"
      while [[ ${1-} == --* ]]; do shift; done
      shift
      "$@"
    }
    curl(){
      printf 'curl %s\n' "$*" >>"$ARG_LOG"
      case "$*" in
        *nginx_amd64.sha256sum*) printf '%s\n' "$HASH_NGINX" ;;
        *nginxConf.zip.sha256sum*) printf '%s\n' "$HASH_CONFIG" ;;
        *Archive.zip.sha256sum*) printf '%s  Archive.zip\n' "$HASH_ARCHIVE" ;;
        *version.php*) printf '%s\n' 'old-version' ;;
        *) return 2 ;;
      esac
    }
    wget(){
      local output=''
      local i
      local -a args=("$@")
      printf 'wget %s\n' "${args[*]}" >>"$ARG_LOG"
      for ((i=0; i<${#args[@]}; i++)); do
        case ${args[i]} in
          -cqO|-qO|-O)
            i=$((i + 1))
            output=${args[i]}
            ;;
        esac
      done
      [[ -n $output ]] || return 2
      case $DOWNLOAD_MODE in
        fail) printf '%s' "$PARTIAL_PAYLOAD" >"$output"; return 8 ;;
        mismatch) printf '%s' "$PARTIAL_PAYLOAD" >"$output" ;;
        success) printf '%s' "$GOOD_PAYLOAD" >"$output" ;;
      esac
    }
    ttyd(){ printf '%s\n' "$TTYD_Ver"; }
    unzip(){ printf '%s\n' 'No errors detected in compressed data'; }

    repoDL
  ) >"$fixture/output.log" 2>&1 || status=$?

  if [[ $mode == success ]]; then
    if [[ $status -ne 0 ]]; then
      report_case_failure "$fixture" "client repoDL success returned status $status"
      return 1
    fi
    if [[ $(<"$target") != "$goodPayload" ]]; then
      report_case_failure "$fixture" 'client repoDL success did not replace the target with verified content'
      return 1
    fi
  else
    if [[ $status -eq 0 ]]; then
      report_case_failure "$fixture" "client repoDL $mode unexpectedly succeeded"
      return 1
    fi
    if [[ $(<"$target") != "$oldPayload" ]]; then
      report_case_failure "$fixture" "client repoDL $mode changed the existing target"
      return 1
    fi
  fi
  if ! assert_download_bounds "$fixture/args.log"; then
    report_case_failure "$fixture" "client repoDL $mode did not pass all timeout/retry bounds"
    return 1
  fi
  printf 'PASS client repoDL %s\n' "$mode"
}

run_server_case(){
  local mode=$1
  local fixture="$test_root/server-$mode"
  local oldPayload='existing-valid-server-archive'
  local goodPayload='replacement-server-archive'
  local partialPayload='partial-server-download'
  local target="$fixture/opt/de_GWD/.repo/de_GWD.zip"
  local status=0
  mkdir -p "$fixture/opt/de_GWD/.repo" "$fixture/tmp" "$fixture/usr/sbin"
  if [[ $mode == fail ]]; then
    printf '%s' 'retained-prefix-' >"$fixture/tmp/de_GWD_amd64.zip"
  fi
  printf '%s' 'current-doh-server' >"$fixture/opt/de_GWD/doh-server"
  printf '%s' 'current-nginx' >"$fixture/usr/sbin/nginx"
  printf '%s' 'current-nginx-config' >"$fixture/opt/de_GWD/.repo/nginxConf.zip"
  printf '%s' 'current-sample' >"$fixture/opt/de_GWD/.repo/sample.zip"
  printf '%s\n' 'old-version' >"$fixture/opt/de_GWD/version.php"
  printf '%s' "$oldPayload" >"$target"

  (
    set +e
    WHITE='' RED='' GREEN='' cRES=''
    repoBase='https://repo.invalid'
    architecture=amd64
    DOWNLOAD_MODE=$mode
    ARG_LOG="$fixture/args.log"
    HASH_DOWNLOAD=$(sha256_text "$goodPayload")
    HASH_DOH=$(sha256_text 'current-doh-server')
    HASH_NGINX=$(sha256_text 'current-nginx')
    HASH_CONFIG=$(sha256_text 'current-nginx-config')
    HASH_SAMPLE=$(sha256_text 'current-sample')
    GOOD_PAYLOAD=$goodPayload
    PARTIAL_PAYLOAD=$partialPayload

    extract_function checkSum "$repo_root/server" >"$fixture/checkSum.bash"
    source "$fixture/checkSum.bash"
    extract_function repoDL "$repo_root/server" | sed \
      -e "s|/tmp/|$fixture/tmp/|g" \
      -e "s|/opt/de_GWD/.repo|$fixture/opt/de_GWD/.repo|g" \
      -e "s|/opt/de_GWD/doh-server|$fixture/opt/de_GWD/doh-server|g" \
      -e "s|/opt/de_GWD/version.php|$fixture/opt/de_GWD/version.php|g" \
      -e "s|/usr/sbin/nginx|$fixture/usr/sbin/nginx|g" >"$fixture/repoDL.bash"
    source "$fixture/repoDL.bash"

    timeout(){
      printf 'timeout %s\n' "$*" >>"$ARG_LOG"
      while [[ ${1-} == --* ]]; do shift; done
      shift
      "$@"
    }
    curl(){
      printf 'curl %s\n' "$*" >>"$ARG_LOG"
      case "$*" in
        *de_GWD_amd64.zip.sha256sum*) printf '%s\n' "$HASH_DOWNLOAD" ;;
        *doh_s_amd64.sha256sum*) printf '%s\n' "$HASH_DOH" ;;
        *nginx_amd64.sha256sum*) printf '%s\n' "$HASH_NGINX" ;;
        *nginxConf.zip.sha256sum*) printf '%s\n' "$HASH_CONFIG" ;;
        *server/sample.zip.sha256sum*) printf '%s\n' "$HASH_SAMPLE" ;;
        *version.php*) printf '%s\n' 'old-version' ;;
        *) return 2 ;;
      esac
    }
    wget(){
      local output='' url=''
      local i
      local -a args=("$@")
      printf 'wget %s\n' "${args[*]}" >>"$ARG_LOG"
      for ((i=0; i<${#args[@]}; i++)); do
        case ${args[i]} in
          --directory-prefix=*)
            output=${args[i]#*=}
            ;;
          http://*|https://*)
            url=${args[i]}
            ;;
        esac
      done
      [[ -n $output && -n $url ]] || return 2
      output="$output/${url##*/}"
      case $DOWNLOAD_MODE in
        fail) printf '%s' "$PARTIAL_PAYLOAD" >>"$output"; return 8 ;;
        mismatch) printf '%s' "$PARTIAL_PAYLOAD" >"$output" ;;
        success) printf '%s' "$GOOD_PAYLOAD" >"$output" ;;
      esac
    }
    unzip(){ printf '%s\n' 'No errors detected in compressed data'; }
    systemctl(){ return 0; }

    repoDL
  ) >"$fixture/output.log" 2>&1 || status=$?

  if [[ $mode == success ]]; then
    if [[ $status -ne 0 ]]; then
      report_case_failure "$fixture" "server repoDL success returned status $status"
      return 1
    fi
    if [[ $(<"$target") != "$goodPayload" ]]; then
      report_case_failure "$fixture" 'server repoDL success did not replace the target with verified content'
      return 1
    fi
  else
    if [[ $status -eq 0 ]]; then
      report_case_failure "$fixture" "server repoDL $mode unexpectedly succeeded"
      return 1
    fi
    if [[ $(<"$target") != "$oldPayload" ]]; then
      report_case_failure "$fixture" "server repoDL $mode changed the existing target"
      return 1
    fi
    if [[ $mode == fail && $(<"$fixture/tmp/de_GWD_amd64.zip") != "retained-prefix-$partialPayload" ]]; then
      report_case_failure "$fixture" 'server repoDL did not retain the interrupted archive for resume'
      return 1
    fi
  fi
  if ! assert_download_bounds "$fixture/args.log"; then
    report_case_failure "$fixture" "server repoDL $mode did not pass all timeout/retry bounds"
    return 1
  fi
  if ! grep -Fq -- 'timeout --signal=TERM --kill-after=5s 1800s' "$fixture/args.log" \
    || ! grep -Fq -- 'wget --continue --directory-prefix=' "$fixture/args.log" \
    || grep -Eq -- 'wget .* -O |wget .* -qO' "$fixture/args.log"; then
    report_case_failure "$fixture" "server repoDL $mode did not use resumable long-download settings"
    return 1
  fi
  printf 'PASS server repoDL %s\n' "$mode"
}

assert_download_bounds(){
  local log_file=$1
  grep -Fq -- 'curl --connect-timeout 10 --max-time 60 --retry 3 --retry-delay 2 --retry-max-time 180' "$log_file"
  grep -Eq -- 'timeout --signal=TERM --kill-after=5s (300s|1800s)' "$log_file"
  grep -Eq -- 'wget (--continue )?(--directory-prefix=[^ ]+ )?--connect-timeout=10 --read-timeout=30 --tries=4 --waitretry=2|wget --connect-timeout=10 --read-timeout=30 --tries=4 --waitretry=2' "$log_file"
}

run_client_case fail
run_client_case mismatch
run_client_case success
run_server_case fail
run_server_case mismatch
run_server_case success
printf '%s\n' 'PASS: isolated client/server core downloads preserve old files on transfer/checksum failure and replace only after checksum success'
