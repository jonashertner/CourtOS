// Work products: CourtOS's results as ordinary files in the case's work
// folder, to open in Word, Explorer or any editor. Each verified run becomes a
// Markdown file and a Word document in the language it was written in. They
// carry real names: they are written on this computer and never sent anywhere.
//
// The labels come from the same tables as the browser and the Word pane
// (web/shared.js, web/word-doc.js), so a file reads like the screen.
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { claimPlain, inLanguage, label, labelIn, parseDate, refLabel, tr } from "../web/shared.js";
import { comparisonStatus } from "../web/results.js";
import { BUILD, partyName, sources } from "../web/word-doc.js";
import { PRODUCTS_DIR } from "./cases.mjs";
import { readJson, writeAtomic, writeJson } from "./util.mjs";

const exists = async (path) => Boolean(await stat(path).catch(() => null));
const verified = (claim) => [...(claim?.citations ?? []), ...(claim?.context ?? [])].every(x => x.match === "exact");
/** The run's day on this computer's clock, as 2026-10-12. */
const day = (run) => { const d = new Date(run.finished ?? run.started); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("sv-SE"); };
const LOCALE = { de: "de-CH", fr: "fr-CH", it: "it-CH", en: "en-GB" };
/** "12. Oktober 2026", "12 octobre 2026": the date as the text around it writes it. File names keep 2026-10-12, which sorts. */
const longDate = (run, lang) => { const d = new Date(run.finished ?? run.started); return Number.isNaN(d.getTime()) ? day(run) : d.toLocaleDateString(LOCALE[lang] ?? "de-CH", { day: "numeric", month: "long", year: "numeric" }); };

/** The language a run's text is written in: the draft in the language of the proceedings, analyses in the reader's. */
export const runLanguage = (run, caseLanguage) => (run.task === "decision_draft" ? caseLanguage : run.language) ?? caseLanguage ?? "de";

/** What was read and what was not, and the result's checksum last. Call inside inLanguage. */
function closing(run) {
  const cov = run.result.coverage;
  const lines = [tr("Gelesen: {r} von {s} Aktenseiten.", { r: cov.reviewed, s: cov.sections })];
  if (cov.authorities_read?.length) lines.push(tr("Entscheide gelesen: {l}.", { l: cov.authorities_read.map(a => a.docket ?? a.decision_id).join(", ") }));
  if (cov.unread.length) lines.push(tr("Nicht gelesen: {l}.", { l: cov.unread.map(u => refLabel({ label: u.label, page_label: `S. ${u.page}` })).join(", ") }));
  if (cov.unreadable_pages.length) lines.push(tr("Ohne Text, nicht ausgewertet: {l}.", { l: cov.unreadable_pages.map(u => `${u.label} ${u.page}`).join(", ") }));
  if (cov.more_claims_reported) lines.push(tr("Das Modell meldet, nicht alle Aussagen erfasst zu haben."));
  lines.push(tr("Prüfsumme des Ergebnisses: {s}", { s: run.result.integrity?.result_sha256 ?? "–" }));
  return lines;
}

/** The line above a result: who wrote it, when, and how much of it is checked against the sources. Call inside inLanguage. */
function frame(run, lang) {
  const total = run.result.claims.length, checked = run.result.claims.filter(verified).length;
  return tr("Arbeitsentwurf von CourtOS vom {d}, Modell {m}. {v} von {t} Aussagen sind wörtlich an ihren Quellen geprüft; ob eine Stelle die Aussage trägt, prüfen Sie.", { d: longDate(run, lang), m: run.model, v: checked, t: total });
}

