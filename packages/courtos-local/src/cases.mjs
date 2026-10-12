// The cases on this computer. Each case has two places: the folder with its
// originals (may be a network share, only ever read) and a local work folder
// that holds CourtOS's work: the register, the anonymised version, runs,
// memory, notes, and the work products as ordinary files.
//
// The list itself holds paths and dates only. What a case is about is read
// from its work folder when the list is shown, never copied into the
// configuration: no name from a register lands outside the work folder.
import { cp, lstat, mkdir, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { WORKSPACE_DIR, syncWarning } from "./scan.mjs";
import { CourtosError, now, randomId, readJson, writeJson } from "./util.mjs";

const CONFIG = () => join(homedir(), ".config", "courtos");
export const CASES_FILE = () => join(CONFIG(), "cases.json");
const RECENT = () => join(CONFIG(), "recent.json");
/** New work folders go here unless the user chooses another place. Not Documents: on Windows that is often synchronised to OneDrive. */
export const WORK_HOME = () => join(homedir(), "CourtOS");

/** The visible folder for work products, named in the language of the proceedings. */
export const PRODUCTS_DIR = { de: "Arbeitsprodukte", fr: "Travaux", it: "Lavori", en: "Work products" };

const exists = async (path) => Boolean(await stat(path).catch(() => null));
const isInside = (parent, child) => { const rel = relative(parent, child); return Boolean(rel) && !rel.startsWith("..") && !rel.startsWith(sep) && !/^[a-z]:/i.test(rel); };
/** A folder name that is valid on Windows and macOS. */
const folderName = (name) => (name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/[. ]+$/g, "").trim() || "Fall").slice(0, 80);

export async function loadCases() {
  const list = await readJson(CASES_FILE(), null).catch(() => null);
  if (Array.isArray(list)) return list.filter(c => c && typeof c.id === "string" && typeof c.source === "string" && typeof c.work === "string");
  // First start after the list replaced "recently opened": those folders keep their work where it is.
  const recent = await readJson(RECENT(), []).catch(() => []);
  const migrated = [];
  for (const path of Array.isArray(recent) ? recent : []) {
    if (typeof path === "string" && await exists(join(path, WORKSPACE_DIR))) migrated.push({ id: randomId(9), source: path, work: path, added: now(), opened: null });
  }
  if (migrated.length) await saveCases(migrated);
  return migrated;
}

export async function saveCases(list) {
  await mkdir(CONFIG(), { recursive: true });
  await writeJson(CASES_FILE(), list);
}

/** A free folder for a new case under WORK_HOME, named after the originals' folder. */
export async function defaultWorkFolder(source) {
  return freeFolder(WORK_HOME(), folderName(basename(source)));
}

async function freeFolder(parent, name) {
  for (let n = 1; n < 1000; n++) {
    const candidate = join(parent, n === 1 ? name : `${name} (${n})`);
    if (!(await exists(candidate))) return candidate;
  }
  throw new CourtosError("work_folder_unavailable", undefined, 409);
}

/**
 * The work folder a chosen folder stands for: an existing CourtOS work folder
 * or an empty folder as it is; any other folder gets a new subfolder named
 * after the case, so CourtOS never mixes its files into someone else's.
 */
export async function workFolderFor(chosen, source) {
  if (await exists(join(chosen, WORKSPACE_DIR))) return chosen;
  const entries = await readdir(chosen).catch(() => null);
  if (entries && entries.filter(e => !e.startsWith(".")).length === 0) return chosen;
  return freeFolder(chosen, folderName(basename(source)));
}

/**
 * Checks a pairing of originals and work folder. The work folder may be the
 * originals' folder itself (how CourtOS worked before), but never a folder
 * inside it: CourtOS's own output would be read back as a case document.
 */
export async function checkPlaces(source, work) {
  const realSource = await realpath(source).catch(() => null);
  if (!realSource || !(await stat(realSource)).isDirectory()) throw new CourtosError("folder_not_found", undefined, 404);
  await refuseInside(realSource, work);
  await mkdir(work, { recursive: true });
  const info = await lstat(work);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new CourtosError("workspace_unsafe", undefined, 409);
  const realWork = await realpath(work);
  if (realWork !== realSource && isInside(realSource, realWork)) throw new CourtosError("work_inside_source", undefined, 409);
  return { source: realSource, work: realWork };
}

