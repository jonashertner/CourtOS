// The private pseudonym register: one durable identity per real person,
// organisation or identifier in this case folder. Stored only in
// .courtos/private/. It never leaves the machine and never enters a model call.
import { createHash } from "node:crypto";
import { citecheckVocabulary, ocrRepairs } from "./anonymise.mjs";
import { PREFIX, STRUCTURED_KINDS } from "./detect.mjs";
import { caseLanguage, REPLACEMENT_PREFIX } from "./language.mjs";
import { aliasExpression, CourtosError } from "./util.mjs";

const normal = (text) => text.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("de");
const entityId = (kind, label) => "E" + createHash("sha256").update(`${kind}\0${normal(label)}`).digest("hex").slice(0, 12);

export function emptyRegister() {
  return { schema: 1, rev: 0, entities: [], updated: null };
}

function replacementTaken(register, replacement, corpus, except) {
  const key = normal(replacement);
  if (register.entities.some(e => e !== except && normal(e.replacement) === key)) return true;
  return aliasExpression(replacement, "iu").test(corpus);
}

const LETTER_KINDS = new Set(["person", "organisation"]);
const letterLabel = (i) => {
  // A … Z, then AA, AB … like court practice; never a label the text already uses.
  let s = "", n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return `${s}.________`;
};

function nextReplacement(register, kind, corpus, style = null, lang = "de") {
  if ((style ?? (LETTER_KINDS.has(kind) ? "letter" : "label")) === "letter") {
    for (let i = 0; i < 26 * 27; i++) {
      const candidate = letterLabel(i);
      const letter = candidate.split(".")[0];
      const used = register.entities.some(e => e.replacement === candidate) || new RegExp(`(?<![\\p{L}\\p{N}])${letter}\\.(?:_{2,}|\\s)`, "u").test(corpus);
      if (!used) return candidate;
    }
  }
  const prefix = REPLACEMENT_PREFIX[caseLanguage(lang)][kind] ?? PREFIX[kind] ?? "Angabe";
  for (let n = 1; n < 10000; n++) {
    const candidate = `${prefix} ${n}`;
    if (!replacementTaken(register, candidate, corpus)) return candidate;
  }
  throw new CourtosError("register_full");
}

/** Merge fresh detections; human decisions and replacements are never overwritten. */
export function mergeDetections(register, candidates, corpus, lang = "de") {
  const next = structuredClone(register);
  const byAlias = new Map();
  for (const entity of next.entities) for (const alias of [entity.label, ...entity.aliases]) byAlias.set(normal(alias), entity);
  for (const entity of next.entities) if (entity.origin === "detected") { entity.count = 0; entity.samples = []; }
  for (const candidate of candidates) {
    const existing = byAlias.get(normal(candidate.label)) ?? candidate.aliases.map(a => byAlias.get(normal(a))).find(Boolean);
    if (existing) {
      for (const alias of candidate.aliases) if (!existing.removed_aliases?.some(r => normal(r) === normal(alias)) && !byAlias.has(normal(alias))) {
        existing.aliases.push(alias);
        byAlias.set(normal(alias), existing);
      }
      existing.count = (existing.count ?? 0) + candidate.count;
      existing.samples = [...(existing.samples ?? []), ...candidate.samples].slice(0, 8);
      existing.notes = [...new Set([...(existing.notes ?? []), ...candidate.notes])];
      // Fail safe: new evidence that a kept suggestion identifies someone ("Hans Bucher" on a
      // later page) switches it to replace, unless a person decided to keep it.
      if (existing.origin === "detected" && !existing.reviewed && existing.decision === "keep" && candidate.decision === "replace") existing.decision = "replace";
      continue;
    }
    const entity = {
      id: entityId(candidate.kind, candidate.label), kind: candidate.kind, label: candidate.label,
      aliases: candidate.aliases.filter(a => !byAlias.has(normal(a))), replacement: "",
      decision: candidate.decision === "keep" ? "keep" : "replace", origin: "detected", source: candidate.source ?? "courtos",
      count: candidate.count, samples: candidate.samples, notes: candidate.notes, revision: 1,
      ...(candidate.candidates ? { candidates: candidate.candidates } : {}),
    };
    if (!entity.aliases.length) continue;
    entity.replacement = nextReplacement(next, entity.kind, corpus, candidate.style, lang);
    next.entities.push(entity);
    for (const alias of entity.aliases) byAlias.set(normal(alias), entity);
  }
  // Only a change to what is replaced counts as a new revision; refreshed
  // counts and context samples do not invalidate an earlier release.
  if (signature(next) !== signature(register)) {
    next.rev++;
    next.updated = new Date().toISOString();
  }
  return next;
}