/** A verified run as Markdown: every statement with its quotations and where they stand. */
export function resultMarkdown(run, view, lang) {
  return inLanguage(lang, () => {
    const result = run.result;
    const claims = new Map(result.claims.map(c => [c.id, c]));
    const party = (p) => partyName(view, p);
    /** A statement, then each quotation it rests on, marked where it is not verified. */
    const said = (id, indent = "") => {
      const c = claims.get(id);
      if (!c) return [];
      const lines = [`${indent}${verified(c) ? "" : `[${tr("prüfen")}] `}${claimPlain(c) || "–"}`];
      for (const x of [...c.citations, ...(c.context ?? [])]) {
        const quote = (x.quote_original ?? x.quote_pseudonymised ?? "").replace(/\s+/g, " ").trim();
        lines.push(`${indent}> ${quote ? `«${quote}» — ` : ""}${refLabel(x)}${x.match === "exact" ? "" : ` (${tr("nicht verifiziert")})`}`);
      }
      return [...lines, ""];
    };
    const field = (title, ids, empty) => [`**${title}**`, "", ...(ids.length ? ids.flatMap(id => said(id)) : [empty, ""])];
    const out = [
      `# ${label("task", run.task)}`, "",
      frame(run, lang), "",
    ];
    if (run.question) out.push(`**${tr("Frage")}:** ${run.question}`, "");
    switch (run.task) {
      case "chronology": {
        const rows = result.rows.map(row => ({ row, date: row.date ? parseDate(claims.get(row.date)?.text) : null }))
          .sort((a, b) => (a.date && b.date) ? a.date - b.date : a.date ? -1 : b.date ? 1 : 0);
        for (const { row } of rows) {
          const when = row.date ? claimPlain(claims.get(row.date)) : tr("ohne Datum");
          out.push(`**${when}** · ${party(row.party)}, ${label("posture", row.posture)}`, "", ...said(row.event));
        }
        break;
      }
      case "facts_evidence":
        for (const row of result.rows) {
          out.push(`## ${row.id} · ${party(row.party)} · ${label("facts", row.assessment)}`, "", ...said(row.statement),
            ...field(tr("Beweismittel"), row.evidence, tr("Keines im ausgewerteten Material")),
            ...field(tr("Andere Partei"), row.opposing, tr("Keine Stellungnahme im ausgewerteten Material")),
            ...field(tr("Würdigung"), [row.reasoning], "–"));
        }
        break;
      case "party_comparison":
        for (const category of ["relief", "fact", "legal"]) {
          const rows = result.rows.filter(r => r.category === category);
          if (!rows.length) continue;
          out.push(`## ${label("category", category)}`, "");
          for (const row of rows) {
            out.push(`### ${row.id} · ${label("compareStatus", comparisonStatus(row))}`, "");
            for (const x of row.positions) out.push(`**${party(x.party)}**, ${label("posture", x.posture)}:`, "", ...said(x.claim));
            out.push(...field(tr("Einordnung"), [row.analysis], "–"));
          }
        }
        break;
      case "legal_claims":
        for (const row of result.rows) {
          out.push(`## ${row.id} · ${party(row.party)} · ${label("legal", row.assessment)}`, "", ...said(row.statement),
            ...field(tr("Rechtsprechung und Literatur"), row.authorities, tr("Keine in der Auswahl")),
            ...field(tr("Würdigung"), [row.reasoning], "–"),
            ...(row.manual_source ? field(tr("Selbst prüfen"), [row.manual_source], "–") : []));
        }
        break;
      case "decision_draft":
        for (const part of ["facts", "issue", "reasoning", "counterargument", "open_issue", "disposition"]) {
          const rows = result.rows.filter(r => r.part === part);
          if (!rows.length) continue;
          out.push(`## ${label("part", part)}`, "");
          rows.forEach((row, i) => {
            const lead = part === "disposition" ? `${i + 1}. ` : row.status && row.status !== "analysis" ? `*${label("draftStatus", row.status)}:* ` : "";
            const [first, ...rest] = said(row.claim);
            out.push(`${lead}${first}`, ...rest);
          });
        }
        break;
      case "fundamental_questions":
        for (const row of result.rows) {
          out.push(`## ${claimPlain(claims.get(row.question))}`, "", ...said(row.question).slice(1),
            ...field(tr("Analyse"), [row.analysis], "–"),
            ...field(tr("Gegenargumente"), row.contrary, tr("Keine in der Auswahl")));
        }
        break;
      case "hypothetical_impact":
        for (const row of result.rows) {
          out.push(`## ${row.assumption_id ?? row.id}`, "",
            ...field(tr("Ausgangslage"), [row.baseline], "–"),
            ...field(tr("Unter der Annahme (hypothetisch)"), [row.analysis], "–"),
            ...field(tr("Grenzen"), row.limitations, "–"));
        }
        break;
      default:
        for (const row of result.rows) out.push(...said(row.answer));
    }
    const [checksum, ...read] = closing(run).reverse();
    out.push("---", "", ...read.reverse(), "", checksum);
    return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
  });
}

