// The synthetic sample dossiers shipped in fixtures/: one short case that the
// offline demo can replay without a model, four full case files, one per
// language of the proceedings, each at a different court, and the two demo
// cases of the video: a commercial dispute and an appeal to the Federal Supreme Court. Every person,
// company, address and number in them is invented. fixtures/build_samples.py
// renders all but the first from fixtures/samples/*.json.
import { cp, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
 * returns the samples with their working paths. Files already there are kept,
 * so work done in a sample survives a restart.
 */
export async function prepareSamples(base) {
  await mkdir(base, { recursive: true });
  const ready = [];
  for (const sample of SAMPLES) {
    const source = fileURLToPath(new URL(`${encodeURIComponent(sample.folder)}/`, FIXTURES));
    if (!(await stat(source).catch(() => null))?.isDirectory()) continue;
    const path = join(base, sample.folder);
    await cp(source, path, { recursive: true, force: false, errorOnExist: false });
    ready.push({ ...sample, path });
  }
  return ready;
}
