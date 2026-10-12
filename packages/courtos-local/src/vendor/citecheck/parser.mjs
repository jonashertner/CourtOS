// Finds case references in prose and reads their parts. A port of the OpenCaseLaw
// research client (opencaselaw_cli/documents.py and references.py in
// github.com/jonashertner/opencaselaw); tests/parity.test.mjs runs both on the
// same paragraphs.
//
// The parser never composes a citation. It reports what the draft says: the
// label, the Erwägung, the pages, the date and the court named before the label.
import { normaliseText } from './keys.mjs';

const MONTHS = {
  januar: 1, 'jänner': 1, februar: 2, 'märz': 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8,
  september: 9, oktober: 10, november: 11, dezember: 12,
  janvier: 1, 'février': 2, fevrier: 2, mars: 3, avril: 4, juin: 6, juillet: 7, 'août': 8, aout: 8,
  septembre: 9, octobre: 10, novembre: 11, 'décembre': 12, decembre: 12,
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9,
  ottobre: 10, dicembre: 12,
  january: 1, february: 2, march: 3, may: 5, june: 6, july: 7, october: 10, december: 12,
};

// ── finding references in a paragraph ─────────────────────────────────────
const PIN = String.raw`(?:,?\s*(?:E\.|Erw\.|consid\.|cons\.|c\.)\s*\d+(?:\.\d+)*[a-z]{0,2}(?:\/[a-z]{1,2})?)?`;
const PAGE = String.raw`(?:,?\s*(?:S\.|p\.|pag\.)\s*\d{1,4}(?:\s*(?:ff?\.|ss?\.))?)?`;
const DATE = String.raw`(?:\s+(?:vom|du|del|de|of)\s+(?:\d{1,2}(?:\.|er)?\s*[A-Za-zÀ-ÿ]+\s+\d{4}|\d{1,2}\.\d{1,2}\.\d{4}))?`;
const COURT_PREFIX = String.raw`(?:(?:Urteil(?:\s+des)?\s+(?:Bundesgerichts|Bundesverwaltungsgerichts|Bundesstrafgerichts|BGer|BVGer|BStGer)|` +
  String.raw`arrêt\s+du\s+(?:Tribunal\s+fédéral|Tribunal\s+administratif\s+fédéral|TF|TAF)|sentenza\s+del\s+(?:Tribunale\s+federale|TF)|` +
  String.raw`BGer|BVGer|BStGer|TF|TAF|TPF)\s+)?`;
const CANTONAL_COURT = String.raw`(?:Ober|Kantons|Verwaltungs|Handels|Bezirks|Appellations|Sozialversicherungs|Steuerrekurs)gericht(?:s)?|` +
  String.raw`Tribunal\s+cantonal|Cour\s+de\s+justice|Tribunale\s+(?:d'appello|cantonale)|OGer|KGer|VGer|Gericht|Tribunal|Kantonsgerichts`;
const CANTONAL_DOCKET = String.raw`(?:[A-Z]{1,6}\.\d{4}\.\d{1,6}|[A-Z]{2}\d{6}(?:-[A-Z](?:_U\d+)?)?|[A-Za-zÀ-ÿ]{1,8} ?\/ ?\d{1,6} ?\/ ?\d{1,6}|` +
  String.raw`[A-Z]{1,3} \d{4}\/\d{1,4}|\d{3} \d{2} \d{1,4}|[A-Z]{2,4}\d? (?:19|20)\d{2} \d{1,4}|[A-Za-z]{2,6} \d{4}(?:\/\d{2,4})? Nr\. \d{1,5})`;

const FIND = [
  new RegExp(String.raw`(?<![A-Za-z0-9])(?:BGE|ATF|DTF)\s?\d{1,3}\s(?:Ia|Ib|III|II|IV|I|V)\s\d{1,4}` + PIN + PAGE, 'g'),
  new RegExp(String.raw`(?<![A-Za-z0-9\/])` + COURT_PREFIX + String.raw`(?:\d[A-Z]{1,2}[ _.]\d{1,5}\/\d{4}|[A-Z]{1,2}-\d{1,5}\/\d{4})(?![0-9\/])` + DATE + PIN, 'g'),
  new RegExp(String.raw`(?<![A-Za-z0-9])(?:(?:Urteil|Entscheid|Beschluss|arrêt|décision|sentenza)\s+(?:des|der|du|de\s+la|del|della)?\s*)?(?:` +
    CANTONAL_COURT + String.raw`)(?:St\.\s?|[^\n.;()«»]){0,40}?(` + CANTONAL_DOCKET + ')' + DATE + PIN, 'g'),
];