// --- Word ------------------------------------------------------------------
// A plain, carefully set document: A4, 2.5 cm margins, justified text with
// hyphenation in the language of the proceedings, sources in footnotes ending
// with a full stop, numbered proposals with a hanging indent. A table gets a
// header row that repeats on each page, rows kept on one page, rules between
// rows and no vertical lines. The page turns to landscape from five columns
// on, or when the text runs in several columns rather than one main column. Styles are named
// so a court's own template can take over when the text is pasted.

// XML 1.0 forbids most control characters; a stray one would make Word refuse the file.
const xml = (s) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const run = (text, props = "") => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
const para = (style, body, props = "") => `<w:p><w:pPr><w:pStyle w:val="${style}"/>${props}</w:pPr>${body}</w:p>`;
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const PAGE = { w: 11906, h: 16838, margin: 1418 };

function styles(lang) {
  const font = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>';
  const style = (id, name, ppr, rpr, extra = "") => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/>${extra}<w:qFormat/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
  const cell = '<w:jc w:val="left"/><w:spacing w:before="0" w:after="40" w:line="252" w:lineRule="auto"/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="${LOCALE[lang] ?? "de-CH"}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="both"/></w:pPr></w:style>
${style("Title", "Title", '<w:jc w:val="left"/><w:spacing w:after="80"/><w:keepNext/>', '<w:b/><w:sz w:val="32"/><w:szCs w:val="32"/>', '<w:next w:val="Normal"/>')}
${style("Subtitle", "Subtitle", '<w:jc w:val="left"/><w:spacing w:after="360"/>', '<w:color w:val="595959"/><w:sz w:val="18"/><w:szCs w:val="18"/>', '<w:next w:val="Normal"/>')}
${style("Heading1", "heading 1", '<w:jc w:val="left"/><w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/>', '<w:b/><w:sz w:val="24"/><w:szCs w:val="24"/>', '<w:next w:val="Normal"/>')}
${style("Numbered", "List Number", '<w:tabs><w:tab w:val="left" w:pos="425"/></w:tabs><w:ind w:left="425" w:hanging="425"/>', "")}
${style("TableHeading", "Table Heading", `${cell}<w:keepNext/>`, '<w:b/><w:sz w:val="18"/><w:szCs w:val="18"/>')}
${style("TableText", "Table Text", cell, '<w:sz w:val="19"/><w:szCs w:val="19"/>')}
${style("TableNote", "Table Note", cell, '<w:color w:val="595959"/><w:sz w:val="17"/><w:szCs w:val="17"/>')}
${style("Closing", "Closing", '<w:jc w:val="left"/><w:spacing w:before="0" w:after="40" w:line="252" w:lineRule="auto"/>', '<w:color w:val="595959"/><w:sz w:val="17"/><w:szCs w:val="17"/>')}
${style("FootnoteText", "footnote text", '<w:jc w:val="left"/><w:spacing w:after="40" w:line="240" w:lineRule="auto"/><w:ind w:left="170" w:hanging="170"/>', '<w:sz w:val="17"/><w:szCs w:val="17"/>')}
<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
</w:styles>`;
}

/** A table spec from web/word-doc.js: column widths as shares of the text width, a line break in a cell starts a new paragraph. */
function table(spec, width) {
  const widths = spec.columns.map(c => Math.round(c.width * width));
  const rule = (side, size, color) => `<w:${side} w:val="single" w:sz="${size}" w:space="0" w:color="${color}"/>`;
  const lines = (text, style) => String(text ?? "").split("\n").map(line => para(style, run(line))).join("");
  const cell = (i, content, props = "") => `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/>${props}</w:tcPr>${content}</w:tc>`;
  const head = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${spec.columns.map((c, i) => cell(i, lines(c.head, "TableHeading"), `<w:tcBorders>${rule("bottom", 8, "000000")}</w:tcBorders>`)).join("")}</w:tr>`;
  const rows = spec.rows.map(row => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${row.map((c, i) => cell(i, lines(c.text, "TableText") + (c.sub ? lines(c.sub, "TableNote") : ""))).join("")}</w:tr>`);
  const margin = (side, w) => `<w:${side} w:w="${w}" w:type="dxa"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${rule("bottom", 4, "808080")}${rule("insideH", 2, "BFBFBF")}</w:tblBorders><w:tblCellMar>${margin("top", 57)}${margin("left", 85)}${margin("bottom", 57)}${margin("right", 85)}</w:tblCellMar><w:tblLook w:val="0020" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${head}${rows.join("")}</w:tbl>`;
}

/**
 * A spec from web/word-doc.js as a .docx file: a table, or an outline of
 * headings and paragraphs with an optional lead, number and sources, each
 * paragraph's sources as its footnote. The closing lines end the document in
 * small print.
 */
export function wordDocument(spec, { title, subtitle, lang, closing: end = [] }) {
  const notes = [];
  const footnote = (text) => {
    notes.push(text);
    return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${notes.length}"/></w:r>`;
  };
  const landscape = spec.kind === "table" && (spec.columns.length >= 5 || spec.columns.every(c => c.width < 0.4));
  const [pageW, pageH] = landscape ? [PAGE.h, PAGE.w] : [PAGE.w, PAGE.h];
  const body = [para("Title", run(title)), subtitle ? para("Subtitle", run(subtitle)) : ""];
  if (spec.kind === "table") body.push(table(spec, pageW - 2 * PAGE.margin));
  else for (const block of spec.blocks) {
    if (block.heading) { body.push(para("Heading1", run(block.heading))); continue; }
    const parts = [
      block.number ? run(`${block.number}.\t`) : "",
      block.lead ? run(`${block.lead}: `, "<w:b/>") : "",
      run(block.text),
      block.note ? footnote(`${block.note}.`) : "",
    ];
    body.push(para(block.number ? "Numbered" : "Normal", parts.join("")));
  }
  // The body ends with a paragraph, as Word expects after a table.
  end.forEach((line, i) => body.push(para("Closing", run(line), i === 0 ? '<w:spacing w:before="360"/>' : "")));
  if (!end.length) body.push(para("Normal", ""));
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${body.join("")}<w:sectPr><w:footnotePr><w:numFmt w:val="decimal"/></w:footnotePr><w:pgSz w:w="${pageW}" w:h="${pageH}"${landscape ? ' w:orient="landscape"' : ""}/><w:pgMar w:top="${PAGE.margin}" w:right="${PAGE.margin}" w:bottom="${PAGE.margin}" w:left="${PAGE.margin}" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const separator = (type, id, mark) => `<w:footnote w:type="${type}" w:id="${id}"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r>${mark}</w:r></w:p></w:footnote>`;
  const footnotes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes ${NS}>${separator("separator", -1, "<w:separator/>")}${separator("continuationSeparator", 0, "<w:continuationSeparator/>")}${notes.map((text, i) =>
    `<w:footnote w:id="${i + 1}">${para("FootnoteText", `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>${run(`\t${text}`)}`)}</w:footnote>`).join("")}</w:footnotes>`;
  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings ${NS}><w:autoHyphenation/><w:consecutiveHyphenLimit w:val="2"/><w:defaultTabStop w:val="425"/><w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
  const rel = (id, type, target) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel("rId1", "officeDocument", "word/document.xml")}</Relationships>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel("rId1", "styles", "styles.xml")}${rel("rId2", "settings", "settings.xml")}${rel("rId3", "footnotes", "footnotes.xml")}</Relationships>`,
    "word/document.xml": document,
    "word/styles.xml": styles(lang),
    "word/settings.xml": settings,
    "word/footnotes.xml": footnotes,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])), { level: 6, mtime: new Date("2026-01-01T00:00:00Z") });
}