/** The real path a folder has or would have once created. */
async function realTarget(path) {
  const real = await realpath(path).catch(() => null);
  if (real) return real;
  const parent = await realpath(dirname(path)).catch(() => null);
  return parent ? join(parent, basename(path)) : resolve(path);
}

/** Refuses a work folder inside the originals, before anything is created: a refused folder must not appear among the originals. */
export async function refuseInside(realSource, work) {
  const target = await realTarget(work);
  if (target !== realSource && isInside(realSource, target)) throw new CourtosError("work_inside_source", undefined, 409);
}

/** Adds a case, or returns the one already listed for these originals. */
export async function addCase({ source, work = null }) {
  const list = await loadCases();
  const realSource = await realpath(source).catch(() => null);
  if (!realSource) throw new CourtosError("folder_not_found", undefined, 404);
  const listed = list.find(c => c.source === realSource);
  if (listed) return listed;
  // A folder CourtOS already worked in keeps its work there.
  work ??= (await exists(join(realSource, WORKSPACE_DIR))) ? realSource : await defaultWorkFolder(realSource);
  const places = await checkPlaces(realSource, work);
  const entry = { id: randomId(9), ...places, added: now(), opened: null };
  await saveCases([entry, ...list]);
  return entry;
}

export async function updateCase(id, change) {
  const list = await loadCases();
  const entry = list.find(c => c.id === id);
  if (!entry) throw new CourtosError("case_unknown", undefined, 404);
  Object.assign(entry, change);
  await saveCases(list);
  return entry;
}

/** Takes a case off the list. Nothing on disk is touched. */
export async function removeCase(id) {
  const list = await loadCases();
  if (!list.some(c => c.id === id)) throw new CourtosError("case_unknown", undefined, 404);
  await saveCases(list.filter(c => c.id !== id));
}

/**
 * Moves CourtOS's work for a case (its workspace and the work-products
 * folder) to another work folder. The originals are not touched. The old
 * copy is removed only after the new one is complete.
 */
export async function moveWork(entry, target) {
  const places = await checkPlaces(entry.source, target);
  if (places.work === entry.work) return entry;
  const caseFile = await readJson(join(entry.work, WORKSPACE_DIR, "case.json"), {}).catch(() => ({}));
  if (await exists(join(places.work, WORKSPACE_DIR))) throw new CourtosError("work_folder_taken", undefined, 409);
  const parts = [WORKSPACE_DIR, ...(caseFile.products_dir ? [caseFile.products_dir] : [])];
  for (const part of parts) {
    const from = join(entry.work, part);
    if (!(await exists(from))) continue;
    const to = join(places.work, part);
    try { await rename(from, to); }
    catch (error) {
      if (error.code !== "EXDEV") throw error;
      await cp(from, to, { recursive: true, errorOnExist: true, force: false });
      await rm(from, { recursive: true });
    }
  }
  return updateCase(entry.id, { work: places.work });
}

/** What the list shows for one case, read from its folders now. */
export async function caseSummary(entry) {
  const dir = join(entry.work, WORKSPACE_DIR);
  const [sourceOk, workOk] = await Promise.all([exists(entry.source), exists(dir)]);
  const info = workOk ? await readJson(join(dir, "case.json"), {}).catch(() => ({})) : {};
  const sources = workOk ? await readJson(join(dir, "sources.json"), []).catch(() => []) : [];
  let runs = 0, lastRun = null;
  if (workOk) {
    for (const name of await readdir(join(dir, "runs")).catch(() => [])) {
      const run = await readJson(join(dir, "runs", name, "run.json"), null).catch(() => null);
      if (run?.status !== "succeeded") continue;
      runs++;
      if (!lastRun || String(run.finished) > lastRun) lastRun = run.finished ?? null;
    }
  }
  return {
    id: entry.id, name: basename(entry.source), source: entry.source, work: entry.work,
    same_folder: entry.source === entry.work, source_available: sourceOk, started: workOk,
    opened: entry.opened ?? null, added: entry.added ?? null,
    language: info.language?.code ?? null, documents: sources.filter(s => !s.missing).length,
    released_for: info.consent ? { model: info.consent.model ?? null, endpoint: info.consent.endpoint ?? null } : null,
    runs, last_run: lastRun, sync: syncWarning(entry.work),
  };
}
