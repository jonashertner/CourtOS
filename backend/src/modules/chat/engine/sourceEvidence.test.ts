import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contentSha256 } from "../../../lib/documentVersions";
import type { DocIndex, DocStore } from "./types";

const mocks = vi.hoisted(() => ({ load: vi.fn(), download: vi.fn(), pages: vi.fn(), access: vi.fn() }));
vi.mock("../../../lib/documentVersions", async () => ({ ...(await vi.importActual("../../../lib/documentVersions")), loadActiveVersion: mocks.load }));
vi.mock("../../../lib/storage", () => ({ downloadFile: mocks.download }));
vi.mock("../../../lib/pdfText", () => ({ readPdfPages: mocks.pages }));
vi.mock("../../../lib/access", () => ({ ensureDocAccess: mocks.access }));
import { prefetchSourceEvidence, sourceEvidencePrompt } from "./sourceEvidence";
import { verifyDocumentCitationAnnotation } from "./verifyCitations";

const bytes = () => Uint8Array.from([37, 80, 68, 70]).buffer;
const index: DocIndex = { "doc-0": { document_id: "document-a", filename: "sources.pdf", version_id: "version-a", version_number: 1 } };
const store: DocStore = new Map([["doc-0", { storage_path: "a.pdf", file_type: "pdf", filename: "sources.pdf" }]]);
const db = { from: () => { const q = { select: () => q, eq: () => q, single: async () => ({ data: { id: "document-a", user_id: "user-a", status: "ready" } }) }; return q; } } as never;
const fixturePages = [
  "Party A alleges CHF 12500 paid on 5 September 2026.",
  "Beilage 1 is a draft dated 7 September 2026 for CHF 1250.",
  "No receipt or bank confirmation of payment is in the selected material.",
];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({ id: "version-a", storage_path: "a.pdf", filename: "sources.pdf", file_type: "pdf", version_number: 1, size_bytes: 4, content_sha256: contentSha256(bytes()) });
  mocks.download.mockImplementation(async () => bytes());
  mocks.access.mockResolvedValue({ ok: true });
  mocks.pages.mockResolvedValue(fixturePages.map((text, i) => ({ page: i + 1, totalPages: 3, truncated: false, empty: false, text: `[Page ${i + 1}]\n${text}` })));
});
afterEach(() => vi.unstubAllEnvs());
const load = () => prefetchSourceEvidence(store, index, db, "user-a");
const annotation = (page: number | string, quote: string) => ({ kind: "document", doc_id: "doc-0", document_id: "document-a", version_id: "version-a", quotes: [{ page, quote }] });

describe("complete source admission and fixed-page verification", () => {
  it("loads all three actual pages before prompting and binds version/file/page hashes", async () => {
    const sources = await load();
    expect(mocks.load).toHaveBeenCalledWith("document-a", db, "version-a");
    const source = sources.get("doc-0")!;
    expect(source.pages.map((p) => p.text)).toEqual(fixturePages);
    expect(source.pages.every((p) => /^[a-f0-9]{64}$/.test(p.sha256))).toBe(true);
    const prompt = JSON.parse(sourceEvidencePrompt(sources));
    expect(prompt.documents[0].pages).toHaveLength(3);
    expect(prompt.coverage).toBe("complete_extracted_text_of_selected_versions");
    const result = await verifyDocumentCitationAnnotation(annotation(2, "CHF 1250"), async () => source) as { verified: boolean; quotes: { verification: object }[] };
    expect(result.verified).toBe(true);
    expect(result.quotes[0].verification).toMatchObject({ version_id: "version-a", pdf_sha256: source.pdf_sha256, page_hashes: [{ page: 2, sha256: source.pages[1].sha256 }] });
  });
  it.each([1, 0, 4, "2garbage"])("never verifies text found elsewhere for claimed page %s", async (page) => {
    const source = (await load()).get("doc-0")!;
    const result = await verifyDocumentCitationAnnotation(annotation(page, "CHF 1250."), async () => source) as { verified: boolean };
    expect(result.verified).toBe(false);
  });
  it("rejects wrong version, fabricated numbers/dates and unavailable sources", async () => {
    const source = (await load()).get("doc-0")!;
    for (const [ann, data] of [
      [{ ...annotation(2, "CHF 1250"), version_id: "another-version" }, source],
      [annotation(1, "CHF 12000 paid on 20 August 2023"), source],
      [annotation(2, "CHF 1250"), null],
    ] as const) expect(await verifyDocumentCitationAnnotation(ann, async () => data)).toMatchObject({ verified: false });
  });
  it("requires each cross-page fragment on the exact consecutive page", async () => {
    const source = (await load()).get("doc-0")!;
    expect(await verifyDocumentCitationAnnotation(annotation("1-2", "5 September 2026. [[PAGE_BREAK]] Beilage 1"), async () => source)).toMatchObject({ verified: true });
    expect(await verifyDocumentCitationAnnotation(annotation("1-2", "Beilage 1 [[PAGE_BREAK]] 5 September 2026."), async () => source)).toMatchObject({ verified: false });
  });
  it("does not interpret a literal page marker inside source text as another page", async () => {
    mocks.pages.mockResolvedValue([{ page: 1, totalPages: 1, empty: false, truncated: false, text: "[Page 1]\nA document says [Page 2] invented marker." }]);
    const source = (await load()).get("doc-0")!;
    expect(await verifyDocumentCitationAnnotation(annotation(2, "invented marker"), async () => source)).toMatchObject({ verified: false });
  });
  it.each(["unreadable", "truncated", "page-count"])("rejects %s coverage without a partial source set", async (kind) => {
    mocks.pages.mockResolvedValue(kind === "unreadable" ? null : [{ page: 1, totalPages: kind === "page-count" ? 3 : 1, empty: false, truncated: kind === "truncated", text: "text" }]);
    await expect(load()).rejects.toMatchObject({ code: "source_grounding_failed" });
  });
  it("counts UTF-8 bytes rather than characters and never truncates", async () => {
    mocks.pages.mockResolvedValue([{ page: 1, totalPages: 1, empty: false, truncated: false, text: "[Page 1]\n" + "ä".repeat(5001) }]);
    await expect(load()).rejects.toThrow(/10 000 UTF-8/);
  });
  it("rejects altered bytes, absent/deleted versions and loss of access before source download", async () => {
    mocks.load.mockResolvedValueOnce(null);
    await expect(load()).rejects.toMatchObject({ code: "source_grounding_failed" });
    expect(mocks.download).not.toHaveBeenCalled();
    mocks.access.mockResolvedValueOnce({ ok: false });
    await expect(load()).rejects.toMatchObject({ code: "source_grounding_failed" });
    expect(mocks.download).not.toHaveBeenCalled();
    mocks.download.mockResolvedValueOnce(Uint8Array.from([99]).buffer);
    await expect(load()).rejects.toThrow(/Fingerabdruck/);
  });
  it("rejects six documents before any file access", async () => {
    const many = new Map([...Array(6)].map((_, i) => [`doc-${i}`, store.get("doc-0")!]));
    await expect(prefetchSourceEvidence(many, index, db, "user-a")).rejects.toThrow(/höchstens fünf/);
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("does not label a derived DOCX rendition as an original paginated source", async () => {
    mocks.load.mockResolvedValue({ id: "version-a", storage_path: "a.docx", pdf_storage_path: "a-rendered.pdf", filename: "a.docx", file_type: "docx", content_sha256: contentSha256(bytes()) });
    await expect(load()).rejects.toThrow(/ursprüngliche PDF/);
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
