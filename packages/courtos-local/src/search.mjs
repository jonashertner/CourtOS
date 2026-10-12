// Lexical search over the sanitised mirror only (BM25 with prefix matching).
// Exact names, amounts, dates and statute references matter in court files,
// so lexical retrieval is the dependable baseline.

const tokenize = (text) => (text.toLocaleLowerCase("de").normalize("NFKC").match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*[\p{L}\p{N}]|[\p{L}\p{N}]/gu) ?? [])
  .map(t => t.replace(/[.'’-]+$/u, ""));

export function buildIndex(mirror) {
  const docs = [];
  for (const document of mirror.documents) for (const page of document.pages) {
    if (!page.section) continue;
    const tokens = tokenize(page.text);
    const tf = new Map();
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
    docs.push({ section: page.section, document: document.id, label: document.label, page: page.n, page_label: page.label, text: page.text, length: tokens.length, tf });
  }
  const df = new Map();
  for (const doc of docs) for (const token of doc.tf.keys()) df.set(token, (df.get(token) ?? 0) + 1);
  const avg = docs.reduce((n, d) => n + d.length, 0) / Math.max(docs.length, 1);
  const vocabulary = [...df.keys()];
  return { docs, df, avg, vocabulary };
}

function snippet(text, terms, radius = 160) {
  // Slice by codepoints so an emoji or other astral character is never split.
  const chars = Array.from(text);
  const lower = chars.map(c => c.toLocaleLowerCase("de"));
  const joined = lower.join("");
  let best = -1;
  for (const term of terms) { const at = joined.indexOf(term); if (at >= 0 && (best < 0 || at < best)) best = at; }
  const point = best < 0 ? 0 : Array.from(joined.slice(0, best)).length;
  const from = Math.max(0, point - radius), to = Math.min(chars.length, point + radius);
  return (from ? "…" : "") + chars.slice(from, to).join("") + (to < chars.length ? "…" : "");
}

export function search(index, query, { documents = null, limit = 10 } = {}) {
  const terms = [...new Set(tokenize(query))].filter(t => t.length > 1 || /\d/.test(t));
  if (!terms.length) return [];
  const k1 = 1.4, b = 0.75, n = index.docs.length;
  // Prefix expansion helps German compounds and inflection ("Rüge" → "Rügefrist").
  const expanded = new Map(terms.map(term => [term, term.length >= 4 ? index.vocabulary.filter(v => v.startsWith(term)) : [term]]));
  const scored = [];
  for (const doc of index.docs) {
    if (documents && !documents.includes(doc.document)) continue;
    let score = 0;
    for (const [term, variants] of expanded) {
      let best = 0;
      for (const variant of variants) {
        const f = doc.tf.get(variant);
        if (!f) continue;
        const idf = Math.log(1 + (n - index.df.get(variant) + 0.5) / (index.df.get(variant) + 0.5));
        const weight = variant === term ? 1 : 0.7;
        best = Math.max(best, weight * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * doc.length / index.avg)));
      }
      score += best;
    }
    if (score > 0) scored.push({ score, doc });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ score, doc }) => ({
    section: doc.section, document: doc.document, label: doc.label, page: doc.page, page_label: doc.page_label,
    score: Math.round(score * 100) / 100, snippet: snippet(doc.text, terms),
  }));
}
