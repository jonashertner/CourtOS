# Installing CourtOS

One installer per operating system. Each one puts the same three things on the computer:

- the Node runtime (the official build from nodejs.org, checksum verified at build time);
- CourtOS itself;
- a small app in the menu bar (macOS) or the notification area (Windows).

The app starts CourtOS at login and shows whether it is running and whether a job is running. It opens the browser already paired, sets up the Word add-in and makes the certificate Word needs.

Nobody has to install Node or npm, or type a command.

| | macOS | Windows |
| --- | --- | --- |
| Package | `CourtOS-<version>-<arch>.pkg` | `CourtOS-<version>-<arch>.msi` |
| Installs to | `/Applications/CourtOS.app` | `C:\Program Files\CourtOS` |
| Starts at login | LaunchAgent `/Library/LaunchAgents/ch.courtos.local.plist` | `HKLM\…\CurrentVersion\Run` value `CourtOS` |
| Log | `~/Library/Logs/CourtOS/courtos.log` | `%LOCALAPPDATA%\CourtOS\courtos.log` |
| Certificate for all users | `/Library/Application Support/CourtOS/certs` | `%ProgramData%\CourtOS\certs` |
| Certificate for one user | `~/Library/Application Support/CourtOS/certs` | `%LOCALAPPDATA%\CourtOS\certs` |

The log never contains a pairing link.

## Why there is a certificate

Over plain HTTP, browsers may mark CourtOS as not secure, and Word loads add-ins over HTTPS only, even from this computer. CourtOS therefore needs a certificate for `https://localhost` that the computer trusts.

The installers make one:

1. a certificate authority that may sign for `localhost` and `127.0.0.1` only (a critical name constraint);
2. one server certificate, signed by that authority;
3. the authority's key is then discarded.

Even if someone copied the files, they could not use them to impersonate any other site.

Without the certificate the browser still works, over plain HTTP on 127.0.0.1, and may warn about it; Word does not work.

macOS lets no installer trust a certificate silently: the user confirms it once with their password, or IT deploys a configuration profile (see below). On Windows the installer trusts it for all users.

## For a tester

**macOS.** Open the `.pkg` and follow the installer.

- CourtOS starts and opens the browser.
- Before the browser opens, it offers **Sichere Verbindung einrichten …**. macOS asks for your password once, to trust the certificate in your login keychain. The browser then opens CourtOS over HTTPS without a warning.
- If you choose **Später**, CourtOS runs over plain HTTP and asks again at the next start by hand. The same item is in the CourtOS menu.
- If Word is installed, the add-in is set up at the same time.
- Restart Word. **CourtOS › Fallordner** appears on the Home tab.

**Windows.** Open the `.msi`. The installer needs administrator rights.

- It makes the certificate for all users of the computer, so Windows asks nothing further.
- CourtOS starts and opens the browser.
- The Word add-in is set up on the first start.
- Restart Word. **CourtOS › Fallordner** appears on the Home tab.

**Afterwards, on both systems:**

The menu is in the language chosen in CourtOS, else in the system language (German, French, Italian or English). Its texts are in `src/menu.json`. The German items:

- **CourtOS im Browser öffnen** in the menu (or a double-click on the tray icon on Windows) opens a new, paired browser tab.
- **Word-Add-in einrichten** repeats the add-in setup.
- **Protokoll anzeigen** opens the log.

Unsigned test builds warn when opened:

- macOS: the package "cannot be opened". Open **System Settings › Privacy & Security** and choose **Open Anyway** (since macOS 15 right-clicking and choosing **Open** no longer skips the check).
- Windows: SmartScreen. Choose **More info › Run anyway**.