/**
 * Generated identifier labels ("Adresse 1") follow the case language. Labels the
 * user wrote, and letter labels for persons, stay as they are.
 */
export function relabelReplacements(register, from, to, corpus) {
  const next = structuredClone(register);
  const source = REPLACEMENT_PREFIX[caseLanguage(from)], target = REPLACEMENT_PREFIX[caseLanguage(to)];
  const generated = next.entities.filter(e => source[e.kind] && new RegExp(`^${escapeForRegex(source[e.kind])} (\\d+)$`, "u").test(e.replacement));
  // Free the old labels first so that a same-numbered target label is never "taken" by its predecessor.
  const numbers = new Map(generated.map(e => [e, Number(/(\d+)$/.exec(e.replacement)[1])]));
  for (const e of generated) e.replacement = "";
  for (const e of generated) {
    const wanted = `${target[e.kind]} ${numbers.get(e)}`;
    e.replacement = replacementTaken(next, wanted, corpus, e) ? nextReplacement(next, e.kind, corpus, "label", to) : wanted;
  }
  if (signature(next) !== signature(register)) { next.rev++; next.updated = new Date().toISOString(); }
  return next;
}
const escapeForRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const signature = (register) => JSON.stringify(register.entities.map(e => [e.id, e.decision, e.replacement, [...e.aliases].sort()]));

/** Repaired readings the user may choose for a damaged OCR word, capitalised like the word. */
export function ocrReadings(entity) {
  if (!entity.notes?.includes("ocr_word") || entity.aliases.some(a => /\s/.test(a))) return [];
  const vocab = citecheckVocabulary();
  const common = entity.aliases.map(a => ocrRepairs(a).filter(r => vocab.has(r))).reduce((a, b) => a.filter(r => b.includes(r)));
  const upper = Array.from(entity.aliases[0])[0] !== Array.from(entity.aliases[0])[0].toLocaleLowerCase("de");
  return common.map(r => upper ? r.charAt(0).toLocaleUpperCase("de") + r.slice(1) : r);
}

const KINDS = new Set(Object.keys(PREFIX));

