// Small shared helpers. No I/O outside the paths a caller passes in.
import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { capitalisedForms } from "@courtos/projection";

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");
export const randomId = (bytes = 12) => randomBytes(bytes).toString("base64url");
export const now = () => new Date().toISOString();

/** Atomic JSON/text write: temp file in the same directory, fsync, rename. */
export async function writeAtomic(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomId(6)}.tmp`;
  const handle = await open(temp, "w", 0o600);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

export const writeJson = (path, value) => writeAtomic(path, JSON.stringify(value, null, 2) + "\n");

export async function readJson(path, fallback = undefined) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    throw error;
  }
}

// The projection kernel rejects format/control characters and lone surrogates.
// Extraction removes them once, so the canonical page text is stable and
// every later quotation check runs against exactly the same string.
const removable = /[\p{Cf}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/gu;
export function canonicalText(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(removable, "")
    .normalize("NFC")
    .replace(/[  ]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Same word-boundary semantics as the projection kernel's alias matcher. */
/** A company's legal form, as the last word of its name. */
export const LEGAL_FORM = /^(AG|GmbH|SA|S\.A\.?|Sàrl|SARL|Sarl|SAS|Sagl|Srl|S\.r\.l\.?|SpA|S\.p\.A\.?|Ltd\.?|plc|PLC|LLP|LLC|Inc\.?|B\.V\.?|BV|N\.V\.?|NV|KG|KlG|Genossenschaft|Stiftung)$/u;

export function aliasExpression(alias, flags = "giu") {
  const escaped = alias.trim().split(/\s+/u).map(escapeRegex).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])(?:${escaped})(?![\\p{L}\\p{N}\\p{M}_])`, flags);
}

/**
 * How a registered alias is found. An alias that is also an ordinary word
 * (match "capitalised") counts only capitalised or in capitals, as in the
 * projection kernel; any other alias in any case.
 */
export function matchExpression(alias, match = null, global = true) {
  if (match !== "capitalised") return aliasExpression(alias, global ? "giu" : "iu");
  const alternatives = capitalisedForms(alias).map(form => form.trim().split(/\s+/u).map(escapeRegex).join("\\s+")).join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])(?:${alternatives})(?![\\p{L}\\p{N}\\p{M}_])`, global ? "gu" : "u");
}

export const codepoints = (text) => Array.from(text).length;

/** Code-unit index → codepoint index. */
export function toCodepointIndex(text, unitIndex) {
  return Array.from(text.slice(0, unitIndex)).length;
}

/** Codepoint index → code-unit index. */
export function toUnitIndex(text, pointIndex) {
  let units = 0, points = 0;
  for (const character of text) {
    if (points === pointIndex) return units;
    units += character.length;
    points++;
  }
  return units;
}

export class CourtosError extends Error {
  constructor(code, detail = undefined, status = 400) {
    super(code);
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}
