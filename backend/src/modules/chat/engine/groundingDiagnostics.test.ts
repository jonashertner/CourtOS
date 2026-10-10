import { describe, expect, it } from "vitest";
import { groundingDiagnostics } from "./groundingDiagnostics";

describe("text-free grounding diagnostics", () => {
  it("distinguishes absent markers, missing block and malformed JSON", () => {
    expect(groundingDiagnostics([], [], { hasBlock: false, error: null })).toMatchObject({ reason: "no_references", citation_block: "missing" });
    expect(groundingDiagnostics([1], [], { hasBlock: true, error: "PRIVATE JSON TEXT" })).toMatchObject({ reason: "no_citations", citation_block: "invalid", reference_count: 1 });
  });
  it("counts verified citations and identifies wrong-page matching without any quotation", () => {
    const diagnostics = groundingDiagnostics([1, 2], [
      { ref: 1, verified: true, filename: "PRIVATE.pdf" },
      { ref: 2, verified: false, doc_id: "PRIVATE-ID", quotes: [{ page: 2, quote: "PRIVATE TEXT", verification: { failure_reason: "quote_not_found_on_page" } }] },
    ], { hasBlock: true, error: null });
    expect(diagnostics).toMatchObject({ reason: "unverified_citation", verified_count: 1, failures: [{ ref: 2, page: 2, reason: "quote_not_found_on_page" }] });
    expect(JSON.stringify(diagnostics)).not.toContain("PRIVATE");
  });
  it("allows only bounded numeric page/ref and enumerated reasons", () => {
    const bad = { ref: "PRIVATE", page: "SECRET PAGE TEXT", quote: "PRIVATE", verification: { failure_reason: "SECRET REASON" } };
    const diagnostics = groundingDiagnostics([1], Array(20).fill({ ...bad, quotes: [bad] }), { hasBlock: true, error: null });
    expect(diagnostics.failures).toHaveLength(3);
    expect(JSON.stringify(diagnostics)).not.toMatch(/PRIVATE|SECRET/);
  });
});
