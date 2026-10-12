#!/usr/bin/env node
// courtos-local [folder] [--port 4311] [--no-open] [--demo | --sample <id>]
// courtos-local install-word   writes the Word add-in manifest and sideloads it (macOS, Windows)
// --control: for the menu-bar and tray apps. A line on stdin asks ("pair", "status"), a line on
// stdout answers; CourtOS ends when stdin closes, that is when the app that started it ends.
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { prepareSamples, SAMPLES } from "../src/samples.mjs";
import { startServer } from "../src/server.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const port = Number(option("--port", process.env.COURTOS_PORT ?? 4311));

if (major() < 22) {
  console.error("CourtOS benötigt Node.js 22 oder neuer.");
  process.exit(1);
}

if (args[0] === "install-word") {
  const template = await readFile(new URL("../word/manifest.xml", import.meta.url), "utf8");
  const manifest = template.replaceAll("https://localhost:4311", `https://localhost:${port}`);
  if (process.platform === "win32") {
    // Word for Windows loads a developer add-in from the manifest path in this registry key.
    const dir = join(process.env.LOCALAPPDATA ?? homedir(), "CourtOS");
    const path = join(dir, "courtos-local.xml");
    await mkdir(dir, { recursive: true });
    await writeFile(path, manifest);
    const id = /<Id>([^<]+)<\/Id>/.exec(manifest)[1];
    execFileSync("reg.exe", ["add", "HKCU\\Software\\Microsoft\\Office\\16.0\\WEF\\Developer", "/v", id, "/t", "REG_SZ", "/d", path, "/f"], { windowsHide: true });
    console.log(`Word-Add-in installiert: ${path}`);
    console.log("Word neu starten, dann Start › Add-ins › CourtOS.");
    process.exit(0);
  }
  const target = join(homedir(), "Library", "Containers", "com.microsoft.Word", "Data", "Documents", "wef");
  try {
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "courtos-local.xml"), manifest);
    console.log(`Word-Add-in installiert: ${join(target, "courtos-local.xml")}`);
    console.log("Word neu starten, dann Einfügen › Add-ins › Meine Add-ins › CourtOS.");
  } catch {
    const fallback = join(process.cwd(), "courtos-local-manifest.xml");
    await writeFile(fallback, manifest);
    console.log(`Manifest geschrieben: ${fallback} (manuell in Word hochladen).`);
  }
  process.exit(0);
}

const optionValues = new Set(["--port", "--sample"].map(o => args.indexOf(o)).filter(i => i >= 0).map(i => i + 1));
let folder = args.find((a, i) => !a.startsWith("--") && !optionValues.has(i)) ?? null;
// Working copies of the sample dossiers, so a sample never writes into the package.
const samples = await prepareSamples(join(tmpdir(), "courtos-demo"));
const sampleId = flag("--demo") ? "alpenblick" : option("--sample", null);
if (sampleId) {
  const sample = samples.find(s => s.id === sampleId);
  if (!sample) {
    console.error(`Unbekanntes Beispieldossier: ${sampleId}. Vorhanden: ${SAMPLES.map(s => s.id).join(", ")}`);
    process.exit(1);
  }
  folder = sample.path;
}

const control = flag("--control");
try {
  const app = await startServer({ port, folder: folder ? resolve(folder) : null, openBrowser: !control && !flag("--no-open"), samples });
  if (control) {
    const lines = createInterface({ input: process.stdin });
    lines.on("line", (line) => {
      if (line.trim() === "pair") console.log(`COURTOS_PAIR ${app.newPairUrl()}`);
      else if (line.trim() === "status") console.log(`COURTOS_STATUS ${JSON.stringify(app.status())}`);
    });
    lines.on("close", () => { app.close(); process.exit(0); });
    console.log(`COURTOS_READY ${app.origin}`);
  }
} catch (error) {
  if (error.code !== "port_in_use") throw error;
  if (control) console.log(`COURTOS_ERROR port_in_use ${port}`);
  console.error(`Port ${port} ist belegt. Läuft CourtOS schon? Dann dort weiterarbeiten.`);
  console.error(`Sonst auf einem anderen Port starten: courtos-local --port ${port + 10}`);
  console.error(`(Für Word danach auch: courtos-local install-word --port ${port + 10})`);
  process.exit(1);
}

function major() { return Number(process.versions.node.split(".")[0]); }
