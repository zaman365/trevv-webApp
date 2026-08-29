#!/bin/sh
set -eu

trevv_tls_dir=${TREVV_TLS_DIRECTORY:-/tls}
case "$trevv_tls_dir" in
  /*) ;;
  *) echo "TREVV_TLS_DIRECTORY must be absolute." >&2; exit 1 ;;
esac
install -d -m 0755 "$trevv_tls_dir"

if [ -s "$trevv_tls_dir/ca.crt" ] && \
  [ -s "$trevv_tls_dir/tls.crt" ] && \
  [ -s "$trevv_tls_dir/tls.key" ] && \
  openssl x509 -checkend 86400 -noout \
    -in "$trevv_tls_dir/tls.crt" >/dev/null 2>&1 && \
  openssl verify -CAfile "$trevv_tls_dir/ca.crt" \
    "$trevv_tls_dir/tls.crt" >/dev/null 2>&1
then
  exit 0
fi

trevv_tls_tmp=$(mktemp -d)
trap 'rm -rf "$trevv_tls_tmp"' EXIT

openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 30 \
  -keyout "$trevv_tls_tmp/ca.key" \
  -out "$trevv_tls_tmp/ca.crt" \
  -subj "/CN=TREVV local staging CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"

openssl req -new -newkey rsa:2048 -sha256 -nodes \
  -keyout "$trevv_tls_tmp/tls.key" \
  -out "$trevv_tls_tmp/tls.csr" \
  -subj "/CN=proxy" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "subjectAltName=IP:127.0.0.1,DNS:localhost,DNS:proxy" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"

openssl x509 -req -in "$trevv_tls_tmp/tls.csr" \
  -CA "$trevv_tls_tmp/ca.crt" \
  -CAkey "$trevv_tls_tmp/ca.key" \
  -CAcreateserial \
  -out "$trevv_tls_tmp/tls.crt" \
  -days 30 \
  -sha256 \
  -copy_extensions copy

install -m 0644 "$trevv_tls_tmp/ca.crt" "$trevv_tls_dir/ca.crt"
install -m 0644 "$trevv_tls_tmp/tls.crt" "$trevv_tls_dir/tls.crt"
install -m 0600 "$trevv_tls_tmp/tls.key" "$trevv_tls_dir/tls.key"
