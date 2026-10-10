import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conversationSourceIssue } from "@/app/lib/researchConversation";
import { CourtOSLocaleProvider } from "@/app/contexts/CourtOSLocaleContext";
import { setCourtOSLocale } from "@/app/lib/courtosLocale";
import { hasCheckedCitationLocation } from "@/app/lib/citationEvidence";
import { KnowledgeWorkspace, LocalSource } from "./KnowledgeWorkspace";

const api = vi.hoisted(() => ({ list: vi.fn(), path: vi.fn(), document: vi.fn(), local: vi.fn(), public: vi.fn(), detail: vi.fn(), push: vi.fn(), handoff: vi.fn(), research: vi.fn(), conversation: null as null | { onCitation: (citation: import("@/app/components/shared/types").Citation) => void }, model: "gemma" as "gemma" | "claude-opus-5-5" }));
vi.mock("@/app/lib/researchModelPreference", () => ({ useResearchModelPreference: () => ({ model: api.model }) }));
vi.mock("@/app/lib/researchDraft", () => ({ prepareResearchDraft: api.research }));
vi.mock("@/app/lib/frontierDraft", () => ({ prepareFrontierDraft: api.handoff }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: api.push }) }));
vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "test-owner" } }) }));
vi.mock("@/app/lib/mikeApi", () => ({ getLibraryFolderPath: api.path, getDocument: api.document, searchLibraryDocuments: api.list, getLibrary: (...args: unknown[]) => api.list(...args), getLibraryFolderChildren: (...args: unknown[]) => api.list(...args) }));
vi.mock("@/app/lib/knowledgeApi", async (original) => ({ ...(await original<typeof import("@/app/lib/knowledgeApi")>()), searchKnowledge: api.local, searchPublicKnowledge: api.public, getPublicDecision: api.detail }));
vi.mock("./ResearchConversation", () => ({ ResearchConversation: (props: { candidate: unknown; onCitation: (citation: import("@/app/components/shared/types").Citation) => void }) => { api.conversation = props; return <div data-testid="research-conversation" data-sources={JSON.stringify(props.candidate)}><textarea id="research-question" aria-label="Ihre Frage an die Quellen" /></div>; } }));
vi.mock("next/dynamic", () => ({ default: () => (props: { document: { document_id: string; version_id: string; quotes: { quote: string; target: { page: number }; verification?: { verified: boolean } }[] }; canEdit: boolean; mode?: {citation?:import("@/app/components/shared/types").Citation} }) => <div data-citation={JSON.stringify(props.mode?.citation)} data-testid="source-viewer" data-document={props.document.document_id} data-version={props.document.version_id} data-editable={String(props.canEdit)} data-page={props.document.quotes[0]?.target.page} data-verified={String(props.document.quotes[0]?.verification?.verified)}>{props.document.quotes[0]?.quote}</div> }));

