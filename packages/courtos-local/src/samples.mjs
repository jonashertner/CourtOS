// The synthetic sample dossiers shipped in fixtures/: one short case that the
// offline demo can replay without a model, four full case files, one per
// language of the proceedings, each at a different court, and the two demo
// cases of the video: a commercial dispute and an appeal to the Federal Supreme Court. Every person,
// company, address and number in them is invented. fixtures/build_samples.py
// renders all but the first from fixtures/samples/*.json.
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson } from "./util.mjs";

export const SAMPLES = [
  { id: "alpenblick", folder: "HG.2026.57 Alpenblick", language: "de", court: "Handelsgericht des Kantons Zürich", matter: "Werkvertrag: Mängel an der Abdichtung eines Wellnessbereichs", offline: true },
  { id: "sg-maschine", folder: "HG.2026.112 Rheintal Präzision", language: "de", court: "Handelsgericht des Kantons St. Gallen", matter: "Kaufvertrag: eine CNC-Fräsmaschine, die die Toleranzen nicht hält" },
  { id: "vd-fiduciaire", folder: "PC.2026.0914 Domaine des Tourelles SA", language: "fr", court: "Chambre patrimoniale cantonale (Vaud), Lausanne", matter: "Mandat : responsabilité de la fiduciaire pour des décomptes TVA omis" },
  { id: "ti-lavoro", folder: "PD.2026.184 Lanfranchi", language: "it", court: "Pretura del Distretto di Lugano", matter: "Contratto di lavoro: licenziamento abusivo, ore straordinarie e bonus" },
  { id: "zh-vertrieb", folder: "HG260074-O Caffè Distribuzione Sud", language: "de", court: "Handelsgericht des Kantons Zürich", matter: "Alleinvertriebsvertrag: fristlose Kündigung, Kundschaftsentschädigung und Widerklage auf offene Rechnungen" },
  { id: "bger-permis", folder: "1C_412_2026 Bettex", language: "fr", court: "Tribunal fédéral, Ire Cour de droit public", matter: "Permis de construire : recours de voisins contre deux maisons jumelles avec pompes à chaleur" },
  { id: "be-software", folder: "HG ICC 2026 7 Zytglogge Praezisionsinstrumente AG", language: "en", court: "Bern International Commercial Court", matter: "ERP implementation: termination for cause and restitution of milestone payments" },
];

const FIXTURES = new URL("../fixtures/", import.meta.url);

/**
 * Copies each sample into `base` (the package itself is never written to) and
 * returns the samples with their working paths. Work done in a sample survives
 * a restart. When the package brings a changed sample, its files are copied
 * over the old ones; CourtOS's own work in the folder is kept, and the changed
 * files revoke a release as any changed original does.
 */
export async function prepareSamples(base) {
  await mkdir(base, { recursive: true });
  const record = join(base, ".samples.json");
  const read = await readJson(record, {}).catch(() => ({}));
  const copied = read && typeof read === "object" && !Array.isArray(read) ? read : {};
  const ready = [];
  for (const sample of SAMPLES) {
    const source = fileURLToPath(new URL(`${encodeURIComponent(sample.folder)}/`, FIXTURES));
    if (!(await stat(source).catch(() => null))?.isDirectory()) continue;
    const path = join(base, sample.folder);
    const version = await fingerprint(source);
    if (copied[sample.id] !== version || !(await stat(path).catch(() => null))?.isDirectory()) {
      await cp(source, path, { recursive: true, force: true });
      copied[sample.id] = version;
    }
    ready.push({ ...sample, path });
  }
  await writeJson(record, copied);
  return ready;
}

/** The sample as shipped: every file's path and content. */
async function fingerprint(dir) {
  const hash = createHash("sha256");
  const files = (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name))
    .sort();
  for (const file of files) hash.update(relative(dir, file).split(sep).join("/")).update("\0").update(await readFile(file)).update("\0");
  return hash.digest("hex");
}
