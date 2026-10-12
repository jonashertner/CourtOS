#!/usr/bin/env node
// courtos-local [folder] [--port 4311] [--no-open] [--demo]
// courtos-local install-word   writes the Word add-in manifest and sideloads it on macOS
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

let folder = args.find(a => !a.startsWith("--") && a !== String(port)) ?? null;
let demoFolder = null;
// A fresh copy of the synthetic dossier, so the demo never writes into the package.
const demoSource = new URL("../fixtures/HG.2026.57 Alpenblick/", import.meta.url);
demoFolder = join(tmpdir(), "courtos-demo", "HG.2026.57 Alpenblick");
await mkdir(join(tmpdir(), "courtos-demo"), { recursive: true });
await cp(demoSource, demoFolder, { recursive: true, force: false, errorOnExist: false });
if (flag("--demo")) folder = demoFolder;

await startServer({ port, folder: folder ? resolve(folder) : null, openBrowser: !flag("--no-open"), demoFolder });

function major() { return Number(process.versions.node.split(".")[0]); }