// --- the folder --------------------------------------------------------------

/** A name not taken in the folder by any of the extensions: "2026-10-12 Chronologie", then "… (2)". The .md and .docx of a run share it. */
async function freeBase(folder, base, extensions) {
  for (let n = 1; n < 1000; n++) {
    const name = `${base}${n === 1 ? "" : ` (${n})`}`;
    if (!(await Promise.all(extensions.map(ext => exists(join(folder, name + ext))))).some(Boolean)) return name;
  }
  return `${base} ${Date.now()}`;
}

/** A question to the files as an outline: the question, then each answer with its sources as a footnote. */
function sourceChat(run) {
  const claims = new Map(run.result.claims.map(c => [c.id, c]));
  return { kind: "outline", blocks: [
    ...(run.question ? [{ heading: `«${run.question}»` }] : []),
    ...run.result.rows.map(row => ({ text: claimPlain(claims.get(row.answer)) || "–", note: sources(claims.get(row.answer)) })),
  ] };
}

/** A verified run as a Word document, in the layout the Word pane inserts. A statement not verified at its source says so, as in the Markdown. */
export function resultDocx(run, view, lang) {
  return inLanguage(lang, () => {
    const marked = { ...run, result: { ...run.result, claims: run.result.claims.map(c => verified(c) ? c : { ...c, display: { ...c.display, text: `[${tr("prüfen")}] ${claimPlain(c)}` } }) } };
    const spec = run.task === "source_chat" ? sourceChat(marked) : BUILD[run.task]?.(marked, view);
    if (!spec) return null;
    return wordDocument(spec, { title: label("task", run.task), subtitle: frame(run, lang), lang, closing: closing(run) });
  });
}

