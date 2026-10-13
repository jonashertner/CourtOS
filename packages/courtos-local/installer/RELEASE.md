CourtOS local reads one case folder on your computer, replaces names and identifiers before a language model reads anything, and binds every result to the original pages, in the browser and in Word. It comes with synthetic sample dossiers; the demo runs without an API key.

| File | For |
|---|---|
| `CourtOS-<version>-arm64.pkg` | macOS 13 or later on Apple silicon (M1 and later) |
| `CourtOS-<version>-x64.msi` | Windows 10 and 11, 64-bit |
| `SHA256SUMS` | Checksums of both packages |

Each package includes the Node runtime and a menu-bar or tray app; nothing else needs to be installed. There is no build for Intel Macs or Linux yet: run CourtOS from the source as described in [TESTING.md](https://github.com/jonashertner/CourtOS/blob/main/packages/courtos-local/TESTING.md).

**These packages are not signed.** Your system warns when you open them:

- **macOS:** the package "cannot be opened". Open **System Settings › Privacy & Security** and choose **Open Anyway**.
- **Windows:** SmartScreen. Choose **More info › Run anyway**. The installer needs administrator rights.

The installer creates a certificate for `https://localhost`, limited to `localhost` and `127.0.0.1`, which Word needs to load the add-in. On macOS you confirm it once with your password; on Windows the installer trusts it for all users of the computer. [installer/README.md](https://github.com/jonashertner/CourtOS/blob/main/packages/courtos-local/installer/README.md) explains why, how IT can deploy CourtOS to many computers, and how to uninstall it.

CourtOS is a pilot, free software under the AGPL-3.0, without warranty. Its results are working drafts, not decisions. Try it with the sample dossiers. Opening real case files needs the decision of your court or authority. Report problems as [issues](https://github.com/jonashertner/CourtOS/issues/new/choose), without any real case content.

---

**Deutsch.** Pakete für macOS (Apple-Chip) und Windows. Sie sind nicht signiert: Unter macOS **Systemeinstellungen › Datenschutz & Sicherheit › Trotzdem öffnen**, unter Windows **Weitere Informationen › Trotzdem ausführen**. Probieren Sie CourtOS mit den synthetischen Musterdossiers aus; echte Akten nur nach Entscheid Ihres Gerichts oder Ihrer Behörde.

**Français.** Paquets pour macOS (puce Apple) et Windows. Ils ne sont pas signés : sous macOS **Réglages Système › Confidentialité et sécurité › Ouvrir quand même**, sous Windows **Informations complémentaires › Exécuter quand même**. Essayez CourtOS avec les dossiers d’exemple synthétiques ; de vrais dossiers seulement sur décision de votre tribunal ou de votre autorité.
