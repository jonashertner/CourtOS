// Read-only inventory of one chosen case folder. Nothing outside the root is
// followed: symbolic links, hidden files and CourtOS's own workspace are skipped.
import { caseLanguage, ROLE_LABEL } from "./language.mjs";
import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";
import { SUPPORTED } from "./extract.mjs";
import { CourtosError } from "./util.mjs";

export const WORKSPACE_DIR = ".courtos";
const MAX_FILES = 600;
const MAX_DEPTH = 6;

/** `skip`: names of top-level folders to leave out (CourtOS's work products when they sit in the case folder). */
export async function walk(root, { skip = [] } = {}) {
  const realRoot = await realpath(root);
  const skipTop = new Set(skip);
  const files = [];
  async function visit(directory, depth) {
    if (depth > MAX_DEPTH) return;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name.startsWith("~$") || entry.name === WORKSPACE_DIR) continue;
      if (depth === 0 && skipTop.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) await visit(absolute, depth + 1);
      else if (info.isFile()) {
        if (files.length >= MAX_FILES) throw new CourtosError("folder_too_large");
        files.push({ absolute, rel_path: relative(realRoot, absolute).split(sep).join("/"), bytes: info.size, mtime: info.mtime.toISOString() });
      }
    }
  }
  await visit(realRoot, 0);
  return { realRoot, files };
}

/** Resolve a stored relative path and prove it is still inside the root. */
export async function insideRoot(realRoot, relPath) {
  if (typeof relPath !== "string" || !relPath || relPath.includes("\0")) throw new CourtosError("path_rejected", undefined, 403);
  const segments = relPath.split("/");
  // Lexical check first: traversal and CourtOS's own folder are refused outright.
  if (segments.some(part => part === ".." || part === "." || part === "" || part === WORKSPACE_DIR)) throw new CourtosError("path_rejected", undefined, 403);
  const candidate = join(realRoot, ...segments);
  let resolved;
  try { resolved = await realpath(candidate); } catch { throw new CourtosError("source_missing", undefined, 404); }
  const rel = relative(realRoot, resolved);
  if (!rel || rel.startsWith("..") || rel.split(sep).includes(WORKSPACE_DIR) || rel.split(sep).some(part => part.startsWith(".."))) {
    throw new CourtosError("path_rejected", undefined, 403);
  }
  return resolved;
}

// "KB 2", "pièce 4", "Doc. 3", "Exhibit 7", and the international "Exhibit C-3" / "R-3".
const EXHIBIT_CODE = /(?:^|[\s_(\-])((?:KB|BB|GB|act\.?|Bel\.?|Beilage|pièce|pi[eè]ce|doc\.?|allegato|all\.|exhibit|ex\.)\s*(?:[CR]-)?\d{1,3}[a-z]?)(?=$|[\s_).\-])/iu;
const FOLDER_ROLE = [
  [/^(beilagen|belege|beweismittel|exhibits?|pi[eè]ces|allegati|annexes?|anlagen)$/iu, "exhibit"],
  [/^(literatur|literature|doctrine|dottrina|lehre|materialien|authorities)$/iu, "literature"],
  [/^(rechtsprechung|entscheide|jurisprudence|giurisprudenza|case[- ]?law)$/iu, "authority"],
];
const NAME_ROLE = [
  [/klageantwort|beschwerdeantwort|gesuchsantwort|vernehmlassung|duplik|r[ée]ponse|m[ée]moire de r[ée]ponse|risposta|statement of defen[cs]e|answer/iu, "response"],
  [/replik|duplik|r[ée]plique|duplique|replica|duplica|reply|rejoinder/iu, "submission"],
  [/klage|beschwerde|gesuch|berufung|requ[êe]te|demande|recours|petizione|ricorso|istanza|statement of claim|complaint|claim/iu, "claim"],
  [/notiz|memo|note|aktennotiz|instruktion/iu, "other"],
];
// The court's own notes: read by the model as context, never quoted as evidence.
// Only a file name decides this, never the text of a page.
const INTERNAL_NOTE = /instruktionsnotiz|interne notiz|aktennotiz|notiz|note interne|nota interna|memo|internal note/iu;

export function classify(relPath, firstPageText = "") {
  const parts = relPath.split("/");
  const name = basename(relPath, extname(relPath));
  const code = EXHIBIT_CODE.exec(` ${name} `)?.[1]?.replace(/\s+/g, " ");
  let role = null;
  for (const folder of parts.slice(0, -1)) for (const [pattern, folderRole] of FOLDER_ROLE) if (pattern.test(folder)) role = folderRole;
  if (code && !role) role = "exhibit";
  if (!role && INTERNAL_NOTE.test(name)) role = "internal_note";
  if (!role) for (const [pattern, nameRole] of NAME_ROLE) if (pattern.test(name)) { role = nameRole; break; }
  if (!role) for (const [pattern, textRole] of NAME_ROLE) if (pattern.test(firstPageText.slice(0, 600))) { role = textRole; break; }
  role ??= "other";
  let party = null;
  if (role === "claim") party = "P1";
  else if (role === "response") party = "P2";
  else if (role === "exhibit" && code) {
    if (/^(KB|GB)|\bC-\d/i.test(code)) party = "P1";
    else if (/^BB|\bR-\d/i.test(code)) party = "P2";
  }
  // Abbreviations get their full stop ("Doc 3" → "Doc. 3"); whole words stay as written.
  return { role, party, code: code ? code.replace(/^(act|bel|doc|ex)\.?(?=\s|\d)/i, m => m.replace(/\.?$/, ".")) : null };
}

/**
 * Neutral document labels: exhibit codes or role names in the case language,
 * never file names. Exhibit codes are kept as the parties wrote them ("KB 2",
 * "pièce 4"): the pleadings cite them that way.
 */
export function neutralLabels(sources, lang = "de") {
  const names = ROLE_LABEL[caseLanguage(lang)];
  const counts = new Map();
  // Exhibit codes are taken as written; generated labels skip numbers a code already uses ("pièce 1").
  const taken = new Set(sources.filter(s => s.code).map(s => s.code.toLocaleLowerCase()));
  for (const source of sources) {
    if (source.code) { source.label = source.code; continue; }
    const base = names[source.role] ?? names.document;
    let n = counts.get(base) ?? 0;
    do n++; while (taken.has(`${base} ${n}`.toLocaleLowerCase()));
    counts.set(base, n);
    source.label = `${base} ${n}`;
    taken.add(source.label.toLocaleLowerCase());
  }
  // A single claim/response reads better without a number.
  for (const [base, n] of counts) if (n === 1) for (const source of sources) if (!source.code && source.label === `${base} 1`) source.label = base;
  return sources;
}

/** Folders synchronised by a cloud client are not purely local storage. */
export function syncWarning(realRoot) {
  const markers = [
    [/\/Library\/CloudStorage\//, "cloud_storage"], [/\/Library\/Mobile Documents\//, "icloud"],
    [/onedrive/i, "onedrive"], [/dropbox/i, "dropbox"], [/google ?drive/i, "google_drive"], [/\/Box( Sync)?\//, "box"],
  ];
  for (const [pattern, service] of markers) if (pattern.test(realRoot)) return service;
  return null;
}

export { SUPPORTED };