// Docket-like strings and collection labels the finder does not read. Those the
// cite list knows are checked after all; the rest are listed as not checked.
const LOOSE = [
  /(?<![A-Za-z0-9])[A-Z]{1,6}\.\d{4}\.\d{1,6}(?:-[A-Z0-9]+)?(?![A-Za-z0-9])/g,
  /(?<![A-Za-z0-9])[A-Z]{1,3}[ _.]?(?:\d{1,5}\/\d{4}|\d{4}\/\d{1,4})(?![0-9\/])/g,
  /(?<![A-Za-z0-9])[A-Z]{2}\d{6}(?:-[A-Z](?:_U\d+)?)?(?![A-Za-z0-9])/g,
  // "123 45 67" is also how a phone number ends: not after another group of digits,
  // "+41", "Tel." or "Postfach".
  /(?<![0-9.])(?<!\d[ \u00a0])(?<!(?:\+\d{2}|[Tt]el\.?|[Tt]elefon|[Tt]éléphone|[Tt]elefono|[Ff]ax|[Nn]atel|[Mm]obile?|[Pp]ostfach|[Cc]ase postale|[Cc]asella postale):?[ \u00a0]?)\d{3} \d{2} \d{1,4}(?![0-9])/g,
  /(?<![A-Za-z0-9])[A-Za-zÀ-ÿ]{1,8}\/\d{1,6}\/\d{1,6}(?![0-9])/g,
  /(?<![A-Za-z])(?:ZR|Pra|GVP|BVR|RBOG|SJZ|AJP|JdT|SJ|RDAF)\s+\d{1,4}(?:\/\d{2,4})?(?:\s+(?:I{1,3}|IV)(?:\s+\d{1,5})?)?(?:\s*(?:Nr\.|n°|no\.|N)\s*\d{1,5})?(?![0-9])/g,
];
const COLLECTION = /^(?:ZR|Pra|GVP|BVR|RBOG|SJZ|AJP|JdT|SJ|RDAF)\s/;

function nonOverlapping(spans) {
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  let lastEnd = -1;
  for (const s of spans) {
    if (s.start < lastEnd) continue;
    kept.push(s);
    lastEnd = s.end;
  }
  return kept;
}

// Every occurrence, in document order: {text, paragraph (0-based), start, end}.
export function findCitations(paragraphs) {
  const found = [];
  paragraphs.forEach((raw, index) => {
    const paragraph = normaliseText(raw);
    const spans = [];
    for (const pattern of FIND) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(paragraph)) !== null) {
        const text = m[0].replace(/[\s,;]+$/, '');
        spans.push({ start: m.index, end: m.index + text.length, text: raw.slice(m.index, m.index + text.length) });
        if (m[0].length === 0) pattern.lastIndex++;
      }
    }
    for (const s of nonOverlapping(spans)) {
      const parsed = parseReference(s.text);
      if (!parsed.bge && !parsed.dockets.length) continue;
      found.push({ ...s, paragraph: index, parsed });
    }
  });
  return found;
}

// Citation-like strings outside every found reference: {text, paragraph, start, end, collection}.
export function findLoose(paragraphs, found) {
  const out = [];
  paragraphs.forEach((raw, index) => {
    const paragraph = normaliseText(raw);
    const taken = found.filter((f) => f.paragraph === index);
    const spans = [];
    for (const pattern of LOOSE) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(paragraph)) !== null) {
        spans.push({ start: m.index, end: m.index + m[0].length, text: raw.slice(m.index, m.index + m[0].length) });
      }
    }
    for (const s of nonOverlapping(spans)) {
      if (taken.some((t) => s.start < t.end && s.end > t.start)) continue;
      out.push({ ...s, paragraph: index, collection: COLLECTION.test(normaliseText(s.text)) });
    }
  });
  return out;
}