const document = { id: "11111111-1111-4111-8111-111111111111", filename: "Muster, Gehör, 2026.pdf", active_version_number: 2, status: "ready", current_version_id: "22222222-2222-4222-8222-222222222222" };
const hit = { document_id: document.id, version_id: "22222222-2222-4222-8222-222222222222", version_number: 2, filename: document.filename, page: 7, quote: "Die Stellungnahme ist zu prüfen. <script>kein HTML</script>", score: 1 };
async function selectPublicExcerpt(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, start = 0, end?: number) {
    const pre = within(dialog).getByLabelText("Erfasster Entscheidtext");
    const range = window.document.createRange();
    range.setStart(pre.firstChild!, start);
    range.setEnd(pre.firstChild!, end ?? pre.textContent!.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges(); selection.addRange(range);
    await user.click(within(dialog).getByRole("button", { name: "Markierte Stelle übernehmen" }));
}
beforeEach(() => {
    vi.clearAllMocks(); api.document.mockRejectedValue(new Error("unavailable")); api.path.mockRejectedValue(new Error("unavailable"));
    api.detail.mockReset(); api.public.mockReset();
    window.getSelection()?.removeAllRanges();
    api.model = "gemma";
    api.handoff.mockReturnValue(false);
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
    api.list.mockResolvedValue({ documents: [document], documentsHasMore: false });
    api.local.mockResolvedValue({ results: [hit], documents: [{ document_id: document.id, version_id: hit.version_id, index_status: "partial", indexed_pages: 8, total_pages: 12 }], notices: ["Nur ein Teil der Seiten ist erfasst."] });
    api.public.mockResolvedValue({ results: [], query_mode: "literal_terms", database_generation: "test-generation" });
});

describe("personal knowledge workspace", () => {
    it("preserves only supplied exact PDF/page hash evidence for review and citation-check originals", () => {
        const checked={...hit,source_match:"exact" as const,pdf_sha256:"a".repeat(64),page_sha256:"b".repeat(64),start:0,end:Array.from(hit.quote).length};
        const view=render(<LocalSource result={checked} onClose={()=>{}}/>);
        const citation=()=>JSON.parse(screen.getByTestId("source-viewer").getAttribute("data-citation")!);
        expect(hasCheckedCitationLocation(citation())).toBe(true);
        expect(citation().quotes[0].verification).toEqual({verified:true,version_id:hit.version_id,pdf_sha256:checked.pdf_sha256,page_hashes:[{page:hit.page,sha256:checked.page_sha256}]});
        view.rerender(<LocalSource result={hit} onClose={()=>{}}/>);
        expect(hasCheckedCitationLocation(citation())).toBe(false);expect(citation().quotes[0].verification.pdf_sha256).toBeUndefined();
        view.rerender(<LocalSource result={{...checked,end:1}} onClose={()=>{}}/>);expect(hasCheckedCitationLocation(citation())).toBe(false);
        view.rerender(<LocalSource result={{...checked,page_sha256:"unknown"}} onClose={()=>{}}/>);expect(hasCheckedCitationLocation(citation())).toBe(false);
    });
    it("keeps the known folder path on a selected source and displays authoritative paths for filename results", async () => {
        const folder = { id: "case-folder", name: "2026-001", parent_folder_id: null };
        const second = { ...document, id: "33333333-3333-4333-8333-333333333333", library_folder_id: "second-case" };
        api.document.mockImplementation(async(id:string)=>id===document.id?{...document,library_folder_id:folder.id}:second);
        api.path.mockImplementation(async(_kind:string,id:string)=>({folders:[id===folder.id?folder:{id:"second-case",name:"2026-002",parent_folder_id:null}]}));
        api.list.mockImplementation(async (_kind: string, parent: unknown) => typeof parent === "string"
            ? { documents: [document], folders: [], documentsHasMore: false }
            : (parent as {search?:string}).search ? { documents: [second], documentsHasMore: false } : { documents: [], folders: [folder], documentsHasMore: false });
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(screen.getByRole("button", { name: "Eigene Quellen" }));
        await user.click(await screen.findByRole("button", { name: folder.name }));
        await user.click(await screen.findByRole("checkbox", { name: /Muster, Gehör/ }));
        await user.type(screen.getByLabelText("Dateiname"), "Muster");
        await user.click(screen.getByRole("button", { name: "Dateinamen filtern" }));
        await user.click(await screen.findByRole("checkbox", { name: /Muster, Gehör/ }));
        const selected = screen.getByLabelText("Ausgewählte Dokumente");
        expect(await within(selected).findByText("2026-001")).toBeVisible();
        await within(selected).findByText("2026-002");
        expect(screen.getByText("Auswahl aus mehreren Hauptordnern: 2026-001; 2026-002.")).toBeVisible();
        expect(JSON.parse(screen.getByTestId("research-conversation").getAttribute("data-sources")!).files).toHaveLength(2);
        expect(api.local).not.toHaveBeenCalled(); expect(api.public).not.toHaveBeenCalled();
    });
    it("navigates case and party folders at offset zero and returns to the root", async () => {
        const folder = { id: "case-folder", name: "CourtOS-UE-2026-001" };
        const party = { id: "party-folder", name: "A.________ AG · Klägerin" };
        api.list.mockImplementation(async (_kind: string, parent: unknown) => typeof parent === "string"
            ? parent === folder.id ? { documents: [], folders: [party], documentsHasMore: false } : { documents: [document], folders: [], documentsHasMore: false }
            : { documents: [], folders: [folder], documentsHasMore: false });
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(screen.getByRole("button", { name: "Eigene Quellen" }));
        await user.click(await screen.findByRole("button", { name: folder.name }));
        await user.click(await screen.findByRole("button", { name: party.name }));
        await screen.findByRole("checkbox", { name: /Muster, Gehör/ });
        expect(api.list).toHaveBeenCalledWith("files", "case-folder", { limit: 20, offset: 0 });
        expect(api.list).toHaveBeenCalledWith("files", "party-folder", { limit: 20, offset: 0 });
        await user.click(screen.getByRole("button", { name: "Alle Akten" }));
        await waitFor(() => expect(screen.queryByRole("checkbox", { name: /Muster, Gehör/ })).toBeNull());
        expect(screen.queryByRole("button", { name: party.name })).toBeNull();
        expect(api.public).not.toHaveBeenCalled(); expect(api.local).not.toHaveBeenCalled();
    });
    it.each([false, true])("opens generated public citations at exact Unicode offsets and rejects changed wording (%s)", async changed => {
        const quote = "Dies ist der genaue belegte Wortlaut.";
        const citation = { type: "citation_data" as const, kind: "public_decision" as const, ref: 1, decision_id: "BGE_137_I_195", title: "Gespeicherter Titel", source_url: "https://example.org/original", pdf_url: null, content_hash: "hash", start: 30, end: 30 + Array.from(quote).length, quote, verified: true };
        api.detail.mockResolvedValue({ ...citation, title: "Titel aus dem Original", snippet: "", passage: { start: 30, end: 100, total_chars: 100, has_more: false, text: changed ? "Anderer Wortlaut in der Quelle." : quote + " Kontext danach." } });
        render(<KnowledgeWorkspace />);
        await act(async () => { api.conversation!.onCitation(citation); });
        const dialog = await screen.findByRole("dialog");
        await waitFor(() => expect(api.detail).toHaveBeenCalledWith(citation.decision_id, 30, expect.any(AbortSignal)));
        if (changed) { expect(await within(dialog).findByRole("alert")).toHaveTextContent(/Quelle|Fassung/); expect(within(dialog).queryByRole("button", { name: "Textstelle und Quelle kopieren" })).toBeNull(); }
        else { expect(await within(dialog).findByRole("button", { name: "Textstelle und Quelle kopieren" })).toBeEnabled(); expect(within(dialog).getByText(quote)).toBeVisible(); expect(within(dialog).getByRole("heading", { name: "Titel aus dem Original" })).toBeVisible(); }
        expect(api.public).not.toHaveBeenCalled();
    });
    it("keeps the searched terms and source text when the interface changes language",async()=>{
        localStorage.clear();setCourtOSLocale("test-owner","de");
        api.public.mockResolvedValue({results:[{decision_id:"case",court:"bger",docket_number:"1C_1/2026",title:"Titre original",snippet:"Le droit d’être entendu est garanti."}],query_mode:"literal_terms",database_generation:null});
        const user=userEvent.setup();render(<CourtOSLocaleProvider ownerId="test-owner"><KnowledgeWorkspace/></CourtOSLocaleProvider>);
        await user.type(screen.getByLabelText("Suchbegriffe oder Entscheidnummer"),"Gehör");await user.click(screen.getByRole("button",{name:"Suchen"}));
        await screen.findByText("Le droit d’être entendu est garanti.");
        for(const locale of ["fr","it","en"] as const)await act(async()=>{setCourtOSLocale("test-owner",locale);});
        expect(screen.getByRole("textbox",{name:"Search terms or decision number"})).toHaveValue("Gehör");
        expect(screen.getByText("Le droit d’être entendu est garanti.")).toBeVisible();
        expect(api.public).toHaveBeenCalledOnce();expect(api.local).not.toHaveBeenCalled();expect(api.research).not.toHaveBeenCalled();expect(api.handoff).not.toHaveBeenCalled();
    });
    it("keeps non-PDF library search available while blocking both grounded-analysis actions", async () => {
        const word = { ...document, filename: "Stellungnahme.docx", file_type: "docx", pdf_storage_path: "derived.pdf" };
        api.list.mockResolvedValue({ documents: [word], documentsHasMore: false });
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(screen.getByRole("button", { name: "Eigene Quellen" }));
        await user.click(await screen.findByRole("checkbox", { name: /Stellungnahme.docx/ }));
        await user.type(screen.getByLabelText("Suchbegriffe"), "Stellungnahme");
        expect(conversationSourceIssue(JSON.parse(screen.getByTestId("research-conversation").getAttribute("data-sources")!))).toBe("unready");
        expect(screen.getByRole("button", { name: "Auswahl durchsuchen" })).toBeEnabled();
        await user.click(screen.getByRole("button", { name: "Auswahl durchsuchen" }));
        expect(api.local).toHaveBeenCalledWith("Stellungnahme", [word.id], expect.any(AbortSignal));
        expect(api.push).not.toHaveBeenCalled();
    });
    it("keeps private search and its optional Gemma draft on the server route despite an external model preference", async () => {
        api.model = "claude-opus-5-5";
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(screen.getByRole("button", { name: "Eigene Quellen" }));
        const searchLocation = screen.getByText("Textsuche ohne KI · Verarbeitung auf dem Server").closest("[data-processing-route]");
        expect(searchLocation).toHaveAttribute("data-processing-route", "server");
        expect(searchLocation).toHaveTextContent("CourtOS-Server");
        expect(screen.queryByText("Mit Gemma weiterarbeiten")).toBeNull();
        expect(api.local).not.toHaveBeenCalled();
        expect(api.public).not.toHaveBeenCalled();
        expect(api.handoff).not.toHaveBeenCalled();
    });

    it("discloses public AI processing before any explicit search and labels degraded results", async () => {
        api.public.mockResolvedValue({ results: [], query_mode: "opencaselaw_ai", ai_assisted: true, degraded: true, database_generation: null });
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        expect(screen.getByText(/KI-gestützte Suche · Bis zu acht Begriffe/)).toBeInTheDocument();
        expect(screen.getByText(/Mit «Suchen» werden Ihre Begriffe übermittelt/)).toBeInTheDocument();
        expect(screen.getByText("Externer KI-Suchdienst", { exact: false }).closest("[data-processing-route]")).toHaveAttribute("data-processing-route", "external");
        expect(screen.queryByText(/Textsuche ohne KI/)).not.toBeInTheDocument();
        expect(api.public).not.toHaveBeenCalled();
        await user.type(screen.getByRole("textbox", { name: "Suchbegriffe oder Entscheidnummer" }), "Gehör");
        expect(api.public).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: "Suchen" }));
        expect(await screen.findByText(/eingeschränkte Rangfolge/)).toBeInTheDocument();
        expect(screen.getByText(/Datenstand-Kennung:/)).toHaveTextContent("KI-gestützte Suche");
        expect(api.public).toHaveBeenCalledTimes(1);
        expect(api.local).not.toHaveBeenCalled();expect(api.handoff).not.toHaveBeenCalled();
    });
    it("discloses bounded public candidates without claiming corpus-best results or inventing a generation", async () => {
        api.public.mockResolvedValue({ results: [], query_mode: "literal_terms", database_generation: null,
            candidate_limit: 256, candidates_examined: 256, ranking: "bm25_within_rowid_window" });
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.type(screen.getByRole("textbox", { name: "Suchbegriffe oder Entscheidnummer" }), "Gehör");
        await user.click(screen.getByRole("button", { name: "Suchen" }));
        await user.click(await screen.findByText("Zum Suchumfang"));
        expect(screen.getByText(/aus einer begrenzten Auswahl/)).toHaveTextContent("höchstens 256 passenden Datensätzen");
        expect(screen.queryByText(/bestbewerteten/)).not.toBeInTheDocument();
        expect(screen.getByText(/Datenstand-Kennung:/)).toHaveTextContent("nicht angegeben");
    });
    it("starts with public research without loading a library or calling a model", () => {
        render(<KnowledgeWorkspace />);
        expect(screen.getByRole("textbox", { name: "Suchbegriffe oder Entscheidnummer" })).toHaveValue("");
        expect(api.list).not.toHaveBeenCalled();
        expect(api.local).not.toHaveBeenCalled();
        expect(api.public).not.toHaveBeenCalled();
        expect(api.handoff).not.toHaveBeenCalled();
    });
    it("uses fetched metadata consistently in the source, copied citations and Opus handoff", async () => {
        const decision = { decision_id: "CH_CASE", title: "Alter Titel", snippet: "Auszug", court: "bge", decision_date: "2025-01-02", source_url: "https://example.org/old", content_hash: "old-hash", scraped_at: "old-capture" };
        api.public.mockResolvedValue({ results: [decision], query_mode: "opencaselaw_ai", database_generation: null });
        api.detail.mockResolvedValue({ ...decision, title: "Berichtigter Titel", source_url: "https://example.org/current", content_hash: null, scraped_at: null, decision_date: "2025-01-01", date_is_estimated: true, source_note: "Wiederhergestellter Text <b>prüfen</b>", passage: { start: 0, end: 25, total_chars: 25, has_more: false, text: "Der genaue Entscheidtext." } });
        const user = userEvent.setup(); const view = render(<KnowledgeWorkspace />);
        await user.type(screen.getByLabelText("Suchbegriffe oder Entscheidnummer"), "Gehör");
        await user.click(screen.getByRole("button", { name: "Suchen" }));
        await user.click(await screen.findByRole("button", { name: /Entscheidtext öffnen/ }));
        const dialog = screen.getByRole("dialog");
        expect(await within(dialog).findByText(/Entscheidungsdatum ist im Quellenbestand nur geschätzt/)).toBeInTheDocument();
        expect(within(dialog).getByText(/Wiederhergestellter Text <b>prüfen<\/b>/)).toBeInTheDocument();
        expect(within(dialog).queryByRole("button", { name: "Textstelle und Quelle kopieren" })).toBeNull();
        expect(within(dialog).queryByRole("button", { name: /Mit (Gemma|Opus) prüfen/ })).toBeNull();
        await selectPublicExcerpt(user, dialog);
        const clipboard = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValueOnce();
        await user.click(within(dialog).getByRole("button", { name: "Textstelle und Quelle kopieren" }));
        expect(clipboard.mock.calls[0][0]).toContain("2025-01-01 (Datum geschätzt)");
        expect(clipboard.mock.calls[0][0]).toContain("Hinweis von OpenCaseLaw: Wiederhergestellter Text <b>prüfen</b>");
        expect(clipboard.mock.calls[0][0]).not.toContain("2025-01-02");
        expect(dialog).toHaveAccessibleName("Berichtigter Titel");
        expect(within(dialog).getByRole("link", { name: "Ganzes Original" })).toHaveAttribute("href", "https://example.org/current");
        expect(within(dialog).getByText(/Text-Hash:/)).toHaveTextContent("Text-Hash: nicht angegeben");
        expect(dialog).not.toHaveTextContent("old-hash");
        expect(dialog.querySelector("b")).toBeNull();
        api.model = "claude-opus-5-5";
        view.rerender(<KnowledgeWorkspace />);
        await user.click(within(dialog).getByRole("button", { name: "Mit Opus prüfen" }));
        const outgoing = api.handoff.mock.calls[0][1];
        expect(outgoing).toContain("Berichtigter Titel");
        expect(outgoing).toContain("2025-01-01 (Datum geschätzt)");
        expect(outgoing).toContain("https://example.org/current");
        expect(outgoing).toContain("Hinweis von OpenCaseLaw: Wiederhergestellter Text <b>prüfen</b>");
        expect(outgoing).toContain("Zeichen 0–25 von 25");
        expect(outgoing).toContain("Der genaue Entscheidtext.");
        for (const stale of ["Alter Titel", "2025-01-02", "https://example.org/old", "old-hash"]) expect(outgoing).not.toContain(stale);
    });
    it("offers the exact passage for manual copy if clipboard access is denied", async () => {
        const user = userEvent.setup();
        vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new DOMException("denied"));
        render(<KnowledgeWorkspace />);
        await user.click(screen.getByRole("button", { name: "Eigene Quellen" }));
        await user.click(await screen.findByRole("checkbox", { name: /Muster, Gehör/ }));
        await user.type(screen.getByLabelText("Suchbegriffe"), "Gehör");
        await user.click(screen.getByRole("button", { name: "Auswahl durchsuchen" }));
        await user.click(await screen.findByRole("button", { name: "Passage und Quelle kopieren" }));
        const fallback = await screen.findByRole("textbox", { name: "Text zum manuellen Kopieren" });
        expect(fallback).toHaveAttribute("readonly");
        expect((fallback as HTMLTextAreaElement).value).toContain(hit.quote);
        expect(screen.queryByText("Kopiert. In Ihrem Dokument einfügen.")).not.toBeInTheDocument();
    });
    it("requires explicit document selection and opens the exact version and quote read-only", async () => {
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(screen.getByRole("button", { name: "Eigene Quellen" }));
        const search = screen.getByRole("button", { name: "Auswahl durchsuchen" });
        await user.type(screen.getByLabelText("Suchbegriffe"), "Stellungnahme");
        expect(search).toBeDisabled();
        await user.click(await screen.findByRole("checkbox", { name: /Muster, Gehör/ }));
        await user.click(search);
        await screen.findByText(hit.quote);
        expect(api.local).toHaveBeenCalledWith("Stellungnahme", [document.id], expect.any(AbortSignal));
        expect(api.public).not.toHaveBeenCalled();
        const clipboard = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValueOnce();
        await user.click(screen.getByRole("button", { name: "Passage und Quelle kopieren" }));
        const copied = clipboard.mock.calls[0][0];
        expect(copied).toContain(hit.quote);
        expect(copied).toContain("Version 2, PDF-Seite 7");
        expect(copied).toContain(document.filename);
        expect(copied).toContain(`${window.location.origin}/sources/library/${document.id}/${hit.version_id}?page=7`);
        expect(copied).not.toMatch(/token=|signature=|\/storage\//);
        expect(screen.getByText(/Nur teilweise erfasst/)).toHaveTextContent("8 von 12 Seiten");
        await user.click(screen.getByRole("button", { name: "Beleg im Dokument öffnen" }));
        const viewer = await screen.findByTestId("source-viewer");
        expect(viewer).toHaveAttribute("data-version", "22222222-2222-4222-8222-222222222222");
        expect(viewer).toHaveAttribute("data-editable", "false");
        expect(viewer).toHaveAttribute("data-page", "7");
        expect(viewer).toHaveAttribute("data-verified", "true");
        expect(viewer).toHaveTextContent(hit.quote);
        expect(window.document.querySelector("script")).toBeNull();
    });
    it("does not prefill or submit private terms to public research, and preserves private selection", async () => {
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(screen.getByRole("button", { name: "Eigene Quellen" }));
        await user.click(await screen.findByRole("checkbox", { name: /Muster, Gehör/ }));
        await user.type(screen.getByLabelText("Suchbegriffe"), "private question");
        await user.click(screen.getByRole("button", { name: "OpenCaseLaw" }));
        expect(screen.getByRole("textbox", { name: "Suchbegriffe oder Entscheidnummer" })).toHaveValue("");
        expect(api.public).not.toHaveBeenCalled();
        await user.type(screen.getByRole("textbox", { name: "Suchbegriffe oder Entscheidnummer" }), "Gehör");
        await user.click(screen.getByRole("button", { name: "Suchen" }));
        await screen.findByText(/Die Suche hat keine Entscheide zurückgegeben/);
        expect(api.public).toHaveBeenCalledWith("Gehör", "", expect.any(AbortSignal));
        expect(api.local).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: "Eigene Quellen" }));
        expect(screen.getByRole("checkbox", { name: /Muster, Gehör/ })).toBeChecked();
        expect(screen.getByLabelText("Suchbegriffe")).toHaveValue("private question");
    });
    it("clears stale results when the document selection changes", async () => {
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(screen.getByRole("button", { name: "Eigene Quellen" }));
        await user.click(await screen.findByRole("checkbox", { name: /Muster, Gehör/ }));
        await user.type(screen.getByLabelText("Suchbegriffe"), "Gehör");
        await user.click(screen.getByRole("button", { name: "Auswahl durchsuchen" }));
        await screen.findByText(hit.quote);
        await user.click(screen.getByRole("checkbox", { name: /Muster, Gehör/ }));
        expect(screen.queryByText(hit.quote)).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Auswahl durchsuchen" })).toBeDisabled();
    });
    it("labels public results with submitted terms and clears them when the language changes", async () => {
        api.public.mockResolvedValue({ results: [{ decision_id: "A", title: "Quelle A", snippet: "Ergebnis A" }], query_mode: "opencaselaw_ai" });
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        const query = screen.getByLabelText("Suchbegriffe oder Entscheidnummer");
        await user.type(query, "Gehör");
        await user.click(screen.getByRole("button", { name: "Suchen" }));
        await screen.findByText("Ergebnis A");
        await user.clear(query); await user.type(query, "Zustellung");
        expect(screen.getByRole("heading", { name: "1 Entscheide zu «Gehör»" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: /zu «Zustellung»/ })).not.toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText("Sprache"), "fr");
        expect(screen.queryByText("Ergebnis A")).not.toBeInTheDocument();
        expect(api.public).toHaveBeenCalledTimes(1);
    });
    it("discards a late public result after changing the language without automatically searching again", async () => {
        let finish!: (data: unknown) => void;
        api.public.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.type(screen.getByLabelText("Suchbegriffe oder Entscheidnummer"), "Gehör");
        await user.click(screen.getByRole("button", { name: "Suchen" }));
        const signal = api.public.mock.calls[0][2] as AbortSignal;
        await user.selectOptions(screen.getByLabelText("Sprache"), "it");
        expect(signal.aborted).toBe(true);
        await act(async () => { finish({ results: [{ decision_id: "A", title: "Alte Quelle", snippet: "Verspäteter Treffer" }] }); });
        expect(screen.queryByText("Verspäteter Treffer")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Suchen" })).toBeEnabled();
        expect(api.public).toHaveBeenCalledTimes(1);
    });
    it("labels private results with the submitted query even while the next query is edited", async () => {
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(screen.getByRole("button", { name: "Eigene Quellen" }));
        await user.click(await screen.findByRole("checkbox", { name: /Muster, Gehör/ }));
        const query = screen.getByLabelText("Suchbegriffe");
        await user.type(query, "Gehör");
        await user.click(screen.getByRole("button", { name: "Auswahl durchsuchen" }));
        await screen.findByText(hit.quote);
        await user.clear(query); await user.type(query, "Zustellung");
        expect(screen.getByRole("heading", { name: "1 Passagen zu «Gehör»" })).toBeInTheDocument();
        expect(api.local).toHaveBeenCalledTimes(1);
    });
    it("makes empty and failed library states actionable", async () => {
        api.list.mockResolvedValueOnce({ documents: [], documentsHasMore: false });
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(screen.getByRole("button", { name: "Eigene Quellen" }));
        await screen.findByText(/Noch keine Dokumente/);
        expect(screen.getByRole("link", { name: /Dokumente hinzufügen/ })).toHaveAttribute("href", "/library");
        api.list.mockRejectedValueOnce(new Error("raw infrastructure error"));
        await user.click(screen.getByRole("button", { name: "Bestand aktualisieren" }));
        await screen.findByRole("alert");
        expect(screen.queryByText("raw infrastructure error")).not.toBeInTheDocument();
    });
    it("caps explicit selection at 20 documents", async () => {
        api.list.mockResolvedValue({ documents: Array.from({ length: 21 }, (_, index) => ({ ...document, id: String(index), filename: `Quelle ${index}.pdf` })), documentsHasMore: false });
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(screen.getByRole("button", { name: "Eigene Quellen" }));
        const boxes = await screen.findAllByRole("checkbox");
        for (const box of boxes.slice(0, 20)) await user.click(box);
        expect(boxes[20]).toBeDisabled();
        await user.click(boxes[0]);
        expect(boxes[20]).not.toBeDisabled();
    });
    it("keeps selected private PDFs when an explicit public excerpt is added and tabs change", async () => {
        const quote="Der Anspruch auf rechtliches Gehör ist zu beachten.";
        const decision={decision_id:"BGE_137_I_195",title:"BGE 137 I 195",snippet:quote,content_hash:null};
        api.public.mockResolvedValue({results:[decision],query_mode:"opencaselaw_ai",database_generation:null});
        api.detail.mockResolvedValue({...decision,passage:{start:0,end:Array.from(quote).length,total_chars:Array.from(quote).length,has_more:false,text:quote}});
        const user=userEvent.setup();render(<KnowledgeWorkspace/>);
        await user.click(screen.getByRole("button",{name:"Eigene Quellen"}));
        await user.click(await screen.findByRole("checkbox",{name:/Muster, Gehör/}));
        await user.type(screen.getByLabelText("Suchbegriffe"),"Vertrauliche Partei A");
        await user.type(screen.getByLabelText("Ihre Frage an die Quellen"),"Private Frage zum Dossier");
        await user.click(screen.getByRole("button",{name:"OpenCaseLaw"}));
        expect(screen.getByLabelText("Suchbegriffe oder Entscheidnummer")).toHaveValue("");
        await user.type(screen.getByLabelText("Suchbegriffe oder Entscheidnummer"),"BGE 137 I 195");
        await user.click(screen.getByRole("button",{name:"Suchen"}));
        await user.click(await screen.findByRole("button",{name:/Entscheidtext öffnen/}));
        const dialog=screen.getByRole("dialog");await within(dialog).findByText(quote);
        await selectPublicExcerpt(user,dialog);
        await user.click(within(dialog).getByRole("button",{name:"Mit dieser Quelle sprechen"}));
        const expected={files:[{filename:document.filename,document_id:document.id,version_id:document.current_version_id,version_number:2}],public_sources:[{decision_id:decision.decision_id,start:0,end:Array.from(quote).length,content_hash:null}]};
        expect(JSON.parse(screen.getByTestId("research-conversation").getAttribute("data-sources")!)).toEqual(expected);
        await user.click(screen.getByRole("button",{name:"Eigene Quellen"}));
        expect(JSON.parse(screen.getByTestId("research-conversation").getAttribute("data-sources")!)).toEqual(expected);
        await user.click(screen.getByRole("button",{name:"OpenCaseLaw"}));
        expect(JSON.parse(screen.getByTestId("research-conversation").getAttribute("data-sources")!)).toEqual(expected);
        expect(api.public).toHaveBeenCalledExactlyOnceWith("BGE 137 I 195","",expect.any(AbortSignal));
        expect(api.local).not.toHaveBeenCalled();expect(api.handoff).not.toHaveBeenCalled();
    });
    it("renders public snippets as text and loads only the selected decision", async () => {
        const decision = { decision_id: "CH_CASE", title: "Öffentlicher Entscheid", snippet: "<img src=x onerror=alert(1)>", court: "Bundesgericht", source_url: "https://example.org/case", pdf_url: "javascript:alert(1)", decision_date: "2025-01-02" };
        api.public.mockResolvedValue({ results: [decision], query_mode: "literal_terms", database_generation: "test" });
        api.detail.mockResolvedValue({ ...decision, passage: { start: 0, end: 25, total_chars: 25, has_more: false, text: "Der genaue Entscheidtext." } });
        const user = userEvent.setup(); const view = render(<KnowledgeWorkspace />);
        await user.click(screen.getByRole("button", { name: "OpenCaseLaw" }));
        await user.type(screen.getByLabelText("Suchbegriffe oder Entscheidnummer"), "Gehör");
        await user.click(screen.getByRole("button", { name: "Suchen" }));
        await screen.findByText(decision.snippet);
        expect(window.document.querySelector("img")).toBeNull();
        expect(screen.queryByRole("link", { name: "Ganzes Original-PDF" })).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /Entscheidtext öffnen/ }));
        await waitFor(() => expect(api.detail).toHaveBeenCalledWith("CH_CASE", 0, expect.any(AbortSignal)));
        const dialog = screen.getByRole("dialog");
        await within(dialog).findByText("Der genaue Entscheidtext.");
        expect(within(dialog).queryByRole("button", { name: "Textstelle und Quelle kopieren" })).toBeNull();
        expect(within(dialog).queryByRole("button", { name: /Mit (Gemma|Opus) prüfen/ })).toBeNull();
        await selectPublicExcerpt(user, dialog);
        const clipboard = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValueOnce();
        await user.click(within(dialog).getByRole("button", { name: "Textstelle und Quelle kopieren" }));
        const copied = clipboard.mock.calls[0][0];
        expect(copied).toContain("Der genaue Entscheidtext.");
        expect(copied).toContain("https://example.org/case");
        expect(copied).toContain("OpenCaseLaw-ID: CH_CASE");
        expect(copied).toContain("Zeichen 0–25 von 25; keine amtlichen Randnummern");
        expect(copied).not.toContain("javascript:");
        expect(within(dialog).getByRole("button", { name: "Nächster Abschnitt" })).toBeDisabled();
        expect(within(dialog).getByRole("button", { name: "Mit dieser Quelle sprechen" })).toBeEnabled();
        expect(api.research).not.toHaveBeenCalled();
        expect(api.push).not.toHaveBeenCalled();
        api.model = "claude-opus-5-5";
        view.rerender(<KnowledgeWorkspace />);
        const externalLocation = within(dialog).getByText("Claude Opus 5.5").closest("[data-processing-route]");
        expect(externalLocation).toHaveAttribute("data-processing-route", "external");
        expect(externalLocation).toHaveTextContent("Anthropic · externe API");
        expect(externalLocation).toHaveTextContent("Entwurf · noch nicht gesendet");
        await user.click(within(dialog).getByRole("button", { name: "Mit Opus prüfen" }));
        expect(api.handoff).toHaveBeenCalledWith("test-owner", expect.stringContaining("Bundesgericht · 2025-01-02"));
        const text = api.handoff.mock.calls[0][1];
        expect(text).toContain("OpenCaseLaw-ID: CH_CASE");
        expect(text).toContain("Zeichen 0–25 von 25");
        expect(text).not.toContain("11111111-1111-4111-8111-111111111111");
        expect(text).not.toContain("javascript:");
        expect(api.local).not.toHaveBeenCalled();
        expect(within(dialog).getByRole("alert")).toHaveTextContent("Der Auszug konnte nicht übergeben werden");
    });
    it("copies only a short selected passage, keeps full context readable and resets selection on navigation", async () => {
        const passage = "Kontext davor. Der genaue Wortlaut steht ausschliesslich hier. Kontext danach.";
        const selected = "Der genaue Wortlaut steht ausschliesslich hier.";
        const start = passage.indexOf(selected);
        const decision = { decision_id: "EXCERPT", title: "Original", snippet: "Suchvorschau", source_url: "https://example.org/original#known-anchor" };
        api.public.mockResolvedValueOnce({ results: [decision] });
        api.detail.mockResolvedValueOnce({ ...decision, passage: { start: 100, end: 100 + passage.length, total_chars: 1000, has_more: true, text: passage } });
        api.detail.mockResolvedValueOnce({ ...decision, passage: { start: 100 + passage.length, end: 1000, total_chars: 1000, has_more: false, text: "Ein weiterer Abschnitt im Originalkontext." } });
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.type(screen.getByLabelText("Suchbegriffe oder Entscheidnummer"), "Gehör");
        await user.click(screen.getByRole("button", { name: "Suchen" }));
        await user.click(await screen.findByRole("button", { name: /Entscheidtext öffnen/ }));
        const dialog = screen.getByRole("dialog");
        await within(dialog).findByText(passage);
        await selectPublicExcerpt(user, dialog, start, start + selected.length);
        expect(within(dialog).getByLabelText("Erfasster Entscheidtext")).toHaveTextContent(passage);
        const preview = within(dialog).getByLabelText("Ausgewählte Textstelle");
        expect(preview).toHaveTextContent(selected);
        expect(preview).not.toHaveTextContent("Kontext davor");
        expect(within(dialog).getByRole("link", { name: "Textstelle im Original suchen" }).getAttribute("href")).toContain("#known-anchor:~:text=");
        const clipboard = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValueOnce();
        await user.click(within(dialog).getByRole("button", { name: "Textstelle und Quelle kopieren" }));
        expect(clipboard.mock.calls[0][0]).toContain(`Zeichen ${100 + start}–${100 + start + selected.length}`);
        expect(clipboard.mock.calls[0][0]).not.toContain("Kontext danach");
        expect(api.research).not.toHaveBeenCalled(); expect(api.handoff).not.toHaveBeenCalled();
        await user.click(within(dialog).getByRole("button", { name: "Nächster Abschnitt" }));
        await within(dialog).findByText("Ein weiterer Abschnitt im Originalkontext.");
        expect(within(dialog).queryByRole("button", { name: "Textstelle und Quelle kopieren" })).toBeNull();
        expect(within(dialog).queryByLabelText("Ausgewählte Textstelle")).toBeNull();
    });
    it("labels known courts without changing source dates or docket numbers", async () => {
        api.public.mockResolvedValue({ results: [{ decision_id: "source-1", title: null, snippet: "Originalauszug", court: "zh_verwaltungsgericht", docket_number: "VB.2012.00393", decision_date: "2012-03-15" }], query_mode: "literal_terms", database_generation: "test" });
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(screen.getByRole("button", { name: "OpenCaseLaw" }));
        await user.type(screen.getByLabelText("Suchbegriffe oder Entscheidnummer"), "Gehör");
        await user.click(screen.getByRole("button", { name: "Suchen" }));
        expect(await screen.findByRole("heading", { name: "Verwaltungsgericht Zürich · VB.2012.00393" })).toBeVisible();
        expect(screen.getByText("Verwaltungsgericht Zürich", { exact: true })).toBeVisible();
        expect(screen.getByText("2012-03-15", { exact: true })).toBeVisible();
        await user.click(screen.getByText("Zum Suchumfang"));
        expect(screen.getByText(/Datum und Aktenzeichen stammen aus dem Datenbestand/)).toBeVisible();
    });
    it("binds selected original versions to the embedded conversation without search or auto-send", async () => {
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(screen.getByRole("button", { name: "Eigene Quellen" }));
        await user.click(await screen.findByRole("checkbox", { name: /Muster, Gehör/ }));
        expect(JSON.parse(screen.getByTestId("research-conversation").getAttribute("data-sources")!)).toEqual({ files: [{ filename: document.filename, document_id: document.id, version_id: document.current_version_id, version_number: 2 }], public_sources: [] });
        expect(api.push).not.toHaveBeenCalled(); expect(api.local).not.toHaveBeenCalled(); expect(api.public).not.toHaveBeenCalled();
    });
    it.each([{ status: "processing" }, { current_version_id: null }])("does not enable conversation from an unavailable source version", async override => {
        api.list.mockResolvedValueOnce({ documents: [{ ...document, ...override }], documentsHasMore: false });
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(screen.getByRole("button", { name: "Eigene Quellen" }));
        await user.click(await screen.findByRole("checkbox", { name: /Muster, Gehör/ }));
        expect(conversationSourceIssue(JSON.parse(screen.getByTestId("research-conversation").getAttribute("data-sources")!))).toBe("unready");
        expect(api.push).not.toHaveBeenCalled();
    });

    it("reads a Word selection only on request and waits for a separate search action", async () => {
        const wordHost = { kind: "word" as const, readSelection: vi.fn().mockResolvedValue("rechtliches Gehör"), insertTextAfterSelection: vi.fn(), insertCitationAfterSelection: vi.fn() };
        const user = userEvent.setup(); render(<KnowledgeWorkspace wordHost={wordHost} />);
        expect(wordHost.readSelection).not.toHaveBeenCalled();
        expect(wordHost.insertTextAfterSelection).not.toHaveBeenCalled();
        expect(api.public).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: "Auswahl aus Word übernehmen" }));
        expect(wordHost.readSelection).toHaveBeenCalledOnce();
        expect(screen.getByLabelText("Suchbegriffe oder Entscheidnummer")).toHaveValue("rechtliches Gehör");
        expect(api.public).not.toHaveBeenCalled();
        expect(api.research).not.toHaveBeenCalled(); expect(api.handoff).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: "Suchen" }));
        await waitFor(() => expect(api.public).toHaveBeenCalledWith("rechtliches Gehör", "", expect.any(AbortSignal)));
        expect(api.public).toHaveBeenCalledOnce();
    });

    it("rejects an overlong Word selection without replacing a manually entered query", async () => {
        const wordHost = { kind: "word" as const, readSelection: vi.fn().mockResolvedValue("Wort ".repeat(9)), insertTextAfterSelection: vi.fn(), insertCitationAfterSelection: vi.fn() };
        const user = userEvent.setup(); render(<KnowledgeWorkspace wordHost={wordHost} />);
        await user.type(screen.getByLabelText("Suchbegriffe oder Entscheidnummer"), "Zustellung");
        await user.click(screen.getByRole("button", { name: "Auswahl aus Word übernehmen" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("bis zu acht Rechtsbegriffe");
        expect(screen.getByLabelText("Suchbegriffe oder Entscheidnummer")).toHaveValue("Zustellung");
        expect(api.public).not.toHaveBeenCalled();
    });

    it.each([null, { kind: "word" as const, readSelection: vi.fn(), insertTextAfterSelection: vi.fn(), insertCitationAfterSelection: vi.fn() }])("keeps private Word research free of AI handoff, including host initialisation (%s)", async (wordHost) => {
        const user = userEvent.setup(); render(<KnowledgeWorkspace wordHost={wordHost} />);
        await user.click(screen.getByRole("button", { name: "Eigene Quellen" }));
        await user.click(await screen.findByRole("checkbox", { name: /Muster, Gehör/ }));
        await user.type(screen.getByLabelText("Suchbegriffe"), "Gehör");
        expect(screen.queryByText("Mit Gemma weiterarbeiten")).toBeNull();
        expect(screen.queryByRole("button", { name: "Mit dieser Auswahl fragen" })).toBeNull();
        expect(api.research).not.toHaveBeenCalled(); expect(api.handoff).not.toHaveBeenCalled();
        expect(api.push).not.toHaveBeenCalled();
    });

    it("inserts the selected public passage and its provenance only after an explicit Word action", async () => {
        const wordHost = { kind: "word" as const, readSelection: vi.fn(), insertTextAfterSelection: vi.fn(), insertCitationAfterSelection: vi.fn().mockResolvedValue(undefined) };
        const decision = { decision_id: "WORD_CASE", title: "Bundesgericht · BGE 137 I 195", court: "bger", docket_number: "BGE 137 I 195", decision_date: "2011-06-24", snippet: "Öffentlicher Auszug", source_url: "https://example.org/word-case" };
        api.public.mockResolvedValue({ results: [decision], query_mode: "literal_terms", database_generation: "test" });
        api.detail.mockResolvedValue({ ...decision, passage: { start: 0, end: 32, total_chars: 32, has_more: false, text: "Der genaue öffentliche Wortlaut." } });
        api.model = "claude-opus-5-5";
        const user = userEvent.setup(); render(<KnowledgeWorkspace wordHost={wordHost} />);
        await user.type(screen.getByLabelText("Suchbegriffe oder Entscheidnummer"), "Gehör");
        await user.click(screen.getByRole("button", { name: "Suchen" }));
        await user.click(await screen.findByRole("button", { name: /Entscheidtext öffnen/ }));
        const dialog = screen.getByRole("dialog");
        await within(dialog).findByText("Der genaue öffentliche Wortlaut.");
        await selectPublicExcerpt(user, dialog);
        expect(wordHost.readSelection).not.toHaveBeenCalled();
        expect(wordHost.insertTextAfterSelection).not.toHaveBeenCalled();
        expect(within(dialog).queryByRole("button", { name: /Mit (Gemma|Opus) prüfen/ })).toBeNull();
        await user.click(within(dialog).getByRole("button", { name: "In Word einfügen" }));
        expect(wordHost.insertCitationAfterSelection).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            quote: "Der genaue öffentliche Wortlaut.", source: "Bundesgericht · BGE 137 I 195 · 2011-06-24",
            sourceUrl: "https://example.org/word-case",
            pinpointUrl: expect.stringContaining("#:~:text="),
            pinpoint: "Zeichen 0–32 von 32 im erfassten Text; keine amtlichen Randnummern",
            notes: [expect.stringContaining("OpenCaseLaw-ID: WORD_CASE. Position im Original nicht geprüft")],
        }));
        expect(wordHost.insertTextAfterSelection).not.toHaveBeenCalled();
        expect(await within(dialog).findByText("In Word eingefügt.")).toBeVisible();
        expect(api.research).not.toHaveBeenCalled(); expect(api.handoff).not.toHaveBeenCalled();
    });

    it("warns about an unconfirmed Word insertion without retrying or exposing the host error", async () => {
        const wordHost = { kind: "word" as const, readSelection: vi.fn(), insertTextAfterSelection: vi.fn(), insertCitationAfterSelection: vi.fn().mockRejectedValue(new Error("private Office diagnostic")) };
        const user = userEvent.setup(); const view = render(<KnowledgeWorkspace wordHost={wordHost} />);
        await user.click(screen.getByRole("button", { name: "Eigene Quellen" }));
        await user.click(await screen.findByRole("checkbox", { name: /Muster, Gehör/ }));
        await user.type(screen.getByLabelText("Suchbegriffe"), "Gehör");
        await user.click(screen.getByRole("button", { name: "Auswahl durchsuchen" }));
        const insert = await screen.findByRole("button", { name: "In Word einfügen" });
        expect(wordHost.insertTextAfterSelection).not.toHaveBeenCalled();
        await user.click(insert);
        expect(await screen.findByRole("alert")).toHaveTextContent("Einfügen nicht bestätigt. Prüfen Sie zuerst das Word-Dokument; der Text könnte bereits eingefügt sein.");
        expect(screen.queryByText("private Office diagnostic")).toBeNull();
        expect(screen.queryByText("In Word eingefügt.")).toBeNull();
        view.rerender(<KnowledgeWorkspace wordHost={wordHost} />);
        expect(wordHost.insertCitationAfterSelection).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            quote: hit.quote, source: hit.filename, pinpoint: "Version 2, PDF-Seite 7",
            sourceUrl: expect.stringContaining(`/sources/library/${hit.document_id}/${hit.version_id}?page=7`),
        }));
        expect(wordHost.insertTextAfterSelection).not.toHaveBeenCalled();
        expect(wordHost.readSelection).not.toHaveBeenCalled();
    });
});
