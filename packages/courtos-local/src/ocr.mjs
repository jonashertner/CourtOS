// Local OCR for PDF pages without a text layer. Nothing leaves the computer.
// macOS: PDFKit + Vision through a small compiled Swift helper.
// Elsewhere: pdftoppm + tesseract when both are installed.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { canonicalText } from "./util.mjs";

export const OCR_VERSION = "courtos-ocr/1";
const SWIFT_SOURCE = new URL("../scripts/ocr-vision.swift", import.meta.url);

const run = (cmd, args, { timeout = 120_000, input } = {}) => new Promise((resolve, reject) => {
  const child = execFile(cmd, args, { timeout, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PATH: `${process.env.PATH ?? ""}:/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin` } }, (error, stdout, stderr) => {
    if (error) reject(Object.assign(error, { stderr })); else resolve(stdout);
  });
  if (input) child.stdin.end(input);
});
const which = async (cmd) => { try { return (await run("/usr/bin/which", [cmd], { timeout: 5000 })).trim() || null; } catch { return null; } };

let enginePromise = null;

async function visionHelper() {
  if (process.platform !== "darwin") return null;
  // The installed app ships the helper compiled; a checkout compiles it once with swiftc.
  const shipped = process.env.COURTOS_OCR_HELPER;
  if (shipped && (await stat(shipped).catch(() => null))?.isFile()) return shipped;
  if (!(await which("swiftc"))) return null;
  const source = await readFile(SWIFT_SOURCE);
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 12);
  const dir = join(homedir(), "Library", "Caches", "courtos");
  const binary = join(dir, `ocr-vision-${hash}`);
  if (!(await stat(binary).catch(() => null))) {
    await mkdir(dir, { recursive: true });
    await run("swiftc", ["-O", "-o", binary, new URL(SWIFT_SOURCE).pathname], { timeout: 300_000 });
  }
  return binary;
}

async function tesseractLanguages() {
  try {
    const out = await run("tesseract", ["--list-langs"], { timeout: 10_000 });
    const available = new Set(out.split(/\s+/));
    const wanted = ["deu", "fra", "ita", "eng"].filter(l => available.has(l));
    return wanted.length ? wanted.join("+") : null;
  } catch { return null; }
}

/** The OCR engine available on this computer, or null. Detected once. */
export function ocrEngine() {
  enginePromise ??= (async () => {
    try {
      const binary = await visionHelper();
      if (binary) return { name: "vision", binary };
    } catch { /* fall through to tesseract */ }
    if ((await which("tesseract")) && (await which("pdftoppm"))) {
      const langs = await tesseractLanguages();
      if (langs) return { name: "tesseract", langs };
    }
    return null;
  })();
  return enginePromise;
}

/** OCR the given 1-based pages of a PDF. Returns [{n, text, confidence}]. */
export async function ocrPdfPages(path, pages) {
  const engine = await ocrEngine();
  if (!engine || !pages.length) return [];
  if (engine.name === "vision") {
    const out = await run(engine.binary, [path, pages.join(",")], { timeout: 60_000 * Math.max(1, pages.length) });
    return out.split("\n").filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean).map(r => ({ n: r.n, text: canonicalText(r.text ?? ""), confidence: Number(r.confidence) || 0, engine: "vision" }));
  }
  const dir = await mkdtemp(join(tmpdir(), "courtos-ocr-"));
  try {
    const results = [];
    for (const n of pages) {
      const prefix = join(dir, `p${n}`);
      await run("pdftoppm", ["-r", "300", "-f", String(n), "-l", String(n), "-png", "-singlefile", path, prefix]);
      const text = await run("tesseract", [`${prefix}.png`, "-", "-l", engine.langs, "--psm", "3"]);
      results.push({ n, text: canonicalText(text), confidence: null, engine: "tesseract" });
    }
    return results;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Word boxes of one scanned page, for showing where a quotation is. Vision only; null elsewhere. */
export async function ocrPageWords(path, n) {
  const engine = await ocrEngine();
  if (engine?.name !== "vision") return null;
  const out = await run(engine.binary, ["--boxes", path, String(n)], { timeout: 60_000 });
  const line = out.split("\n").find(Boolean);
  const words = line ? JSON.parse(line).words : null;
  return Array.isArray(words) ? words.map(w => ({ t: String(w.t), b: w.b.map(Number) })) : null;
}