// ── reading one reference ─────────────────────────────────────────────────
const MARK = String.raw`(?:[Ee]\.|[Ee]rw\.|[Ee]rwägung|[Ee]rwaegung|[Cc]onsid\.|[Cc]onsid|[Cc]ons\.|[Cc]onsiderando|c\.)`;
const PINPOINT_INLINE = new RegExp(String.raw`(?:(?<=[\s,;(])|^)` + MARK + String.raw`\s*(\d+(?:\.\d+)*(?:[a-z]{1,2})?(?:\/[a-z]{1,2})*)(?:\s*(?:ff?\.|ss?\.))?`);
const PAGE_REF = /(?:(?<=[\s,;(])|^)(?:S\.|SS\.|p\.|pp\.|pag\.|pagg\.)\s*(\d{1,5})(?:\s*(?:ff?\.|ss?\.))?/g;
const DATE_WORD = /(?<![\d\/.])(\d{1,2})(?:\.|er|re|º|°)?\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})(?![\d\/])/g;
const DATE_NUM = /(?<![\d\/.])(\d{1,2})\.[ \u00a0\u202f]?(\d{1,2})\.[ \u00a0\u202f]?(\d{4})(?![\d\/])/g;     // also "6. 4. 2013"
const BGE = /(?<![A-Za-z0-9])(BGE|ATF|DTF)\s*(\d{1,3})\s+(Ia|Ib|III|II|IV|I|V)\s+(\d{1,4})(?![0-9])/;
const FEDERAL = /(?<![A-Za-z0-9])(\d[A-Z]{1,2})[ _.](\d{1,5})\/(\d{4})(?![0-9])/g;
const DOCKET_SHAPES = [
  FEDERAL,
  /(?<![A-Za-z0-9])([A-Z]{1,2}-\d{1,5}\/\d{4})(?![0-9])/g,
  /(?<![A-Za-z0-9])([A-Z]{1,6}\.\d{4}\.\d{1,6}(?:-[A-Z0-9]+)?)(?![A-Za-z0-9])/g,
  /(?<![A-Za-z0-9])([A-Z]{2}\d{6}(?:-[A-Z](?:_U\d+)?)?)(?![A-Za-z0-9])/g,
  /(?<![A-Za-z0-9])([A-Za-z]{2,6} \d{4}(?:\/\d{2,4})? Nr\. \d{1,5})(?![0-9])/g,
  /(?<![A-Za-z0-9])([A-Za-zÀ-ÿ]{1,8} ?\/ ?\d{1,6} ?\/ ?\d{1,6})(?![0-9])/g,
  /(?<![A-Za-z0-9])([A-Z]{1,3} \d{4}\/\d{1,4}|\d{3} \d{2} \d{1,4}|[A-Z]{2,4}\d? (?:19|20)\d{2} \d{1,4}|ZK \d{2} \d{1,4})(?![0-9])/g,
  /(?<![A-Za-z0-9\/._-])(\d{1,5}\/\d{4})(?![0-9\/])/g,
];
const FEDERAL_COURT = /(?<![A-Za-z_])(?:BGer|BGE|ATF|DTF|TF|Bundesgericht(?:s|es)?|Tribunal f[ée]d[ée]ral|Tribunale federale|Federal Supreme Court)(?![A-Za-z_])/;
const BVGER_COURT = /(?<![A-Za-z_])(?:BVGer|BVGE|TAF|Bundesverwaltungsgericht(?:s|es)?|Tribunal administratif f[ée]d[ée]ral|Tribunale amministrativo federale)(?![A-Za-z_])/;
const BSTGER_COURT = /(?<![A-Za-z_])(?:BStGer|TPF|Bundesstrafgericht(?:s|es)?|Tribunal p[ée]nal f[ée]d[ée]ral|Tribunale penale federale)(?![A-Za-z_])/;
const COURT_CODE_CONTEXT = new RegExp(
  String.raw`(?:gericht\w*|Gericht\w*|Tribunal\w*|Tribunale|Cour|Corte|Chambre|OGer|KGer|VGer|SozVGer|Kanton|canton|Kantons)\s+` +
  String.raw`(?:(?:des|de|du|di|del|della|Kantons|cantonal|cantonale|administratif|administrative|civile|pénale|penale|supérieur|supérieure|of)\s+){0,2}` +
  String.raw`(AG|AI|AR|BE|BL|BS|FR|GE|GL|GR|JU|LU|NE|NW|OW|SG|SH|SO|SZ|TG|TI|UR|VD|VS|ZG|ZH)(?![A-Za-z_])`);
const CANTON_NAMES = {
  'zürich': 'ZH', zurich: 'ZH', zurigo: 'ZH', bern: 'BE', berne: 'BE', berna: 'BE', 'genève': 'GE', geneve: 'GE',
  genf: 'GE', geneva: 'GE', ginevra: 'GE', vaud: 'VD', vaudois: 'VD', vaudoise: 'VD', waadt: 'VD',
  aargau: 'AG', argovie: 'AG', 'basel-stadt': 'BS', 'bâle-ville': 'BS', 'basel-landschaft': 'BL', baselland: 'BL',
  'bâle-campagne': 'BL', luzern: 'LU', lucerne: 'LU', lucerna: 'LU', 'st. gallen': 'SG', 'st.gallen': 'SG',
  'saint-gall': 'SG', 'san gallo': 'SG', tessin: 'TI', ticino: 'TI', wallis: 'VS', valais: 'VS',
  vallese: 'VS', 'neuchâtel': 'NE', neuchatel: 'NE', neuenburg: 'NE', fribourg: 'FR', freiburg: 'FR',
  friburgo: 'FR', solothurn: 'SO', soleure: 'SO', thurgau: 'TG', thurgovie: 'TG', 'graubünden': 'GR',
  grisons: 'GR', grigioni: 'GR', schaffhausen: 'SH', schaffhouse: 'SH', zug: 'ZG', zoug: 'ZG',
  schwyz: 'SZ', jura: 'JU', glarus: 'GL', glaris: 'GL', uri: 'UR', nidwalden: 'NW', obwalden: 'OW',
};

