import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeWorkspace } from "./KnowledgeWorkspace";

const api = vi.hoisted(() => ({ list: vi.fn(), local: vi.fn(), public: vi.fn(), detail: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: api.push }) }));
vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "test-owner" } }) }));
vi.mock("@/app/lib/mikeApi", () => ({ searchLibraryDocuments: api.list }));
vi.mock("@/app/lib/knowledgeApi", async (original) => ({ ...(await original<typeof import("@/app/lib/knowledgeApi")>()), searchKnowledge: api.local, searchPublicKnowledge: api.public, getPublicDecision: api.detail }));
vi.mock("next/dynamic", () => ({ default: () => (props: { document: { document_id: string; version_id: string; quotes: { quote: string }[] }; canEdit: boolean }) => <div data-testid="source-viewer" data-document={props.document.document_id} data-version={props.document.version_id} data-editable={String(props.canEdit)}>{props.document.quotes[0]?.quote}</div> }));

const document = { id: "personal-a", filename: "Muster, Gehör, 2026.pdf", active_version_number: 2 };
const hit = { document_id: document.id, version_id: "fixed-version-2", version_number: 2, filename: document.filename, page: 7, quote: "Die Stellungnahme ist zu prüfen. <script>kein HTML</script>", score: 1 };
beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
    api.list.mockResolvedValue({ documents: [document], documentsHasMore: false });
    api.local.mockResolvedValue({ results: [hit], documents: [{ document_id: document.id, version_id: hit.version_id, index_status: "partial", indexed_pages: 8, total_pages: 12 }], notices: ["Nur ein Teil der Seiten ist erfasst."] });
    api.public.mockResolvedValue({ results: [], query_mode: "literal_terms", database_generation: "test-generation" });
});