Signed builds do not warn (see [Building](#building)).

## For IT: rolling out to many computers

In most courts users cannot install software. IT deploys the package with its usual tool, and both packages install silently.

### macOS (Jamf, Intune, Kandji, Munki)

1. Deploy `CourtOS-<version>-<arch>.pkg`. The postinstall script starts CourtOS for the user who is logged in. Everyone else gets it at their next login.
2. Make one certificate for the whole court, on any Mac:

   ```sh
   sh make-certificate.sh ./certs
   sh make-profile.sh ./certs/ca.crt CourtOS-localhost.mobileconfig
   ```

   Both scripts are in this folder and in `CourtOS.app/Contents/Resources/`.
3. Deploy `CourtOS-localhost.mobileconfig` as a configuration profile.
   - It trusts the authority as a root certificate.
   - Since macOS 11 only an MDM profile can do this without asking the user for a password.
4. Deploy `certs/localhost.crt` and `certs/localhost.key` to `/Library/Application Support/CourtOS/certs/`.
   - The key must be readable by the users, for example `root:staff 0640`.
5. Keep `certs/ca.crt` with the profile. Do not keep a key for it; none exists.

With the profile and the folder in place, CourtOS uses the shared certificate and never offers to make its own.

The certificate is valid for 825 days. Before it expires, repeat steps 2 to 4.

### Windows (Intune, SCCM/ConfigMgr, Group Policy)

```bat
msiexec /i CourtOS-<version>-x64.msi /qn
```

- The MSI makes the certificate for all users itself, as the installing system account, and trusts it in the computer's root store.
- If IT distributes its own certificate instead, add `INSTALLCERTIFICATE=0`. Then put `localhost.crt` and `localhost.key` (PEM) in `%ProgramData%\CourtOS\certs` and the authority in the computers' Trusted Root store, for example by Group Policy.
- A silent install does not start CourtOS. It starts at each user's next login.
- An update (a newer MSI) replaces the old version and keeps a certificate that is still trusted.
- Uninstalling removes the computer-wide certificate and its folder.
  - A per-user certificate a user made from the tray menu stays in that user's store. Remove it with `certmgr.msc` › Trusted Root Certification Authorities › "CourtOS localhost".

The port is 4311. To change it on every computer, set the DWORD `HKLM\Software\CourtOS\Port`.

On macOS the port comes from the user default `Port` in the domain `ch.courtos.local`, which a profile can set.

The Word add-in must then use the same port (see below).

### Checking an installation

```sh
/Applications/CourtOS.app/Contents/MacOS/CourtOS --check
```

```bat
"C:\Program Files\CourtOS\CourtOS.exe" --check
```

Each prints:

- which certificate CourtOS uses;
- a one-time link;
- the status as JSON.

It exits with 0 when CourtOS started. Run it while CourtOS is not running, or set `COURTOS_PORT` to a free port.

## The Word add-in for a whole court

The tray and menu-bar apps register the add-in for the user who runs them ("sideloading"). That suffices for testers.

For a court, Microsoft 365 can deploy the add-in centrally, so it appears in everyone's Word without any setup:

1. Microsoft 365 admin center › **Settings › Integrated apps › Upload custom apps**. A Global Administrator or Exchange Administrator must do this.
2. Choose **Office Add-in** and upload the manifest.
   - The manifest is `word/manifest.xml` in the repository, or `app/node_modules/@courtos/local/word/manifest.xml` inside an installation.
   - If the court changed the port, replace `4311` in the manifest first.
3. Assign it to the users or groups who use CourtOS.
4. It can take up to 24 hours to appear in Word.

**Not yet tested:** whether the admin center accepts a manifest whose pages are at `https://localhost`. Every user's CourtOS serves the add-in from their own computer, so the URL is the same for everyone. Validation might still reject it.

If it does, use a shared-folder catalog (Windows only):

1. Put `manifest.xml` in a network share that the users can read.
2. Add the share as a trusted catalog by Group Policy or a registry script, under `HKCU\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\{a GUID}`:
   - `Id` = the GUID;
   - `Url` = `\\server\share`;
   - `Flags` = 1 (DWORD).
3. Users then find CourtOS under **Add-ins › Shared Folder** in Word.

Microsoft describes this in "Create a network shared folder catalog for task pane and content add-ins" (learn.microsoft.com/office/dev/add-ins/testing/create-a-network-shared-folder-catalog-for-task-pane-and-content-add-ins).

When the add-in is deployed centrally, the per-user sideload is unnecessary but harmless.

## Uninstalling

**macOS:**

```sh
sudo sh /Applications/CourtOS.app/Contents/Resources/uninstall.sh
```

Or run `installer/macos/uninstall.sh` from the repository. It ends CourtOS and removes the app and the LaunchAgent.

The certificate you trusted in your login keychain stays until you delete "CourtOS localhost" in Keychain Access.

**Windows:** Settings › Apps › CourtOS › Uninstall, or:

```bat
msiexec /x CourtOS-<version>-x64.msi
```

Case folders, their `.courtos` subfolders, the settings in `~/.config/courtos` and the log are never removed by an uninstall.

## Building

**macOS** (on a Mac with the Xcode command-line tools):

```sh
installer/macos/build.sh --arch arm64 \
  --sign "Developer ID Application: …" --installer-sign "Developer ID Installer: …" \
  --notary-profile courtos-notary
```

- Without the signing options the app is signed ad hoc and the package is unsigned.
- `--node-dir` uses a local Node instead of downloading one. That is only for trying the build on the same Mac: a Homebrew Node links libraries from `/opt/homebrew`.

**Windows** (PowerShell 7, the .NET SDK, Node 22+, WiX 5):

```powershell
dotnet tool install --global wix --version 5.0.2
wix extension add --global WixToolset.Util.wixext/5.0.2
installer\windows\build.ps1 -Arch x64 -CertificateThumbprint <SHA-1 of a code-signing certificate>
```

Run `npm ci` in `packages/courtos-local` first: the package bundles its repository siblings from `node_modules`.

The workflow `.github/workflows/courtos-local-installers.yml` builds both packages unsigned. It installs the MSI, checks it and uninstalls it again.
