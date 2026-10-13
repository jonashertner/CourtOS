// A backup of the working state, without original files: register, notes,
// procedure, sources list, mirror, runs and wiki. The extraction cache and the
// cached public decisions are left out; both are rebuilt from the folder.
import { readdir, readFile, lstat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { zipSync, strToU8 } from "fflate";

const SKIP = new Set(["private/extract", "public"]);

export async function backupArchive(store) {
  const files = {};
  let total = 0;
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const rel = relative(store.dir, path).split(sep).join("/");
      if (SKIP.has(rel)) continue;
      const info = await lstat(path);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) await visit(path);
      else if (info.isFile()) {
        total += info.size;
        if (total > 400 * 1024 * 1024) throw Object.assign(new Error("backup_too_large"), { code: "backup_too_large", status: 413 });
        files[`courtos/${rel}`] = new Uint8Array(await readFile(path));
      }
    }
  }
  await visit(store.dir);
  files["courtos/BACKUP.txt"] = strToU8(
    `CourtOS working state of ${store.root.split(/[\\/]/).at(-1)}, ${new Date().toISOString()}.\n` +
    "Original documents are not included. private/register.json links pseudonyms to real names: keep this archive as confidential as the case file.\n");
  return Buffer.from(zipSync(files, { level: 6 }));
}
