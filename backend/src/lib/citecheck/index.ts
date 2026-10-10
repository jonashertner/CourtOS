import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { isAbsolute, join } from "node:path";
import pinned from "./index-manifest.json";
import { CiteIndex } from "./vendor/index";

export const CITECHECK_COMMIT = "ae73c86e706f45c75f1e58561304dbea5ff4cbf9";
export const citationIndexManifest = pinned;
const inflate = promisify(gunzip);
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export class CitationIndexUnavailable extends Error {}
let cache: { path: string; value: Promise<CiteIndex> } | undefined;

/** No request-time network path. An operator provisions this exact public file. */
export async function loadCitationIndex(): Promise<CiteIndex> {
  const dir = process.env.COURTOS_CITATION_INDEX_DIR;
  if (!dir || !isAbsolute(dir)) throw new CitationIndexUnavailable();
  const path = join(dir, pinned.file);
  if (cache?.path === path) return cache.value;
  const value = (async () => {
    const info = await stat(path);
    if (!info.isFile() || info.size !== pinned.bytes || info.size > 32 * 1024 * 1024) throw new CitationIndexUnavailable();
    const bytes = await readFile(path);
    if (bytes.byteLength !== pinned.bytes || hash(bytes) !== pinned.sha256) throw new CitationIndexUnavailable();
    const unpacked = await inflate(bytes, { maxOutputLength: 128 * 1024 * 1024 });
    if (unpacked.byteLength !== pinned.unpacked_bytes) throw new CitationIndexUnavailable();
    return new CiteIndex(unpacked);
  })().catch(() => {
    if (cache?.value === value) cache = undefined;
    throw new CitationIndexUnavailable();
  });
  cache = { path, value };
  return value;
}
