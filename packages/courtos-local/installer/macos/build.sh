#!/bin/bash
# Builds CourtOS-<version>-<arch>.pkg: CourtOS.app (menu-bar app, Node runtime, CourtOS,
# compiled OCR helper) in /Applications and a LaunchAgent that starts it at login.
#
#   installer/macos/build.sh [--arch arm64|x64] [--node-version 24.11.1] [--node-dir DIR]
#                            [--sign "Developer ID Application: …"]
#                            [--installer-sign "Developer ID Installer: …"]
#                            [--notary-profile PROFILE]
#
# Node: by default the official build from nodejs.org (latest LTS, checksum verified).
# --node-dir uses a local one instead (a folder with bin/node; for trying a build on the
# build machine only — a Homebrew Node links libraries from /opt/homebrew).
# Without --sign the app is signed ad hoc and the package unsigned: fine for trying,
# but Gatekeeper warns on other Macs. --notary-profile is a `xcrun notarytool
# store-credentials` profile.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
package=$(cd "$here/../.." && pwd)
arch=$(uname -m | sed 's/x86_64/x64/')
node_version="" node_dir="" sign="" installer_sign="" notary=""
while [ $# -gt 0 ]; do
  case "$1" in
    --arch) arch="$2"; shift 2 ;;
    --node-version) node_version="$2"; shift 2 ;;
    --node-dir) node_dir="$2"; shift 2 ;;
    --sign) sign="$2"; shift 2 ;;
    --installer-sign) installer_sign="$2"; shift 2 ;;
    --notary-profile) notary="$2"; shift 2 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
done
case "$arch" in arm64) swift_arch=arm64 ;; x64) swift_arch=x86_64 ;; *) echo "--arch arm64 oder x64" >&2; exit 2 ;; esac

version=$(node -p "require('$package/package.json').version")
build="$package/dist/macos-$arch"
app="$build/root/Applications/CourtOS.app"
rm -rf "${build:?}"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/bin" "$build/root/Library/LaunchAgents"
echo "CourtOS $version für macOS ($arch)"

# 1. Node runtime
node_target="$app/Contents/Resources/node"
mkdir -p "$node_target/bin"
if [ -n "$node_dir" ]; then
  cp "$node_dir/bin/node" "$node_target/bin/node"
  for lib in "$node_dir"/lib/libnode*.dylib; do [ -f "$lib" ] && mkdir -p "$node_target/lib" && cp "$lib" "$node_target/lib/"; done
  echo "Node: lokal aus $node_dir (nur zum Ausprobieren auf diesem Mac)"
else
  if [ -z "$node_version" ]; then
    node_version=$(curl -fsSL https://nodejs.org/dist/index.json | node -e '
      let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
        const lts = JSON.parse(s).find(r => r.lts && Number(r.version.slice(1).split(".")[0]) >= 22);
        console.log(lts.version.slice(1));
      });')
  fi
  name="node-v$node_version-darwin-$arch"
  cache="$package/dist/cache"
  mkdir -p "$cache"
  [ -f "$cache/$name.tar.gz" ] || curl -fsSL -o "$cache/$name.tar.gz" "https://nodejs.org/dist/v$node_version/$name.tar.gz"
  curl -fsSL "https://nodejs.org/dist/v$node_version/SHASUMS256.txt" | grep " $name.tar.gz\$" > "$cache/$name.sha256"
  (cd "$cache" && shasum -a 256 -c "$name.sha256" >/dev/null) || { echo "Prüfsumme von $name stimmt nicht." >&2; exit 1; }
  tar -xzf "$cache/$name.tar.gz" -C "$build" "$name/bin/node" "$name/LICENSE"
  cp "$build/$name/bin/node" "$node_target/bin/node"
  cp "$build/$name/LICENSE" "$node_target/LICENSE"
  echo "Node: v$node_version von nodejs.org (Prüfsumme geprüft)"
fi

# 2. CourtOS itself, with its dependencies. Optional native modules (pdf.js's canvas) are
#    left out: CourtOS does not use them, and the payload stays the same for both CPUs.
(cd "$package" && npm pack --silent --pack-destination "$build" >/dev/null)
npm install --silent --no-audit --no-fund --omit=dev --omit=optional --ignore-scripts \
  --prefix "$app/Contents/Resources/app" "$build/courtos-local-$version.tgz"
rm -f "$app/Contents/Resources/app/package.json" "$app/Contents/Resources/app/package-lock.json"

