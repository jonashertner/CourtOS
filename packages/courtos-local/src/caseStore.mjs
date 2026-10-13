// One open case: inventory, extraction cache, register, mirror and consent,
// all inside <work folder>/.courtos/. The work folder is either the case
// folder itself or a separate local folder (cases.mjs). Originals are only
// ever read.
import { EventEmitter } from "node:events";
import { watch } from "node:fs";
import { lstat, mkdir, readFile, realpath, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import { classify, filerOf, insideRoot, neutralLabels, syncWarning, walk, WORKSPACE_DIR } from "./scan.mjs";
import { extractFile, EXTRACTOR, SUPPORTED } from "./extract.mjs";
import { sampleContext } from "./detect.mjs";
import { suggestAnonymisation } from "./anonymise.mjs";
import { CASE_LANGUAGES, caseLanguage, detectLanguage } from "./language.mjs";
import { PARTY_ROLES, partyTerm } from "../web/party-roles.js";
import { applyChange, emptyRegister, mergeDetections, ocrReadings, relabelReplacements } from "./register.mjs";
import { buildMirror, compilePageTransform } from "./mirror.mjs";
import { ocrEngine, ocrPdfPages, OCR_VERSION } from "./ocr.mjs";
import { compileGuard } from "./guard.mjs";
import { refuseInside } from "./cases.mjs";
import { memorySha } from "./memory.mjs";
import { canonicalText, CourtosError, now, randomId, readJson, sha256, writeAtomic, writeJson } from "./util.mjs";
import { extname } from "node:path";

const NOTE_STATUS = new Set(["proposed", "adopted", "disputed", "done"]);
const NOTE_KIND = new Set(["note", "question", "assumption", "contradiction"]);
const cleanText = (value, max) => {
  if (typeof value !== "string") throw new CourtosError("invalid_text");
  const text = canonicalText(value);
  if (!text || Array.from(text).length > max) throw new CourtosError("invalid_text");
  return text;
};

const ROLES = new Set(["claim", "response", "submission", "exhibit", "literature", "authority", "internal_note", "other"]);

export class CaseStore extends EventEmitter {
  static async open(root, { work = root } = {}) {
    const info = await stat(root).catch(() => null);
    if (!info?.isDirectory()) throw new CourtosError("folder_not_found", undefined, 404);
    const store = new CaseStore();
    store.ocr = { engine: ocrEngine, pdfPages: ocrPdfPages };
    store.ocrFailed = new Set();
    const realRoot = await realpath(root);
    // A work folder inside the originals' folder would be read back as case documents.
    await refuseInside(realRoot, work);
    await mkdir(work, { recursive: true });
    const realWork = await realpath(work);
    await refuseInside(realRoot, realWork);
    store.root = realRoot;
    store.work = realWork;
    store.dir = join(realWork, WORKSPACE_DIR);
    // The workspace must be real directories inside the work folder. A planted
    // symlink (e.g. from an unpacked archive) would redirect writes elsewhere.
    for (const part of ["", "private", "private/extract", "mirror", "runs", "wiki", "memory", "memory/released", "public"]) {
      const path = join(store.dir, ...part.split("/").filter(Boolean));
      const info = await lstat(path).catch(() => null);
      if (info && (info.isSymbolicLink() || !info.isDirectory())) throw new CourtosError("workspace_unsafe", undefined, 409);
      if (!info) await mkdir(path, { mode: /^(private|memory)/.test(part) ? 0o700 : 0o755 });
      const real = await realpath(path);
      if (real !== path || !real.startsWith(realWork + sep)) throw new CourtosError("workspace_unsafe", undefined, 409);
    }
    await writeAtomic(join(store.dir, ".gitignore"), "*\n");
    await writeAtomic(join(store.dir, "README.txt"),
      "CourtOS working folder. Originals in the case folder are never changed.\n" +
      "private/  extraction cache and pseudonym register - stays on this computer\n" +
      "mirror/   the sanitised text the model may read after you release it\n" +
      "runs/     every model run with its exact outgoing requests and results\n" +
      "wiki/     readable working notes produced from verified results\n" +
      "memory/   the case memory: memory.md to read, released/ what a model may read\n" +
      "public/   cached published decisions from OpenCaseLaw\n");
    store.case = await readJson(join(store.dir, "case.json"), null) ?? {
      schema: 1, case_id: randomId(9), created: now(), consent: null,
    };
    store.case.parties ??= [
      { id: "P1", role: "claimant", entity: null },
      { id: "P2", role: "respondent", entity: null },
    ];
    store.notes = await readJson(join(store.dir, "private", "notes.json"), []);
    store.procedure = await readJson(join(store.dir, "private", "procedure.json"), { deadlines: [], orders: [] });
    // The register lives in the work folder: that is the folder whose synchronisation matters.
    store.case.sync = syncWarning(realWork);
    store.sources = await readJson(join(store.dir, "sources.json"), []);
    store.register = await readJson(join(store.dir, "private", "register.json"), emptyRegister());
    store.mirror = await readJson(join(store.dir, "mirror", "mirror.json"), null);
    store.maps = await readJson(join(store.dir, "private", "maps.json"), {});
    store.issues = [];
    store.documents = new Map();
    await store.save();
    return store;
  }

  /** The language of the proceedings: labels, page references and replacement labels follow it. */
  get lang() { return caseLanguage(this.case.language?.code); }

  /**
   * Change the language of the proceedings. The anonymised version changes with
   * it, so an earlier release no longer covers it.
   */
  async setLanguage(code) {
    if (!CASE_LANGUAGES.includes(code)) throw new CourtosError("invalid_language");
    const from = this.lang;
    this.case.language = { code, source: "user" };
    if (from !== code) {
      await this.ensureLoaded();
      this.register = relabelReplacements(this.register, from, code, this.corpus());
      neutralLabels(this.sources.filter(s => !s.missing && s.status === "ok"), code);
    }
    await this.rebuild();
  }

  async save() {
    await writeJson(join(this.dir, "private", "notes.json"), this.notes);
    await writeJson(join(this.dir, "private", "procedure.json"), this.procedure);
    await writeJson(join(this.dir, "case.json"), this.case);
    await writeJson(join(this.dir, "sources.json"), this.sources);
    await writeJson(join(this.dir, "private", "register.json"), this.register);
  }

  /** Re-inventory the folder, extract new or changed files, refresh suggestions. */
  async scan({ progress = () => {} } = {}) {
    const { files } = await walk(this.root, { skip: this.ownFolders() });
    const byPath = new Map(this.sources.map(s => [s.rel_path, s]));
    let maxId = this.sources.reduce((n, s) => Math.max(n, Number(s.id.slice(1))), 0);
    const seen = new Set();
    let index = 0;
    for (const file of files) {
      index++;
      seen.add(file.rel_path);
      const extension = extname(file.rel_path).toLowerCase();
      let source = byPath.get(file.rel_path);
      if (!source) {
        source = { id: `D${++maxId}`, rel_path: file.rel_path, name: file.rel_path.split("/").at(-1), version: 0, overrides: {} };
        this.sources.push(source);
      }
      source.ext = extension;
      source.bytes = file.bytes;
      source.missing = false;
      if (!SUPPORTED.has(extension)) {
        Object.assign(source, { status: "unsupported", pages: 0, text_pages: 0 });
        continue;
      }
      progress({ phase: "extract", index, total: files.length, id: source.id });
      const bytes = await readFile(file.absolute);
      const hash = sha256(bytes);
      const cachePath = join(this.dir, "private", "extract", `${hash}.json`);
      let extracted = await readJson(cachePath, null);
      if (!extracted || extracted.extractor !== EXTRACTOR) {
        extracted = await extractFile(file.absolute);
        await writeJson(cachePath, extracted);
      }
      // Pages without a text layer are recognised locally, once per file version.
      // A failed recognition is retried when CourtOS next starts, not on every scan.
      const blank = extension === ".pdf" && !this.ocrFailed.has(hash) ? extracted.pages.filter(p => !p.has_text && !p.ocr_attempted) : [];
      if (blank.length && (await this.ocr.engine())) {
        progress({ phase: "ocr", index, total: files.length, id: source.id, pages: blank.length });
        try {
          const recognised = await this.ocr.pdfPages(file.absolute, blank.map(p => p.n));
          for (const page of blank) {
            const hit = recognised.find(r => r.n === page.n);
            page.ocr_attempted = OCR_VERSION;
            if (!hit) continue;
            page.text = hit.text;
            page.sha256 = sha256(hit.text);
            page.has_text = hit.text.replace(/\s/g, "").length >= 20;
            page.ocr = { engine: hit.engine, confidence: hit.confidence };
          }
          await writeJson(cachePath, extracted);
        } catch {
          this.ocrFailed.add(hash);
        }
      }
      if (source.sha256 && source.sha256 !== hash) source.changed_at = now();
      if (source.sha256 !== hash) source.version++;
      source.sha256 = hash;
      source.status = extracted.status;
      source.pages = extracted.pages.length;
      source.text_pages = extracted.pages.filter(p => p.has_text).length;
      source.ocr_pages = extracted.pages.filter(p => p.ocr && p.has_text).length;
      const guess = classify(file.rel_path, extracted.pages[0]?.text ?? "");
      source.guess = guess;
      source.role = source.overrides.role ?? guess.role;
      source.party = source.overrides.party !== undefined ? source.overrides.party : guess.party;
      source.code = guess.code;
      source.include = source.overrides.include ?? source.status === "ok";
      this.documents.set(source.id, extracted);
    }
    for (const source of this.sources) if (!seen.has(source.rel_path)) { source.missing = true; source.include = false; }
    if (!this.case.language) {
      // The language of the proceedings, from the pleadings first; the user can change it.
      const docs = this.includedDocuments();
      const pleadings = docs.filter(d => ["claim", "response", "submission"].includes(d.role));
      const texts = (pleadings.length ? pleadings : docs).flatMap(d => d.pages.map(p => p.text));
      const detected = detectLanguage(texts);
      if (detected) {
        this.case.language = { code: detected, source: "detected" };
        // Labels generated before the language was known are German.
        if (detected !== "de") this.register = relabelReplacements(this.register, "de", detected, this.corpus());
      }
    }
    this.deriveParties();
    neutralLabels(this.sources.filter(s => !s.missing && s.status === "ok"), this.lang);
    progress({ phase: "detect" });
    const docs = this.includedDocuments();
    const { candidates, report } = suggestAnonymisation(docs);
    this.anonymisationReport = report;
    this.register = mergeDetections(this.register, candidates, this.corpus(), this.lang);
    await this.rebuild();
    progress({ phase: "done" });
  }

  async ensureLoaded() {
    for (const source of this.sources) {
      if (source.missing || source.status !== "ok" || this.documents.has(source.id)) continue;
      const cached = await readJson(join(this.dir, "private", "extract", `${source.sha256}.json`), null);
      if (cached) this.documents.set(source.id, cached);
    }
  }

  includedDocuments() {
    return this.sources.filter(s => s.include && !s.missing && this.documents.has(s.id)).map(s => ({
      id: s.id, label: s.label, role: s.role, party: s.party, sha256: s.sha256, kind: s.ext.slice(1),
      pages: this.documents.get(s.id).pages,
    }));
  }

  corpus() {
    return this.includedDocuments().flatMap(d => d.pages.map(p => p.text)).join("\n\n");
  }

  /** Rebuild the mirror. Any change to its content invalidates an earlier release. */
  async rebuild() {
    const parties = this.partiesView().map(({ id, role, term, pseudonym }) => ({ id, role, term, name_in_text: pseudonym }));
    const { mirror, maps, issues } = buildMirror(this.register, this.includedDocuments(), this.lang, parties);
    this.issues = issues;
    const guard = compileGuard({ register: this.register, realRoot: this.root, workRoot: this.work, relPaths: this.sources.map(s => s.rel_path), allowCorpus: mirror.kept });
    for (const document of mirror.documents) for (const page of [{ text: document.label }, ...document.pages]) {
      const hits = guard.scan(page.text);
      if (hits.length) this.issues.push({ code: "mirror_guard", document: document.id, page: page.n ?? null, hits });
    }
    for (const party of parties) {
      const hits = guard.scan(`${party.term} ${party.name_in_text ?? ""}`);
      if (hits.length) this.issues.push({ code: "mirror_guard", party: party.id, hits });
    }
    const changed = this.mirror?.sha256 !== mirror.sha256;
    this.mirror = mirror;
    this.maps = maps;
    if (this.case.consent && this.case.consent.mirror_sha256 !== mirror.sha256) {
      this.case.consent = { ...this.case.consent, stale: true };
    }
    // The mirror on disk is exactly what a released agent may read.
    await writeJson(join(this.dir, "mirror", "mirror.json"), mirror);
    await writeJson(join(this.dir, "private", "maps.json"), maps);
    await this.save();
    if (changed) this.emit("change", { kind: "mirror", sha256: mirror.sha256 });
  }

  guard() {
    return compileGuard({ register: this.register, realRoot: this.root, workRoot: this.work, relPaths: this.sources.map(s => s.rel_path), allowCorpus: this.mirror?.kept ?? [] });
  }

  async changeRegister(change) {
    this.register = applyChange(this.register, change, this.corpus(), this.lang);
    await this.rebuild();
  }

  async changeSource(id, change) {
    const source = this.sources.find(s => s.id === id);
    if (!source) throw new CourtosError("source_unknown", undefined, 404);
    if (change.role !== undefined) {
      if (!ROLES.has(change.role)) throw new CourtosError("invalid_role");
      source.overrides.role = source.role = change.role;
    }
    if (change.party !== undefined) {
      if (change.party !== null && !/^P[1-9]$/.test(change.party)) throw new CourtosError("invalid_party");
      source.overrides.party = source.party = change.party;
    }
    if (change.include !== undefined) source.overrides.include = source.include = Boolean(change.include) && source.status === "ok";
    neutralLabels(this.sources.filter(s => !s.missing && s.status === "ok"), this.lang);
    await this.rebuild();
  }

  /** The user's consent to let the model read this exact mirror. */
  async release({ model, budgetChf, provider = "anthropic", endpoint = null, memory = null }) {
    if (!this.mirror?.sections.length) throw new CourtosError("nothing_to_release");
    if (this.issues.length) throw new CourtosError("mirror_has_issues", { issues: this.issues });
    // The case memory goes out only as this snapshot: the release names its hash.
    if (memory) {
      if (memory.mirror_sha256 !== this.mirror.sha256 || memory.register_rev !== this.register.rev || memorySha(memory) !== memory.sha256) throw new CourtosError("memory_outdated", undefined, 409);
      await writeJson(join(this.dir, "memory", "released", `${memory.sha256}.json`), memory);
    }
    this.case.consent = {
      at: now(), register_rev: this.register.rev, mirror_sha256: this.mirror.sha256, provider, endpoint, model,
      budget_chf: budgetChf, stale: false,
      memory: memory ? {
        sha256: memory.sha256, created: memory.created, basis: memory.basis, withheld: memory.withheld,
        groups: memory.groups.map(({ key, task, model, findings, notes }) => ({ key, task, model, findings, ...(notes ? { notes } : {}) })),
      } : null,
    };
    await this.save();
    this.emit("change", { kind: "consent" });
    return this.case.consent;
  }

  async revoke() {
    this.case.consent = null;
    await this.save();
    this.emit("change", { kind: "consent" });
  }

  /** The memory snapshot the release names, exactly as approved; anything else voids the release. */
  async releasedMemory() {
    const ref = this.case.consent?.memory;
    if (!ref) return null;
    const snapshot = await readJson(join(this.dir, "memory", "released", `${ref.sha256}.json`), null).catch(() => null);
    if (!snapshot || memorySha(snapshot) !== ref.sha256 || snapshot.sha256 !== ref.sha256
      || snapshot.mirror_sha256 !== this.mirror?.sha256 || snapshot.register_rev !== this.register.rev) throw new CourtosError("consent_required");
    return snapshot;
  }

  consentValid() {
    const consent = this.case.consent;
    return Boolean(consent && !consent.stale && consent.mirror_sha256 === this.mirror?.sha256 && consent.register_rev === this.register.rev);
  }

  /** Original page text for local display only. */
  originalPage(documentId, pageNumber) {
    const extracted = this.documents.get(documentId);
    const page = extracted?.pages.find(p => p.n === pageNumber);
    if (!page) throw new CourtosError("page_unknown", undefined, 404);
    return page;
  }

  async originalFile(documentId) {
    const source = this.sources.find(s => s.id === documentId && !s.missing);
    if (!source) throw new CourtosError("source_unknown", undefined, 404);
    const path = await insideRoot(this.root, source.rel_path);
    const bytes = await readFile(path);
    if (sha256(bytes) !== source.sha256) throw new CourtosError("source_changed", undefined, 409);
    return { bytes, source, path };
  }

  /** Register with context snippets for review; local display only. */
  registerView() {
    return this.register.entities.map(entity => ({
      ...entity,
      readings: ocrReadings(entity),
      samples: (entity.samples ?? []).slice(0, 4).map(sample => {
        try {
          const page = this.originalPage(sample.doc, sample.page);
          const source = this.sources.find(s => s.id === sample.doc);
          return { doc: sample.doc, label: source?.label, page: sample.page, ...sampleContext(page.text, sample.start, sample.length) };
        } catch { return null; }
      }).filter(Boolean),
    }));
  }

  /** Every occurrence of one register entry across the included pages, with
   *  its context and whether the user kept it verbatim. Local display only. */
  occurrences(entityId) {
    const entity = this.register.entities.find(e => e.id === entityId);
    if (!entity) throw new CourtosError("entity_unknown", undefined, 404);
    if (entity.decision !== "replace") return [];
    const transform = compilePageTransform(this.register);
    const kept = new Set((entity.exceptions ?? []).map(ex => `${ex.doc}:${ex.page}:${ex.page_sha256}:${ex.start}`));
    const out = [];
    for (const document of this.includedDocuments()) for (const page of document.pages) {
      if (!page.has_text) continue;
      let result;
      try { result = transform(page.text); } catch { continue; }
      const chars = Array.from(page.text);
      for (const span of result.spans) {
        if (span.entity_id !== entity.id) continue;
        out.push({
          doc: document.id, label: document.label, page: page.n, start: span.original_start, original: span.original,
          before: chars.slice(Math.max(0, span.original_start - 60), span.original_start).join(""),
          after: chars.slice(span.original_end, span.original_end + 60).join(""),
          kept: kept.has(`${document.id}:${page.n}:${page.sha256}:${span.original_start}`),
        });
        if (out.length >= 500) return out;
      }
    }
    return out;
  }

  async setOccurrence({ id, doc, page, start, keep }) {
    const entity = this.register.entities.find(e => e.id === id);
    if (!entity) throw new CourtosError("entity_unknown", undefined, 404);
    const original = this.originalPage(doc, Number(page));
    const next = structuredClone(this.register);
    const target = next.entities.find(e => e.id === id);
    target.exceptions = (target.exceptions ?? []).filter(ex => !(ex.doc === doc && ex.page === Number(page) && ex.start === Number(start)));
    if (keep) target.exceptions.push({ doc, page: Number(page), start: Number(start), page_sha256: original.sha256 });
    target.revision++;
    next.rev++;
    next.updated = now();
    this.register = next;
    await this.rebuild();
  }

  /** Pseudonymise text the user typed (questions, notes) with the case register. */
  pseudonymise(text) {
    const labels = this.register.entities.filter(e => e.decision === "replace").map(e => e.replacement).sort((a, b) => b.length - a.length);
    const kept = [];
    let masked = canonicalText(text);
    for (const label of labels) {
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "gu");
      masked = masked.replace(pattern, () => `\uE000${kept.push(label) - 1}\uE001`);
    }
    let out;
    try { out = compilePageTransform(this.register)(masked).text; }
    catch { throw new CourtosError("text_unpseudonymisable"); }
    return out.replace(/\uE000(\d+)\uE001/g, (_, i) => kept[Number(i)]);
  }

  // --- parties -----------------------------------------------------------
  /**
   * The parties as the file names show them, until the user sets them. A claim has a claimant
   * and a respondent; a civil appeal an appellant and the other side; an appeal against a
   * decision has the appellant, then each filer of a response or observations in file order:
   * a private respondent, an authority or the court below. Their pleadings are assigned to them.
   */
  deriveParties() {
    // Parties set before CourtOS recorded who set them count as the user's unless they are the untouched default.
    const current = this.case.parties ?? [];
    const untouched = current.length === 2 && current[0].role === "claimant" && current[1].role === "respondent" && current.every(p => !p.entity && !p.gender);
    if (this.case.parties_by === "user" || (this.case.parties_by !== "files" && !untouched)) return;
    const live = this.sources.filter(s => !s.missing && s.status === "ok");
    const kindOf = (s) => (s.guess && s.guess.role === s.role ? s.guess.kind ?? null : null);
    const claims = live.filter(s => s.role === "claim").map(kindOf);
    let roles = ["claimant", "respondent"];
    const assigned = new Map();
    if (claims.includes("appeal")) {
      roles = ["objector"];
      const filers = new Map();
      for (const s of live.filter(s => s.role === "response").sort((a, b) => a.rel_path.localeCompare(b.rel_path))) {
        const kind = kindOf(s);
        const key = filerOf(s.name);
        if (!filers.has(key) && roles.length < 9) {
          roles.push(kind === "lower_instance" ? "lower_instance" : ["authority", "observations"].includes(kind) ? "authority" : "objection_respondent");
          filers.set(key, `P${roles.length}`);
        }
        if (filers.has(key)) assigned.set(s.id, filers.get(key));
      }
      if (roles.length === 1) roles.push("objection_respondent");
    } else if (claims.includes("civil_appeal")) {
      roles = ["appellant", "appeal_respondent"];
    }
    this.case.parties_by = "files";
    if (current.length !== roles.length || current.some((party, i) => party.role !== roles[i])) {
      this.case.parties = roles.map((role, i) => ({ id: `P${i + 1}`, role, entity: null, gender: null }));
      // A document the user gave to a party that no longer exists belongs to no party.
      for (const s of this.sources) if (s.party && Number(s.party.slice(1)) > roles.length) { s.party = null; if (s.overrides.party !== undefined) s.overrides.party = null; }
    }
    for (const s of live) if (s.overrides.party === undefined && assigned.has(s.id)) s.party = assigned.get(s.id);
  }

  async setParties(parties) {
    if (!Array.isArray(parties) || !parties.length || parties.length > 9) throw new CourtosError("invalid_parties");
    const ids = new Set();
    this.case.parties = parties.map((party, i) => {
      const id = `P${i + 1}`;
      if (!PARTY_ROLES.includes(party.role)) throw new CourtosError("invalid_role");
      if (party.entity !== null && party.entity !== undefined && !this.register.entities.some(e => e.id === party.entity)) throw new CourtosError("entity_unknown");
      if (![undefined, null, "f", "m"].includes(party.gender)) throw new CourtosError("invalid_party");
      ids.add(id);
      return { id, role: party.role, entity: party.entity ?? null, gender: party.gender ?? null };
    });
    this.case.parties_by = "user";
    for (const source of this.sources) if (source.party && !ids.has(source.party)) { source.party = null; source.overrides.party = null; }
    await this.rebuild();
  }

  /** Grammatical gender for the role term: the user's choice; else feminine for a
   *  company (die AG); else from a title before the person's name; else unknown. */
  partyGender(party) {
    if (party.gender) return party.gender;
    const entity = this.register.entities.find(e => e.id === party.entity);
    if (!entity) return null;
    if (entity.kind === "organisation" || this.companyName(entity)) return "f";
    if (entity.kind !== "person") return null;
    const names = entity.aliases.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const title = (words) => new RegExp(`(?<![\\p{L}])(?:${words})\\s+(?:(?:Dr|Prof|lic|iur|med|Me|avv|dott)\\.\\s*)*(?:${names})(?![\\p{L}])`, "u");
    const text = this.corpus();
    const female = title("Frau|Madame|Mme|Signora|Sig\\.ra|Ms\\.?|Mrs\\.?").test(text);
    const male = title("Herrn?|Monsieur|M\\.|Signor|Sig\\.|Mr\\.?").test(text);
    return female === male ? null : female ? "f" : "m";
  }

  /** The full company name when the file writes this name with a legal form
   *  ("Bergfeld" → "Bergfeld Bau GmbH"), else null. */
  companyName(entity) {
    if (entity.kind === "organisation") return entity.label;
    const names = entity.aliases.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const pattern = new RegExp(`(?<![\\p{L}])(?:${names})(?:\\s+\\p{Lu}[\\p{L}&-]*){0,3}\\s+(?:AG|GmbH|SA|Sàrl|Sagl|Srl|Ltd|LLC|KG|KlG|Genossenschaft|Stiftung)(?![\\p{L}])`, "u");
    return pattern.exec(this.corpus())?.[0].replace(/\s+/gu, " ") ?? null;
  }

  /**
   * The parties with their procedural role in the language of the proceedings.
   * `pseudonym` is the name as Claude reads it; `name` is the original and is
   * for local display only.
   */
  partiesView() {
    return (this.case.parties ?? []).map(party => {
      const entity = this.register.entities.find(e => e.id === party.entity) ?? null;
      const gender = this.partyGender(party);
      let pseudonym = null;
      const name = entity ? (this.companyName(entity) ?? entity.label) : null;
      if (name) { try { pseudonym = this.pseudonymise(name); } catch { pseudonym = entity.replacement || null; } }
      return { ...party, gender_used: gender, term: partyTerm(this.lang, party.role, gender), name, pseudonym };
    });
  }

  // --- working notes -----------------------------------------------------
  async addNote({ text, status = "proposed", kind = "note", refs = [], origin = null }) {
    if (this.notes.length >= 2000) throw new CourtosError("too_many_notes");
    if (!NOTE_STATUS.has(status) || !NOTE_KIND.has(kind)) throw new CourtosError("invalid_note");
    const note = {
      id: `N${(this.notes.reduce((n, x) => Math.max(n, Number(x.id.slice(1)) || 0), 0)) + 1}`,
      text: cleanText(text, 8000), status, kind, refs: sanitiseRefs(refs), origin: typeof origin === "string" ? origin.slice(0, 120) : null,
      created: now(), updated: now(),
    };
    this.notes.push(note);
    await this.save();
    this.emit("change", { kind: "notes" });
    return note;
  }

  async updateNote(id, patch) {
    const note = this.notes.find(n => n.id === id);
    if (!note) throw new CourtosError("note_unknown", undefined, 404);
    if (patch.text !== undefined) note.text = cleanText(patch.text, 8000);
    if (patch.status !== undefined) { if (!NOTE_STATUS.has(patch.status)) throw new CourtosError("invalid_note"); note.status = patch.status; }
    if (patch.kind !== undefined) { if (!NOTE_KIND.has(patch.kind)) throw new CourtosError("invalid_note"); note.kind = patch.kind; }
    note.updated = now();
    await this.save();
    this.emit("change", { kind: "notes" });
    return note;
  }

  async deleteNote(id) {
    const before = this.notes.length;
    this.notes = this.notes.filter(n => n.id !== id);
    if (this.notes.length === before) throw new CourtosError("note_unknown", undefined, 404);
    await this.save();
    this.emit("change", { kind: "notes" });
  }

  // --- procedure -----------------------------------------------------------
  async changeProcedure(change) {
    const list = change.list === "orders" ? this.procedure.orders : change.list === "deadlines" ? this.procedure.deadlines : null;
    if (!list) throw new CourtosError("invalid_procedure");
    if (change.op === "add") {
      if (list.length >= 500) throw new CourtosError("too_many_entries");
      const date = typeof change.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(change.date) ? change.date : null;
      if (change.list === "deadlines" && !date) throw new CourtosError("date_required");
      const entry = {
        id: randomId(6), title: cleanText(change.title, 300), date,
        status: change.list === "orders" ? (change.status === "issued" ? "issued" : "draft") : "open",
        text: typeof change.text === "string" && change.text.trim() ? cleanText(change.text, 60000) : "",
        ref: typeof change.ref === "string" ? change.ref.slice(0, 300) : "", created: now(),
      };
      list.push(entry);
    } else if (change.op === "update") {
      const entry = list.find(e => e.id === change.id);
      if (!entry) throw new CourtosError("entry_unknown", undefined, 404);
      if (change.title !== undefined) entry.title = cleanText(change.title, 300);
      if (change.text !== undefined) entry.text = change.text ? cleanText(change.text, 60000) : "";
      if (change.status !== undefined) entry.status = ["open", "done", "draft", "issued"].includes(change.status) ? change.status : entry.status;
      if (change.date !== undefined) entry.date = /^\d{4}-\d{2}-\d{2}$/.test(change.date ?? "") ? change.date : entry.date;
      entry.updated = now();
    } else if (change.op === "delete") {
      const index = list.findIndex(e => e.id === change.id);
      if (index < 0) throw new CourtosError("entry_unknown", undefined, 404);
      list.splice(index, 1);
    } else throw new CourtosError("invalid_procedure");
    list.sort((a, b) => String(a.date ?? "9999").localeCompare(String(b.date ?? "9999")));
    await this.save();
    this.emit("change", { kind: "procedure" });
  }

  /**
   * Top-level folders of the case folder that are CourtOS's own output: the
   * work-products folder, when the work folder is the case folder itself.
   */
  ownFolders() {
    return this.work === this.root && this.case.products_dir ? [this.case.products_dir] : [];
  }

  /** Re-scan when files in the case folder change. CourtOS's own folders are ignored. */
  watch() {
    if (this.watcher) return;
    let timer = null;
    try {
      this.watcher = watch(this.root, { recursive: true }, (_event, name) => {
        const parts = String(name ?? "").split(/[\\/]/);
        if (!name || parts.some(part => part.startsWith(".")) || this.ownFolders().includes(parts[0])) return;
        clearTimeout(timer);
        timer = setTimeout(() => this.scan().then(() => this.emit("change", { kind: "folder" })).catch(() => {}), 1200);
      });
    } catch {
      this.watcher = null;
    }
  }

  close() {
    this.watcher?.close();
    this.watcher = null;
  }
}

function sanitiseRefs(refs) {
  if (!Array.isArray(refs)) return [];
  return refs.slice(0, 12).map(ref => ({
    label: String(ref?.label ?? "").slice(0, 80), page_label: String(ref?.page_label ?? "").slice(0, 40),
    document: /^D\d{1,4}$/.test(ref?.document ?? "") ? ref.document : null, page: Number.isInteger(ref?.page) ? ref.page : null,
    quote: String(ref?.quote ?? "").slice(0, 2000), url: /^https:\/\//.test(ref?.url ?? "") ? String(ref.url).slice(0, 400) : null,
  }));
}