function isoDate(day, month, year) {
  const d = Number(day);
  const y = Number(year);
  const m = /^\d+$/.test(month) ? Number(month) : MONTHS[String(month).toLowerCase().replace(/\.$/, '')];
  if (!m || d < 1 || d > 31 || m < 1 || m > 12) return null;
  // A day the month does not have: 31 April, 29 February 2013.
  if (new Date(Date.UTC(y, m - 1, d)).getUTCDate() !== d) return null;
  return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseReference(written) {
  let core = normaliseText(written).trim();
  let pinpoint = null;
  const pin = PINPOINT_INLINE.exec(core);
  if (pin) {
    pinpoint = pin[1].toLowerCase();
    core = (core.slice(0, pin.index) + ' ' + core.slice(pin.index + pin[0].length)).trim();
  }
  const pages = [];
  core = core.replace(PAGE_REF, (all, page) => { pages.push(Number(page)); return ' '; });
  core = core.replace(/\s+/g, ' ').replace(/^[\s,;:(]+/, '').replace(/[\s.,;:]+$/, '');

  let date = null;
  let dateInvalid = null;        // a date written as a date that the calendar does not have
  for (const pattern of [DATE_WORD, DATE_NUM]) {
    pattern.lastIndex = 0;
    let m;
    while (!date && (m = pattern.exec(core)) !== null) {
      date = isoDate(m[1], m[2], m[3]);
      if (!date && !dateInvalid && isoDate(1, m[2], m[3]) && Number(m[1]) >= 1 && Number(m[1]) <= 31) dateInvalid = m[0];
    }
    if (date) break;
  }

  const b = BGE.exec(core);
  const bge = b ? { collection: b[1], volume: Number(b[2]), part: b[3], page: Number(b[4]) } : null;
  const scan = b ? core.slice(0, b.index) + ' '.repeat(b[0].length) + core.slice(b.index + b[0].length) : core;

  const spans = [];
  for (const shape of DOCKET_SHAPES) {
    shape.lastIndex = 0;
    let m;
    while ((m = shape.exec(scan)) !== null) {
      const text = (shape === FEDERAL ? m[0] : m[1]).trim();
      const start = m.index + m[0].indexOf(text);
      spans.push({ start, end: start + text.length, text });
    }
  }
  spans.sort((x, y) => x.start - y.start || (y.end - y.start) - (x.end - x.start));
  const dockets = [];
  const taken = [];
  for (const s of spans) {
    if (taken.some((t) => s.start < t.end && s.end > t.start)) continue;
    taken.push(s);
    const text = s.text.replace(/\s+/g, ' ');
    if (!dockets.includes(text)) dockets.push(text);
  }

  // The court is named before the label; what follows is a date, a party or a
  // cross-reference.
  const firstLabel = Math.min(...taken.map((t) => t.start), b ? b.index : Infinity, scan.length);
  let head = scan.slice(0, firstLabel);
  for (const t of taken) if (t.end <= firstLabel) head = head.slice(0, t.start) + ' '.repeat(t.end - t.start) + head.slice(t.end);
  const courts = new Set();
  if (bge) courts.add('bge');
  if (FEDERAL_COURT.test(head)) { courts.add('bger'); courts.add('bge'); }
  if (BVGER_COURT.test(head)) courts.add('bvger');
  if (BSTGER_COURT.test(head)) courts.add('bstger');

  let canton = null;
  const lowered = head.toLowerCase();
  for (const [name, code] of Object.entries(CANTON_NAMES)) {
    if (new RegExp('(?<![a-zà-ÿ])' + escapeRegExp(name) + '(?![a-zà-ÿ])').test(lowered)) { canton = code; break; }
  }
  if (!canton) {
    const code = COURT_CODE_CONTEXT.exec(head);
    if (code) canton = code[1];
  }
  const bgeFirst = Boolean(bge) && (!taken.length || b.index <= Math.min(...taken.map((t) => t.start)));
  return { written, pinpoint, pages, date, dateInvalid: date ? null : dateInvalid, bge, dockets, courts, canton, bgeFirst };
}

// "3c/aa" -> "3", "2a" -> "2"; null when the pinpoint has no lettered part.
export function pinpointParent(pinpoint) {
  const base = pinpoint.split('/', 1)[0];
  const stripped = base.replace(/[a-z]+$/, '');
  return stripped && stripped !== pinpoint ? stripped : null;
}
