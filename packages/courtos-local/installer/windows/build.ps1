# Builds CourtOS-<version>-<arch>.msi: the tray app (CourtOS.exe), the Node runtime and
# CourtOS in Program Files, started at every login.
#
#   installer\windows\build.ps1 [-Arch x64|arm64] [-NodeVersion 24.11.1] [-NodeDir DIR]
#                               [-CertificateThumbprint SHA1] [-TimestampUrl URL]
#
# Needs: Node 22+ and npm, the .NET SDK, WiX 5 (dotnet tool install --global wix --version 5.0.2;
# wix extension add --global WixToolset.Util.wixext/5.0.2), PowerShell 7.
# Node: by default the official build from nodejs.org (latest LTS, checksum verified).
# -CertificateThumbprint signs CourtOS.exe and the MSI with a code-signing certificate from the
# certificate store; without it SmartScreen warns on other computers.
param(
  [ValidateSet("x64", "arm64")] [string] $Arch = "x64",
  [string] $NodeVersion = "",
  [string] $NodeDir = "",
  [string] $CertificateThumbprint = "",
  [string] $TimestampUrl = "http://timestamp.digicert.com"
)
$ErrorActionPreference = "Stop"
# Native commands do not throw on failure; their exit code tells.
function Check([string] $step) { if ($LASTEXITCODE -ne 0) { throw "$step fehlgeschlagen ($LASTEXITCODE)." } }

$here = $PSScriptRoot
$package = (Resolve-Path (Join-Path $here "..\..")).Path
$version = (Get-Content (Join-Path $package "package.json") -Raw | ConvertFrom-Json).version
$msiVersion = $version -replace "-.*$", ""
$build = Join-Path $package "dist\windows-$Arch"
$payload = Join-Path $build "payload"
if (Test-Path $build) { Remove-Item -Recurse -Force $build }
New-Item -ItemType Directory -Force (Join-Path $payload "node") | Out-Null
Write-Host "CourtOS $version für Windows ($Arch)"

# 1. Node runtime
if ($NodeDir) {
  Copy-Item (Join-Path $NodeDir "node.exe") (Join-Path $payload "node")
  Write-Host "Node: lokal aus $NodeDir"
} else {
  if (-not $NodeVersion) {
    $releases = Invoke-RestMethod "https://nodejs.org/dist/index.json"
    $lts = $releases | Where-Object { $_.lts -and [int]($_.version.TrimStart("v").Split(".")[0]) -ge 22 } | Select-Object -First 1
    $NodeVersion = $lts.version.TrimStart("v")
  }
  $name = "node-v$NodeVersion-win-$Arch"
  $cache = Join-Path $package "dist\cache"
  New-Item -ItemType Directory -Force $cache | Out-Null
  $zip = Join-Path $cache "$name.zip"
  if (-not (Test-Path $zip)) { Invoke-WebRequest "https://nodejs.org/dist/v$NodeVersion/$name.zip" -OutFile $zip }
  $sums = (Invoke-WebRequest "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt").Content
  $line = ($sums -split "`n") | Where-Object { $_ -match "  $([regex]::Escape("$name.zip"))$" } | Select-Object -First 1
  if (-not $line) { throw "Keine Prüfsumme für $name." }
  $expected = $line.Split(" ")[0]
  $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected) { throw "Prüfsumme von $name stimmt nicht." }
  Expand-Archive $zip -DestinationPath $build
  Copy-Item (Join-Path $build "$name\node.exe"), (Join-Path $build "$name\LICENSE") (Join-Path $payload "node")
  Write-Host "Node: v$NodeVersion von nodejs.org (Prüfsumme geprüft)"
}

# 2. CourtOS itself, with its dependencies. npm runs scripts with cmd.exe here, so the prepack
#    step (copy the licence) is done by hand. Optional native modules are left out, as on macOS.
Copy-Item (Join-Path $package "..\..\LICENSE") (Join-Path $package "LICENSE")
Push-Location $package
try { npm pack --silent --ignore-scripts --pack-destination $build | Out-Null; Check "npm pack" } finally { Pop-Location }
$app = Join-Path $payload "app"
npm install --silent --no-audit --no-fund --omit=dev --omit=optional --ignore-scripts --prefix $app (Join-Path $build "courtos-local-$version.tgz")
Check "npm install"
Remove-Item (Join-Path $app "package.json"), (Join-Path $app "package-lock.json")

# 3. The tray app
dotnet build (Join-Path $here "CourtOS.csproj") -c Release -o (Join-Path $build "exe") "-p:Version=$msiVersion"
Check "dotnet build"
Copy-Item (Join-Path $build "exe\CourtOS.exe"), (Join-Path $build "exe\CourtOS.exe.config") $payload

# 4. Signing
$signtool = $null
if ($CertificateThumbprint) {
  $signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" | Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $signtool) { throw "signtool.exe nicht gefunden (Windows SDK)." }
  & $signtool.FullName sign /sha1 $CertificateThumbprint /fd sha256 /tr $TimestampUrl /td sha256 (Join-Path $payload "CourtOS.exe")
  Check "signtool"
} else {
  Write-Host "Hinweis: nicht signiert. Für andere Computer -CertificateThumbprint angeben."
}

# 5. Package
$out = Join-Path $package "dist\CourtOS-$version-$Arch.msi"
wix build (Join-Path $here "Package.wxs") -arch $Arch -d "Version=$msiVersion" -d "Payload=$payload" -ext WixToolset.Util.wixext -o $out
Check "wix build"
if ($signtool) {
  & $signtool.FullName sign /sha1 $CertificateThumbprint /fd sha256 /tr $TimestampUrl /td sha256 /d CourtOS $out
  Check "signtool"
}
Write-Host ("Fertig: $out ({0:N0} MB)" -f ((Get-Item $out).Length / 1MB))
