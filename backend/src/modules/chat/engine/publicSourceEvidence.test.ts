import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../knowledge/knowledge.service", () => ({ publicKnowledgeRequest: request }));
import { loadPublicSourceEvidence, parsePublicSourceSelections, publicCitation, samePublicEvidence } from "./publicSourceEvidence";
const selected = { decision_id: "ow_gerichte_VVGE 1976_77 Nr. 54#1", start: 8, end: 39, content_hash: "source-hash" };
const text = "😀 Das Gericht prüft die Akten. ";
const detail = () => ({ decision_id: selected.decision_id, title: "Originaltitel", source_url: "https://example.test/original", pdf_url: null, content_hash: "source-hash", passage: { start: 8, end: 39, total_chars: 100, text } });
beforeEach(() => { vi.clearAllMocks(); request.mockResolvedValue({ ok: true, data: detail() }); });
afterEach(() => vi.unstubAllGlobals());
describe("explicit public source admission", () => {
  it("only transmits exact ID and bounded Unicode span, never query/history/client URLs", async () => {
    expect(Array.from(text)).toHaveLength(31);
    const evidence = await loadPublicSourceEvidence([selected]);
    expect(request).toHaveBeenCalledExactlyOnceWith("decision", { id: selected.decision_id, start: 8, length: 31 });
    const citation = publicCitation({ kind: "document", ref: 1, doc_id: "public-0", quotes: [{ quote: "Das Gericht prüft die Akten." }] }, evidence);
    expect(citation).toMatchObject({ kind: "public_decision", title: "Originaltitel", start: 10, end: 38, quote: "Das Gericht prüft die Akten.", verified: true });
    expect(citation).not.toHaveProperty("page");
  });
  it.each([{ decision_id: "another" }, { content_hash: "changed" }, { passage: { ...detail().passage, end: 40 } }, { source_url: "javascript:alert(1)" }])("rejects changed identity, text bounds/hash or unsafe upstream URL %o", async (patch) => {
    request.mockResolvedValue({ ok: true, data: { ...detail(), ...patch } });
    await expect(loadPublicSourceEvidence([selected])).rejects.toMatchObject({ code: "source_grounding_failed" });
  });
  it("accepts an explicitly unknown upstream hash without inventing a version and still compares later exact content", async () => {
    request.mockResolvedValue({ ok: true, data: { ...detail(), content_hash: null } });
    const a = await loadPublicSourceEvidence([{ ...selected, content_hash: null }]);
    expect(a.get("public-0")?.content_hash).toBeNull();
    const b = new Map(a); b.set("public-0", { ...b.get("public-0")!, text: text.replace("Akten", "Sache") });
    expect(samePublicEvidence(a, b)).toBe(false);
  });
  it("does not treat half an emoji as an exact Unicode quote despite JS substring matching", async () => {
    const evidence=await loadPublicSourceEvidence([selected]);
    evidence.set("public-0",{...evidence.get("public-0")!,text:"Long prefix 😀 original court passage"});
    expect(publicCitation({kind:"document",ref:1,doc_id:"public-0",quotes:[{quote:"Long prefix \uD83D"}]},evidence)?.verified).toBe(false);
    expect(publicCitation({kind:"document",ref:1,doc_id:"public-0",quotes:[{quote:"Long prefix 😀"}]},evidence)).toMatchObject({verified:true,start:8,end:21});
  });
  it.each([{ quotes: [] }, { quotes: [{ quote: "The model remembers a different legal rule." }] }, { quotes: [{ quote: "Das Gericht" }, { quote: "Akten" }] }])("does not verify absent/invented/multiple quotes %o", async ({ quotes }) => {
    const evidence = await loadPublicSourceEvidence([selected]);
    expect(publicCitation({ kind: "document", ref: 1, doc_id: "public-0", quotes }, evidence)?.verified).toBe(false);
  });
  it("rejects unknown fields, URL-shaped IDs, duplicate selections and oversized spans before retrieval", async () => {
    for (const value of [[{ ...selected, quote: "pretend evidence" }], [{ ...selected, decision_id: "https://evil.test" }], [selected, selected], [{ ...selected, end: 810 }], Array(4).fill(selected)]) {
      expect(parsePublicSourceSelections(value)).toBeNull();
      await expect(loadPublicSourceEvidence(value as never)).rejects.toMatchObject({ code: "source_grounding_failed" });
    }
    expect(request).not.toHaveBeenCalled();
  });
});
