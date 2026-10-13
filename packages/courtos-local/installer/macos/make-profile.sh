#!/bin/sh
# make-profile.sh <ca.crt> <out.mobileconfig>
# Wraps the CourtOS certificate authority in a configuration profile for MDM (Jamf,
# Intune, Kandji …). Since macOS 11 a script cannot trust a root certificate without a
# password; a profile from MDM can.
#
# For a managed rollout, IT runs once:
#   sh make-certificate.sh ./certs
#   sh make-profile.sh ./certs/ca.crt CourtOS-localhost.mobileconfig
# then deploys the profile, and ./certs/localhost.crt and localhost.key to
# /Library/Application Support/CourtOS/certs/ on every Mac (key readable by the users,
# e.g. root:staff 0640). The authority's key no longer exists and it may sign only for
# localhost, so the shared certificate cannot be used for any other site.
set -eu
ca="${1:?ca.crt}"
out="${2:?out.mobileconfig}"
uuid() { uuidgen | tr 'a-z' 'A-Z'; }
data=$(openssl x509 -in "$ca" -outform der | base64 | fold -w 64)
cat > "$out" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadType</key><string>com.apple.security.root</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>PayloadIdentifier</key><string>ch.courtos.local.certificate</string>
      <key>PayloadUUID</key><string>$(uuid)</string>
      <key>PayloadDisplayName</key><string>CourtOS localhost</string>
      <key>PayloadCertificateFileName</key><string>courtos-localhost.cer</string>
      <key>PayloadContent</key>
      <data>
$data
      </data>
    </dict>
  </array>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadVersion</key><integer>1</integer>
  <key>PayloadIdentifier</key><string>ch.courtos.local</string>
  <key>PayloadUUID</key><string>$(uuid)</string>
  <key>PayloadDisplayName</key><string>CourtOS: Zertifikat für localhost</string>
  <key>PayloadScope</key><string>System</string>
</dict>
</plist>
XML