/**
 * The work-products folder of a case, named in the language of the
 * proceedings when it is first needed. A folder of that name that CourtOS did
 * not make (in the originals' folder, perhaps one with case documents) is
 * left alone: CourtOS takes another name.
 */
export async function productsFolder(store) {
  if (!store.case.products_dir) {
    const base = PRODUCTS_DIR[store.lang] ?? PRODUCTS_DIR.de;
    let name = base;
    for (let n = 1; await exists(join(store.work, name)); n++) name = n === 1 ? `${base} (CourtOS)` : `${base} (CourtOS ${n})`;
    // Recorded before the folder exists, so the scan and the watcher never take it for case documents.
    store.case.products_dir = name;
    await store.save();
  }
  return join(store.work, store.case.products_dir);
}

/**
 * Writes the work products of the given runs that have none yet. Each run is
 * written once: a file the judge renamed, edited or deleted stays as it is.
 * Returns the files written.
 */
export async function writeProducts(store, runs, view) {
  const manifestPath = join(store.dir, "products.json");
  const manifest = await readJson(manifestPath, {}).catch(() => ({}));
  const written = [];
  // Oldest first, so that on one day "(2)" is the later run.
  for (const run of [...runs].sort((a, b) => String(a.finished).localeCompare(String(b.finished)))) {
    if (run.status !== "succeeded" || !run.result || manifest[run.id]) continue;
    const folder = await productsFolder(store);
    const lang = runLanguage(run, store.lang);
    const base = await freeBase(folder, `${day(run)} ${labelIn(lang, "task", run.task)}`, [".md", ".docx"]);
    const files = [`${base}.md`];
    await writeAtomic(join(folder, files[0]), resultMarkdown(run, view, lang));
    const docx = resultDocx(run, view, lang);
    if (docx) { files.push(`${base}.docx`); await writeAtomic(join(folder, files[1]), docx); }
    manifest[run.id] = files;
    written.push(...files);
  }
  if (written.length) await writeJson(manifestPath, manifest);
  return written;
}
