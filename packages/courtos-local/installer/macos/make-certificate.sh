#!/bin/sh
# make-certificate.sh <folder>
# Makes a certificate authority that may sign only for "localhost" and 127.0.0.1, signs
# one certificate for https://localhost with it, and deletes the authority's key, so that
# nothing else can ever be signed with it. Writes ca.crt, localhost.crt and localhost.key.
# Trusting ca.crt is a separate step: the CourtOS app asks the user, or IT deploys it
# with a configuration profile (make-profile.sh).
set -eu
dir="${1:?folder}"
umask 077
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

cat > "$work/openssl.cnf" <<'CNF'
[req]
distinguished_name = dn
prompt = no
[dn]
CN = CourtOS localhost
O = CourtOS
[ca]
basicConstraints = critical, CA:true, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
nameConstraints = critical, permitted;DNS:localhost, permitted;IP:127.0.0.1/255.255.255.255
subjectKeyIdentifier = hash
[leaf]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:localhost, IP:127.0.0.1
authorityKeyIdentifier = keyid
subjectKeyIdentifier = hash
CNF

openssl req -x509 -new -newkey rsa:2048 -nodes -sha256 -days 3650 \
  -keyout "$work/ca.key" -out "$work/ca.crt" -config "$work/openssl.cnf" -extensions ca 2>/dev/null
openssl req -new -newkey rsa:2048 -nodes -sha256 -subj "/CN=localhost" \
  -keyout "$work/localhost.key" -out "$work/localhost.csr" 2>/dev/null
# 825 days is the longest validity macOS accepts for a server certificate.
openssl x509 -req -sha256 -days 825 -in "$work/localhost.csr" -CA "$work/ca.crt" -CAkey "$work/ca.key" \
  -set_serial "0x$(openssl rand -hex 16)" -extfile "$work/openssl.cnf" -extensions leaf -out "$work/localhost.crt" 2>/dev/null
rm -f "$work/ca.key"

mkdir -p "$dir"
cp "$work/ca.crt" "$work/localhost.crt" "$work/localhost.key" "$dir/"
chmod 644 "$dir/ca.crt" "$dir/localhost.crt"
chmod 600 "$dir/localhost.key"
