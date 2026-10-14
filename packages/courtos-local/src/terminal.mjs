// What CourtOS prints in the terminal, in the interface language: the language
// saved in the interface, else the system locale, else German. A message that
// names a menu item quotes it from menu.json, the menu-bar apps' texts.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const LANGUAGES = ["de", "fr", "it", "en"];

/** Whether this Node meets package.json's engines (>=22.12). */
export function supportedNode(version = process.versions.node) {
  const [major, minor] = version.split(".").map(Number);
  return major > 22 || (major === 22 && minor >= 12);
}

export async function terminalLanguage({ home = homedir(), env = process.env } = {}) {
  try {
    const { language } = JSON.parse(await readFile(join(home, ".config", "courtos", "preferences.json"), "utf8"));
    if (LANGUAGES.includes(language)) return language;
  } catch { /* no preference saved */ }
  const locale = (env.LC_ALL || env.LC_MESSAGES || env.LANG || "").slice(0, 2).toLowerCase();
  return LANGUAGES.includes(locale) ? locale : "de";
}

const MESSAGES = {
  de: {
    node: "CourtOS benötigt Node.js 22.12 oder neuer.",
    running: "CourtOS läuft auf {origin}",
    pair: "Im Browser öffnen (gilt einmal): {url}",
    noCert: "Hinweis: Kein Entwicklerzertifikat für localhost gefunden. Der Browser funktioniert, Word nicht.",
    certApp: "Für eine verschlüsselte Verbindung, im Browser ohne Warnung und für Word, im CourtOS-Menü „{menuCertificate}“ wählen.",
    certCli: "Für eine verschlüsselte Verbindung, im Browser ohne Warnung und für Word, einmal ausführen: npx office-addin-dev-certs install, dann CourtOS neu starten.",
    productsFailed: "Arbeitsprodukte nicht geschrieben ({code})",
    error: "Fehler",
    wordInstalled: "Word-Add-in installiert: {path}",
    wordRestartWin: "Word neu starten, dann Start › Add-ins › CourtOS.",
    wordRestartMac: "Word neu starten, dann Einfügen › Add-ins › Meine Add-ins › CourtOS.",
    manifestWritten: "Manifest geschrieben: {path} (manuell in Word hochladen).",
    unknownSample: "Unbekanntes Beispieldossier: {id}. Vorhanden: {list}",
    portBusy: "Port {port} ist belegt. Läuft CourtOS schon? Dann dort weiterarbeiten.",
    otherPort: "Sonst auf einem anderen Port starten: courtos-local --port {next}",
    otherPortWord: "(Für Word danach auch: courtos-local install-word --port {next})",
  },
  fr: {
    node: "CourtOS nécessite Node.js 22.12 ou plus récent.",
    running: "CourtOS fonctionne sur {origin}",
    pair: "Ouvrir dans le navigateur (valable une fois) : {url}",
    noCert: "Remarque : aucun certificat de développement pour localhost. Le navigateur fonctionne, Word non.",
    certApp: "Pour une connexion chiffrée, sans avertissement dans le navigateur et pour Word, choisir « {menuCertificate} » dans le menu CourtOS.",
    certCli: "Pour une connexion chiffrée, sans avertissement dans le navigateur et pour Word, exécuter une fois : npx office-addin-dev-certs install, puis redémarrer CourtOS.",
    productsFailed: "Documents de travail non enregistrés ({code})",
    error: "erreur",
    wordInstalled: "Complément Word installé : {path}",
    wordRestartWin: "Redémarrer Word, puis Accueil › Compléments › CourtOS.",
    wordRestartMac: "Redémarrer Word, puis Insertion › Compléments › Mes compléments › CourtOS.",
    manifestWritten: "Manifeste enregistré : {path} (à charger manuellement dans Word).",
    unknownSample: "Dossier d'exemple inconnu : {id}. Disponibles : {list}",
    portBusy: "Le port {port} est occupé. CourtOS fonctionne-t-il déjà ? Continuez alors là-bas.",
    otherPort: "Sinon, démarrer sur un autre port : courtos-local --port {next}",
    otherPortWord: "(Pour Word ensuite aussi : courtos-local install-word --port {next})",
  },
  it: {
    node: "CourtOS richiede Node.js 22.12 o più recente.",
    running: "CourtOS è in esecuzione su {origin}",
    pair: "Aprire nel browser (vale una volta): {url}",
    noCert: "Nota: nessun certificato di sviluppo per localhost. Il browser funziona, Word no.",
    certApp: "Per una connessione cifrata, senza avvisi nel browser e per Word, scegliere «{menuCertificate}» nel menu di CourtOS.",
    certCli: "Per una connessione cifrata, senza avvisi nel browser e per Word, eseguire una volta: npx office-addin-dev-certs install, poi riavviare CourtOS.",
    productsFailed: "Documenti di lavoro non salvati ({code})",
    error: "errore",
    wordInstalled: "Componente aggiuntivo di Word installato: {path}",
    wordRestartWin: "Riavviare Word, poi Home › Componenti aggiuntivi › CourtOS.",
    wordRestartMac: "Riavviare Word, poi Inserisci › Componenti aggiuntivi › I miei componenti aggiuntivi › CourtOS.",
    manifestWritten: "Manifesto salvato: {path} (caricarlo manualmente in Word).",
    unknownSample: "Incarto di esempio sconosciuto: {id}. Disponibili: {list}",
    portBusy: "La porta {port} è occupata. CourtOS è già in esecuzione? Allora continuare lì.",
    otherPort: "Altrimenti avviare su un'altra porta: courtos-local --port {next}",
    otherPortWord: "(Per Word poi anche: courtos-local install-word --port {next})",
  },
  en: {
    node: "CourtOS needs Node.js 22.12 or newer.",
    running: "CourtOS is running at {origin}",
    pair: "Open in the browser (works once): {url}",
    noCert: "Note: no developer certificate for localhost found. The browser works, Word does not.",
    certApp: "For an encrypted connection, without a warning in the browser and for Word, choose “{menuCertificate}” in the CourtOS menu.",
    certCli: "For an encrypted connection, without a warning in the browser and for Word, run once: npx office-addin-dev-certs install, then restart CourtOS.",
    productsFailed: "Work products not written ({code})",
    error: "error",
    wordInstalled: "Word add-in installed: {path}",
    wordRestartWin: "Restart Word, then Home › Add-ins › CourtOS.",
    wordRestartMac: "Restart Word, then Insert › Add-ins › My Add-ins › CourtOS.",
    manifestWritten: "Manifest written: {path} (upload it in Word by hand).",
    unknownSample: "Unknown sample case: {id}. Available: {list}",
    portBusy: "Port {port} is in use. Is CourtOS already running? Then continue there.",
    otherPort: "Otherwise start on another port: courtos-local --port {next}",
    otherPortWord: "(For Word then also: courtos-local install-word --port {next})",
  },
};

export const MENU = JSON.parse(readFileSync(new URL("./menu.json", import.meta.url), "utf8"));

/** say("running", { origin }) in the given language; every language has every message. */
export const messages = (language) => {
  const lang = MESSAGES[language] ? language : "de";
  return (key, vars = {}) => MESSAGES[lang][key].replace(/\{(\w+)\}/g, (_, name) => String({ menuCertificate: MENU[lang].certificate, ...vars }[name]));
};

export const MESSAGE_KEYS = Object.fromEntries(Object.entries(MESSAGES).map(([lang, m]) => [lang, Object.keys(m)]));
