import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CaseStore } from "../src/caseStore.mjs";
import { sha256 } from "../src/util.mjs";

export const FIXTURE = new URL("../fixtures/HG.2026.57 Alpenblick/", import.meta.url);

export async function freshCase() {
  const dir = await mkdtemp(join(tmpdir(), "courtos-test-"));
  const root = join(dir, "HG.2026.57 Alpenblick");
  await cp(FIXTURE, root, { recursive: true });
  const store = await CaseStore.open(root);
  await store.scan();
  return { dir, root, store, cleanup: () => { store.close(); return rm(dir, { recursive: true, force: true }); } };
}

/** Hashes of every original file (excluding CourtOS's own folder). */
export async function originalHashes(root) {
  const out = {};
  async function visit(dir, prefix = "") {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === ".courtos") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path, `${prefix}${entry.name}/`);
      else out[`${prefix}${entry.name}`] = sha256(await readFile(path));
    }
  }
  await visit(root);
  return out;
}

// Details of natural persons and the parties' distinctive names: never in the
// mirror or a request. (Counsel, the court and company registry data are
// public under citecheck's standard and stay readable unless the user
// replaces them; see PUBLIC_DETAILS.)
export const ORIGINAL_IDENTIFIERS = [
  "Anna Keller", "Keller", "Marco Bianchi", "Bianchi", "Lea Roth", "Alpenblick", "Bergfeld",
  "Seestrasse 41", "anna.keller@alpenblick-hotel.ch", "m.bianchi@bergfeld-bau.ch", "756.1234.5678.97",
];
export const PUBLIC_DETAILS = ["Thomas Weber", "Sophie Brunner", "Nora Steiner", "CHE-123.456.789", "CH93 0076 2011 6238 5295 7"];