describe("personal knowledge workspace", () => {
    it("requires explicit document selection and opens the exact version and quote read-only", async () => {
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        const search = screen.getByRole("button", { name: "In ausgewählten Quellen suchen" });
        await user.type(screen.getByLabelText("Begriffe oder Frage zu Ihrer Auswahl"), "Stellungnahme");
        expect(search).toBeDisabled();
        await user.click(await screen.findByRole("checkbox", { name: /Muster, Gehör/ }));
        await user.click(search);
        await screen.findByText(hit.quote);
        expect(api.local).toHaveBeenCalledWith("Stellungnahme", [document.id], expect.any(AbortSignal));
        expect(api.public).not.toHaveBeenCalled();
        expect(screen.getByText(/Nur teilweise erfasst/)).toHaveTextContent("8 von 12 Seiten");
        await user.click(screen.getByRole("button", { name: "Beleg im Dokument öffnen" }));
        const viewer = await screen.findByTestId("source-viewer");
        expect(viewer).toHaveAttribute("data-version", "fixed-version-2");
        expect(viewer).toHaveAttribute("data-editable", "false");
        expect(viewer).toHaveTextContent(hit.quote);
        expect(window.document.querySelector("script")).toBeNull();
    });
    it("does not prefill or submit private terms to public research, and preserves private selection", async () => {
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(await screen.findByRole("checkbox", { name: /Muster, Gehör/ }));
        await user.type(screen.getByLabelText("Begriffe oder Frage zu Ihrer Auswahl"), "private question");
        await user.click(screen.getByRole("button", { name: "Öffentliche Rechtsprechung" }));
        expect(screen.getByRole("textbox", { name: "Öffentliche Rechtsbegriffe" })).toHaveValue("");
        expect(api.public).not.toHaveBeenCalled();
        await user.type(screen.getByRole("textbox", { name: "Öffentliche Rechtsbegriffe" }), "Gehör");
        await user.click(screen.getByRole("button", { name: "OpenCaseLaw durchsuchen" }));
        await screen.findByText(/Keine passenden Entscheide/);
        expect(api.public).toHaveBeenCalledWith("Gehör", "", expect.any(AbortSignal));
        expect(api.local).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: "Meine Bibliothek" }));
        expect(screen.getByRole("checkbox", { name: /Muster, Gehör/ })).toBeChecked();
        expect(screen.getByLabelText("Begriffe oder Frage zu Ihrer Auswahl")).toHaveValue("private question");
    });
    it("clears stale results when the document selection changes", async () => {
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(await screen.findByRole("checkbox", { name: /Muster, Gehör/ }));
        await user.type(screen.getByLabelText("Begriffe oder Frage zu Ihrer Auswahl"), "Gehör");
        await user.click(screen.getByRole("button", { name: "In ausgewählten Quellen suchen" }));
        await screen.findByText(hit.quote);
        await user.click(screen.getByRole("checkbox", { name: /Muster, Gehör/ }));
        expect(screen.queryByText(hit.quote)).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "In ausgewählten Quellen suchen" })).toBeDisabled();
    });
    it("makes empty and failed library states actionable", async () => {
        api.list.mockResolvedValueOnce({ documents: [], documentsHasMore: false });
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await screen.findByText(/Ihre persönliche Bibliothek ist noch leer/);
        expect(screen.getByRole("link", { name: /Dokumente in die Bibliothek aufnehmen/ })).toHaveAttribute("href", "/library");
        api.list.mockRejectedValueOnce(new Error("raw infrastructure error"));
        await user.click(screen.getByRole("button", { name: "Bestand aktualisieren" }));
        await screen.findByRole("alert");
        expect(screen.queryByText("raw infrastructure error")).not.toBeInTheDocument();
    });
    it("caps explicit selection at 20 documents", async () => {
        api.list.mockResolvedValue({ documents: Array.from({ length: 21 }, (_, index) => ({ ...document, id: String(index), filename: `Quelle ${index}.pdf` })), documentsHasMore: false });
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        const boxes = await screen.findAllByRole("checkbox");
        for (const box of boxes.slice(0, 20)) await user.click(box);
        expect(boxes[20]).toBeDisabled();
        await user.click(boxes[0]);
        expect(boxes[20]).not.toBeDisabled();
    });
    it("renders public snippets as text and loads only the selected decision", async () => {
        const decision = { decision_id: "CH_CASE", title: "Öffentlicher Entscheid", snippet: "<img src=x onerror=alert(1)>", court: "Bundesgericht", source_url: "https://example.org/case", pdf_url: "javascript:alert(1)", decision_date: "2025-01-02" };
        api.public.mockResolvedValue({ results: [decision], query_mode: "literal_terms", database_generation: "test" });
        api.detail.mockResolvedValue({ ...decision, passage: { start: 0, end: 20, total_chars: 20, has_more: false, text: "Der genaue Entscheidtext." } });
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(screen.getByRole("button", { name: "Öffentliche Rechtsprechung" }));
        await user.type(screen.getByLabelText("Öffentliche Rechtsbegriffe"), "Gehör");
        await user.click(screen.getByRole("button", { name: "OpenCaseLaw durchsuchen" }));
        await screen.findByText(decision.snippet);
        expect(window.document.querySelector("img")).toBeNull();
        expect(screen.queryByRole("link", { name: "Original-PDF" })).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /Entscheidtext öffnen/ }));
        await waitFor(() => expect(api.detail).toHaveBeenCalledWith("CH_CASE", 0, expect.any(AbortSignal)));
        const dialog = screen.getByRole("dialog");
        await within(dialog).findByText("Der genaue Entscheidtext.");
        expect(within(dialog).getByRole("button", { name: "Nächster Abschnitt" })).toBeDisabled();
    });
    it("labels known courts without changing source dates or docket numbers", async () => {
        api.public.mockResolvedValue({ results: [{ decision_id: "source-1", title: null, snippet: "Originalauszug", court: "zh_verwaltungsgericht", docket_number: "VB.2012.00393", decision_date: "2012-03-15" }], query_mode: "literal_terms", database_generation: "test" });
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(screen.getByRole("button", { name: "Öffentliche Rechtsprechung" }));
        await user.type(screen.getByLabelText("Öffentliche Rechtsbegriffe"), "Gehör");
        await user.click(screen.getByRole("button", { name: "OpenCaseLaw durchsuchen" }));
        expect(await screen.findByRole("heading", { name: "Verwaltungsgericht Zürich · VB.2012.00393" })).toBeVisible();
        expect(screen.getByText(/Verwaltungsgericht Zürich · 2012-03-15/)).toBeVisible();
        expect(screen.getByText(/Datum und Aktenzeichen stammen aus dem Datenbestand/)).toBeVisible();
    });
    it("uses the existing new-assistant route without automatic search or submission", async () => {
        const user = userEvent.setup(); render(<KnowledgeWorkspace />);
        await user.click(await screen.findByRole("checkbox", { name: /Muster, Gehör/ }));
        await user.type(screen.getByLabelText("Begriffe oder Frage zu Ihrer Auswahl"), "Gehör?");
        await user.click(screen.getByRole("button", { name: "Mit dieser Auswahl fragen" }));
        expect(api.push).toHaveBeenCalledWith("/assistant");
        expect(api.local).not.toHaveBeenCalled();
        expect(api.public).not.toHaveBeenCalled();
    });
});