# 3. The menu-bar app and the OCR helper, for the target CPU
swiftc -O -target "$swift_arch-apple-macos13" -o "$app/Contents/MacOS/CourtOS" "$here/CourtOS.swift"
swiftc -O -target "$swift_arch-apple-macos13" -o "$app/Contents/Resources/bin/ocr-vision" "$package/scripts/ocr-vision.swift"
cp "$here/make-certificate.sh" "$here/make-profile.sh" "$here/uninstall.sh" "$app/Contents/Resources/"
sed "s/@VERSION@/$version/g" "$here/Info.plist" > "$app/Contents/Info.plist"
iconset="$build/AppIcon.iconset"
mkdir -p "$iconset"
for size in 16 32 64 128; do sips -z $size $size "$package/web/icon-128.png" --out "$iconset/icon_${size}x${size}.png" >/dev/null; done
for size in 16 32 64; do cp "$iconset/icon_$((size * 2))x$((size * 2)).png" "$iconset/icon_${size}x${size}@2x.png"; done
rm -f "$iconset/icon_64x64.png" "$iconset/icon_64x64@2x.png"
iconutil -c icns -o "$app/Contents/Resources/AppIcon.icns" "$iconset" 2>/dev/null || echo "Hinweis: kein App-Symbol erzeugt."
cp "$here/ch.courtos.local.plist" "$build/root/Library/LaunchAgents/"

# pkgbuild cannot write a folder name with a precomposed "ä" (NFC) and accepts
# the decomposed form (NFD), as HFS+ wrote it; CourtOS reads names either way.
# Before signing: the signature seals the names.
node -e '
  const { readdirSync, renameSync } = require("node:fs"), { join } = require("node:path");
  const walk = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    let path = join(dir, entry.name);
    const nfd = entry.name.normalize("NFD");
    if (nfd !== entry.name) { renameSync(path, join(dir, nfd)); path = join(dir, nfd); }
    if (entry.isDirectory()) walk(path);
  } };
  walk(process.argv[1]);' "$build/root"
# Extended attributes (provenance, quarantine) would land in the package as ._ files.
xattr -cr "$build/root" 2>/dev/null || true
export COPYFILE_DISABLE=1

# 4. Signing: inside out, Node with the entitlements V8 needs under the hardened runtime.
if [ -n "$sign" ]; then
  codesign --force --timestamp --options runtime --entitlements "$here/node.entitlements" -s "$sign" "$app/Contents/Resources/node/bin/node"
  codesign --force --timestamp --options runtime -s "$sign" "$app/Contents/Resources/bin/ocr-vision"
  find "$app/Contents/Resources/app" \( -name '*.node' -o -name '*.dylib' \) -exec codesign --force --timestamp --options runtime -s "$sign" {} \;
  codesign --force --timestamp --options runtime -s "$sign" "$app"
else
  codesign --force -s - "$app/Contents/Resources/bin/ocr-vision"
  codesign --force -s - "$app"
  echo "Hinweis: nicht signiert (ad hoc). Für andere Macs --sign und --installer-sign angeben."
fi
codesign --verify --deep --strict "$app"

# 5. Package. The app is not relocatable: an update always lands in /Applications.
pkgbuild --analyze --root "$build/root" "$build/components.plist" >/dev/null
plutil -replace 0.BundleIsRelocatable -bool NO "$build/components.plist"
pkgbuild --quiet --root "$build/root" --component-plist "$build/components.plist" --scripts "$here/scripts" \
  --identifier ch.courtos.local --version "$version" --install-location / "$build/CourtOS-component.pkg"
# A distribution with a title, so the Installer window reads "Install CourtOS", not "Install ".
productbuild --synthesize --package "$build/CourtOS-component.pkg" "$build/synthesized.xml"
awk '{ print } /<installer-gui-script/ { print "    <title>CourtOS</title>" }' "$build/synthesized.xml" > "$build/distribution.xml"
out="$package/dist/CourtOS-$version-$arch.pkg"
if [ -n "$installer_sign" ]; then
  productbuild --quiet --distribution "$build/distribution.xml" --package-path "$build" --sign "$installer_sign" "$out"
else
  productbuild --quiet --distribution "$build/distribution.xml" --package-path "$build" "$out"
fi

if [ -n "$notary" ]; then
  xcrun notarytool submit "$out" --keychain-profile "$notary" --wait
  xcrun stapler staple "$out"
fi
echo "Fertig: $out ($(du -h "$out" | cut -f1))"