/** Apply one reviewed change from the user. Every change bumps the revision. */
export function applyChange(register, change, corpus, lang = "de") {
  const next = structuredClone(register);
  const find = (id) => next.entities.find(e => e.id === id) ?? (() => { throw new CourtosError("entity_unknown", undefined, 404); })();
  const clean = (text) => {
    if (typeof text !== "string") throw new CourtosError("invalid_text");
    const value = text.normalize("NFC").replace(/\s+/gu, " ").trim();
    if (Array.from(value).length < 2 || Array.from(value).length > 200 || /[\p{Cf}\p{Cc}]/u.test(value)) throw new CourtosError("invalid_text");
    return value;
  };
  const claimedElsewhere = (alias, owner) => next.entities.some(e => e !== owner && [e.label, ...e.aliases].some(a => normal(a) === normal(alias)));
  switch (change.op) {
    case "decision": {
      const entity = find(change.id);
      if (!["replace", "keep"].includes(change.decision)) throw new CourtosError("invalid_decision");
      entity.decision = change.decision;
      entity.reviewed = true;   // a human decision; fresh detections never override it
      break;
    }
    case "replacement": {
      const entity = find(change.id);
      const value = clean(change.replacement);
      if (replacementTaken(next, value, corpus, entity)) throw new CourtosError("replacement_taken");
      if ([entity.label, ...entity.aliases].some(a => aliasExpression(a, "iu").test(value))) throw new CourtosError("replacement_contains_original");
      entity.replacement = value;
      delete entity.read_as;
      entity.revision++;
      break;
    }
    case "read_as_word": {
      // A word text recognition damaged ("Ruge" for "Rüge") that the detector took for a
      // name. After review the user may let Claude read the repaired word instead of a
      // letter. Only a repair of this one word that the vocabulary knows is accepted; the
      // damaged form itself stays registered, so it can never reach a request.
      const entity = find(change.id);
      if (change.reading === null) {
        if (!entity.read_as) throw new CourtosError("invalid_reading");
        delete entity.read_as;
        entity.replacement = "";
        entity.replacement = nextReplacement(next, entity.kind, corpus, "letter", lang);
        entity.revision++;
        break;
      }
      const reading = typeof change.reading === "string" ? change.reading.normalize("NFC").trim() : "";
      const vocab = citecheckVocabulary();
      const word = reading.toLocaleLowerCase("de");
      const repairs = entity.aliases.map(a => ocrRepairs(a));
      if (!entity.notes?.includes("ocr_word") || entity.aliases.some(a => /\s/.test(a)) || !vocab.has(word)
        || !repairs.every(list => list.includes(word))) throw new CourtosError("invalid_reading");
      if (next.entities.some(e => e !== entity && normal(e.replacement) === word)) throw new CourtosError("replacement_taken");
      // Keep the capitalisation of the damaged form: "Ruge" reads as "Rüge".
      const first = Array.from(entity.aliases[0])[0];
      entity.replacement = (first === first.toLocaleUpperCase("de") ? word.charAt(0).toLocaleUpperCase("de") : word.charAt(0)) + word.slice(1);
      entity.read_as = entity.replacement;
      entity.decision = "replace";
      entity.reviewed = true;
      entity.revision++;
      break;
    }
    case "add_alias": {
      const entity = find(change.id);
      const value = clean(change.alias);
      if (claimedElsewhere(value, entity)) throw new CourtosError("alias_taken");
      if (!entity.aliases.some(a => normal(a) === normal(value))) entity.aliases.push(value);
      entity.removed_aliases = (entity.removed_aliases ?? []).filter(a => normal(a) !== normal(value));
      entity.revision++;
      break;
    }
    case "remove_alias": {
      const entity = find(change.id);
      if (entity.aliases.length <= 1) throw new CourtosError("last_alias");
      entity.aliases = entity.aliases.filter(a => a !== change.alias);
      entity.removed_aliases = [...new Set([...(entity.removed_aliases ?? []), change.alias])];
      entity.revision++;
      break;
    }
    case "add_entity": {
      const kind = KINDS.has(change.kind) ? change.kind : "person";
      const value = clean(change.text);
      if (claimedElsewhere(value, null)) throw new CourtosError("alias_taken");
      if (!aliasExpression(value, "iu").test(corpus)) throw new CourtosError("text_not_found");
      const entity = { id: entityId(kind, value), kind, label: value, aliases: [value], replacement: "", decision: "replace", origin: "user", count: 0, samples: [], notes: [], revision: 1 };
      if (next.entities.some(e => e.id === entity.id)) throw new CourtosError("alias_taken");
      entity.replacement = nextReplacement(next, kind, corpus, null, lang);
      next.entities.push(entity);
      break;
    }
    case "merge": {
      const target = find(change.into), source = find(change.id);
      if (target === source || STRUCTURED_KINDS.has(target.kind) !== STRUCTURED_KINDS.has(source.kind)) throw new CourtosError("merge_rejected");
      target.aliases = [...new Set([...target.aliases, source.label, ...source.aliases])];
      target.count += source.count;
      target.revision++;
      next.entities = next.entities.filter(e => e !== source);
      break;
    }
    default:
      throw new CourtosError("unknown_change");
  }
  next.rev++;
  next.updated = new Date().toISOString();
  return next;
}

/** Projection-kernel terms. Only entities the user keeps replacing; reviewed at release. */
export function reviewedTerms(register, kinds = null) {
  return register.entities
    .filter(e => e.decision === "replace" && (!kinds || kinds.has(e.kind)))
    .map(e => ({ entity_id: e.id, revision: e.revision, aliases: [...new Set(e.aliases.filter(a => Array.from(a).length >= 2))], replacement: e.replacement, reviewed: true, ...(e.read_as && e.read_as === e.replacement ? { reading: true } : {}) }));
}
