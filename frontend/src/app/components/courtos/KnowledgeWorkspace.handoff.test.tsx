// @vitest-environment-options {"url":"https://court.example.org/research"}
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeWorkspace } from "./KnowledgeWorkspace";
import { emptyResearchState, ResearchHandoffProvider } from "./ResearchHandoffContext";
import { ResearchContinuation } from "./ResearchHandoffControls";
import { storeResearchHandoffReference } from "@/app/lib/researchHandoff";
const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), ack: vi.fn(), list: vi.fn(), path: vi.fn(), document: vi.fn(), local: vi.fn(), public: vi.fn(), detail: vi.fn(), read: vi.fn(), insert: vi.fn() }));
vi.mock("@/app/lib/researchHandoff", async original => ({ ...(await original<typeof import("@/app/lib/researchHandoff")>()), getResearchHandoff: api.get, updateResearchHandoff: api.update, acknowledgeResearchHandoff: api.ack }));
vi.mock("@/app/lib/wordResearchHost", async original => ({ ...(await original<typeof import("@/app/lib/wordResearchHost")>()), getWordResearchDocumentScope: async () => "a".repeat(64) }));
vi.mock("@/app/lib/researchModelPreference", () => ({ useResearchModelPreference: () => ({ model: "gemma" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/app/lib/mikeApi", () => ({ getLibraryFolderPath: api.path, getDocument: api.document, searchLibraryDocuments: api.list, getLibrary: (...args: unknown[]) => api.list(...args), getLibraryFolderChildren: (...args: unknown[]) => api.list(...args) }));
vi.mock("@/app/lib/knowledgeApi", async original => ({ ...(await original<typeof import("@/app/lib/knowledgeApi")>()), searchKnowledge: api.local, searchPublicKnowledge: api.public, getPublicDecision: api.detail }));
vi.mock("./ResearchConversation", () => ({ ResearchConversation: (props: { candidate: unknown }) => <div data-testid="research-conversation" data-sources={JSON.stringify(props.candidate)}><textarea id="research-question" aria-label="Ihre Frage an die Quellen" /></div> }));
vi.mock("next/dynamic", () => ({ default: () => (props: { document: { document_id: string; version_id: string; quotes: { target: { page: number } }[] } }) => <div data-testid="source-viewer" data-version={props.document.version_id} data-page={props.document.quotes[0]?.target.page} /> }));
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerDocument = "11111111-1111-4111-8111-111111111111", version = "22222222-2222-4222-8222-222222222222";
const quote = "Der genaue öffentliche Wortlaut.";
const decision = { decision_id: "WORD_CASE", title: "Geprüfte Quelle", court: null, canton: null, docket_number: null, decision_date: null, language: "de", source_url: "https://example.org/case", pdf_url: null, snippet: quote, content_hash: "source-hash", scraped_at: null };
const detail = { ...decision, passage: { start: 0, end: Array.from(quote).length, total_chars: Array.from(quote).length, has_more: false, text: quote } };
const publicState = () => { const s = emptyResearchState(); s.public = { query: "rechtliches Gehör", submitted: "rechtliches Gehör", language: "de", result: { results: [decision], query_mode: "opencaselaw_ai", database_generation: null }, source: { decision, start: 0, history: [], excerpt: { start: 0, end: Array.from(quote).length, total_chars: Array.from(quote).length, text: quote } } }; return s; };
const metadata = { id, revision: 1, expires_at: new Date(Date.now() + 7200000).toISOString(), direction: "to_browser" as const, acknowledged_revision: 0 };
beforeEach(() => {
    vi.clearAllMocks(); api.document.mockRejectedValue(new Error("unavailable")); api.path.mockRejectedValue(new Error("unavailable")); sessionStorage.clear(); history.replaceState(null, "", `/research?handoff=${id}`);
    api.get.mockResolvedValue({ ...metadata, state: publicState() }); api.detail.mockResolvedValue(detail);
    api.update.mockResolvedValue({ ...metadata, revision: 2, direction: "to_word" }); api.ack.mockResolvedValue(metadata);
    api.list.mockResolvedValue({ documents: [], documentsHasMore: false });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
});
const browser = () => <ResearchHandoffProvider ownerId="owner" inWord={false}><ResearchContinuation /><KnowledgeWorkspace /></ResearchHandoffProvider>;
describe("restored source research", () => {
    it("restores query, language, results and selected source without repeating search; detail is freshly checked", async () => {
        render(browser());
        await waitFor(() => expect(screen.getByLabelText("Suchbegriffe oder Entscheidnummer")).toHaveValue("rechtliches Gehör"));
        expect(screen.getByLabelText("Sprache")).toHaveValue("de");
        const dialog = await screen.findByRole("dialog");
        await within(dialog).findByRole("button", { name: "Textstelle und Quelle kopieren" });
        expect(api.detail).toHaveBeenCalledExactlyOnceWith("WORD_CASE", 0, expect.any(AbortSignal));
        expect(api.public).not.toHaveBeenCalled(); expect(api.local).not.toHaveBeenCalled();
        expect(api.read).not.toHaveBeenCalled(); expect(api.insert).not.toHaveBeenCalled();
        expect(within(dialog).getByRole("button", { name: "In Word fortsetzen" })).toBeEnabled();
    });
    it("does not enable an old excerpt when the fresh source hash changed", async () => {
        api.detail.mockResolvedValue({ ...detail, content_hash: "changed-hash" }); render(browser());
        const dialog = await screen.findByRole("dialog");
        expect(await within(dialog).findByRole("alert")).toHaveTextContent("Textstelle konnte nicht bestätigt werden");
        expect(within(dialog).queryByRole("button", { name: "Textstelle und Quelle kopieren" })).toBeNull();
        expect(within(dialog).queryByRole("button", { name: "In Word einfügen" })).toBeNull();
        expect(api.public).not.toHaveBeenCalled();
    });
    it("retains the selected public source for the conversation when closing its reader, without full detail body", async () => {
        const user = userEvent.setup(); render(browser());
        const dialog = await screen.findByRole("dialog"); await within(dialog).findByRole("button", { name: "Textstelle und Quelle kopieren" });
        await user.click(within(dialog).getByRole("button", { name: "Quelle schliessen" }));
        await user.click(screen.getByRole("button", { name: "Eigene Quellen" }));
        await user.click(screen.getByRole("button", { name: "In Word fortsetzen" }));
        await waitFor(() => expect(api.update).toHaveBeenCalledOnce());
        const snapshot = api.update.mock.calls[0][2];
        expect(snapshot.mode).toBe("private"); expect(snapshot.public.source.excerpt.text).toBe(quote);
        expect(snapshot.public.result.results[0]).not.toHaveProperty("passage");
        expect(api.public).not.toHaveBeenCalled();
    });
    it.each(["private","public"] as const)("restores both explicit source types in %s view without search, insertion or model calls",async(mode)=>{
        const s=publicState();s.mode=mode;
        s.private.selected=[{id:ownerDocument,filename:"Eingabe.pdf",file_type:"pdf",active_version_id:version,active_version_number:2,size_bytes:1000}];
        api.get.mockResolvedValue({...metadata,state:s});render(browser());
        const expected={files:[{document_id:ownerDocument,version_id:version,version_number:2,filename:"Eingabe.pdf"}],public_sources:[{decision_id:decision.decision_id,start:0,end:Array.from(quote).length,content_hash:decision.content_hash}]};
        await waitFor(()=>expect(JSON.parse(screen.getByTestId("research-conversation").getAttribute("data-sources")!)).toEqual(expected));
        expect(api.public).not.toHaveBeenCalled();expect(api.local).not.toHaveBeenCalled();expect(api.insert).not.toHaveBeenCalled();expect(api.read).not.toHaveBeenCalled();
    });
    it("restores server-revalidated private hits with exact version/page and no automatic search or insertion", async () => {
        history.replaceState(null, "", "/word/research");
        const s = emptyResearchState(); s.mode = "private";
        const hit = { document_id: ownerDocument, version_id: version, version_number: 2, filename: "Eingabe.pdf", page: 7, quote: "Exakte Stelle aus dem gespeicherten Seitenindex.", score: 1 };
        s.private = { query: "Frist", submitted: "Frist", selected: [{ id: ownerDocument, filename: hit.filename, file_type: "pdf", active_version_id: version, active_version_number: 2, size_bytes: 1000 }], result: { results: [hit], documents: [{ document_id: ownerDocument, version_id: version, index_status: "ready", indexed_pages: 8, total_pages: 8 }], notices: [] }, source: hit };
        api.get.mockResolvedValue({ ...metadata, state: s });
        storeResearchHandoffReference("owner", { ...metadata, host: "word" }, "a".repeat(64));
        const host = { kind: "word" as const, readSelection: api.read, insertTextAfterSelection: vi.fn(), insertCitationAfterSelection: api.insert };
        render(<ResearchHandoffProvider ownerId="owner" inWord><KnowledgeWorkspace wordHost={host} /></ResearchHandoffProvider>);
        await waitFor(() => expect(screen.getByLabelText("Suchbegriffe")).toHaveValue("Frist"));
        expect(screen.getByTestId("source-viewer")).toHaveAttribute("data-version", version);
        expect(screen.getByTestId("source-viewer")).toHaveAttribute("data-page", "7");
        expect(api.local).not.toHaveBeenCalled(); expect(api.read).not.toHaveBeenCalled(); expect(api.insert).not.toHaveBeenCalled();
        // The library listing loads after the restored query renders.
        await waitFor(() => expect(api.list).toHaveBeenCalledOnce());
        await act(async () => {});
    });
});
