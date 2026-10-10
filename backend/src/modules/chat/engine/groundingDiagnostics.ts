import type { SourceGroundingDiagnostics } from "@mike/contracts";

type FailureReason = SourceGroundingDiagnostics["failures"][number]["reason"];
const REASONS = new Set<FailureReason>(["source_unavailable", "version_mismatch", "document_mismatch", "invalid_page", "page_range_mismatch", "quote_not_found_on_page", "unverified", "missing_reference"]);
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const number = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 10_000 ? value : null;
function page(value: unknown): number | string | null {
  if (typeof value === "number") return number(value);
  return typeof value === "string" && /^\d{1,4}(?:\s*-\s*\d{1,4})?$/.test(value) ? value.replace(/\s/g, "") : null;
}

/** Explicit allowlist: no model text, parser messages, filenames or source IDs. */
export function groundingDiagnostics(refs: number[], citations: unknown[], parse: { hasBlock: boolean; error: string | null }): SourceGroundingDiagnostics {
  const items = citations.map(object);
  const missing = refs.filter((ref) => !items.some((item) => item.ref === ref));
  const failed = items.filter((item) => item.verified !== true);
  const failures: SourceGroundingDiagnostics["failures"] = [];
  for (const ref of missing.slice(0, 3)) failures.push({ ref: number(ref), page: null, reason: "missing_reference" });
  for (const item of failed) {
    const quotes = Array.isArray(item.quotes) ? item.quotes : [item];
    for (const raw of quotes) {
      const quote = object(raw);
      const verification = object(quote.verification);
      if (verification.verified === true) continue;
      const rawReason = verification.failure_reason;
      const reason: FailureReason = typeof rawReason === "string" && REASONS.has(rawReason as FailureReason) ? rawReason as FailureReason : "unverified";
      if (failures.length < 3) failures.push({ ref: number(item.ref), page: page(quote.page ?? item.page), reason });
    }
  }
  return {
    reason: !refs.length ? "no_references" : !items.length ? "no_citations" : missing.length ? "missing_reference" : "unverified_citation",
    reference_count: Math.min(refs.length, 10_000), citation_count: Math.min(items.length, 10_000),
    verified_count: Math.min(items.filter((item) => item.verified === true).length, 10_000),
    citation_block: !parse.hasBlock ? "missing" : parse.error ? "invalid" : "parsed", failures,
  };
}
