import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState, type ReactNode } from "react";
import type { Message } from "@/app/components/shared/types";
import { CourtOSLocaleProvider } from "@/app/contexts/CourtOSLocaleContext";
import { setCourtOSLocale } from "@/app/lib/courtosLocale";
import { sourceGroundingMessages } from "@/app/lib/sourceGroundingMessages";
import { ResearchConversation } from "./ResearchConversation";
import type { ResearchConversationSources } from "@/app/lib/researchConversation";

const api = vi.hoisted(() => ({ send: vi.fn(), stop: vi.fn(), load: vi.fn(), created: null as null | ((id: string) => void), failure: null as null | ((issue?: import("@mike/contracts").SourceGroundingIssue) => void), busy: false, chats: [] as object[] }));
vi.mock("@/app/contexts/ChatHistoryContext", () => ({ ChatHistoryProvider: ({ children }: { children: ReactNode }) => children, useChatHistoryContext: () => ({ chats: api.chats }) }));
vi.mock("@/app/lib/assistantTurns", () => ({ loadAssistantChat: api.load }));
vi.mock("@/app/hooks/useAssistantChat", () => ({ useAssistantChat: ({ onChatCreated, onTurnFailed }: { onChatCreated: (id: string) => void; onTurnFailed: (issue?: import("@mike/contracts").SourceGroundingIssue) => void }) => {
    const [messages, setMessages] = useState<Message[]>([]); api.created = onChatCreated; api.failure = onTurnFailed;
    return { messages, setMessages, isResponseLoading: api.busy, handleChat: async (message: Message) => { setMessages(current => [...current, message]); return api.send(message); }, resetChat: () => setMessages([]), cancel: api.stop };
} }));
vi.mock("@/app/components/assistant/AssistantMessage", () => ({ AssistantMessage: (props: { allowFrontier?: boolean; events?: { type: string; text?: string }[] }) => <div data-testid="answer" data-frontier={String(props.allowFrontier)}>{props.events?.map(e => e.text).join("")}</div> }));
const owner = "11111111-1111-4111-8111-111111111111", chatId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const first: ResearchConversationSources = { files: [{ document_id: "22222222-2222-4222-8222-222222222222", version_id: "33333333-3333-4333-8333-333333333333", version_number: 2, filename: "Klage.pdf" }], public_sources: [] };
const second: ResearchConversationSources = { files: [{ ...first.files[0], version_id: "44444444-4444-4444-8444-444444444444", filename: "Antwort.pdf" }], public_sources: [] };
const base = () => ({ owner, candidate: first, onState: vi.fn(), onEdit: vi.fn(), onFindSources: vi.fn(), onCitation: vi.fn() });
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); api.busy = false; api.chats = []; api.send.mockResolvedValue(chatId); });
describe("source-bound research conversation", () => {
    it("does not send without an explicit source and does not transfer the question to public search", async () => {
        const props = { ...base(), candidate: { files: [], public_sources: [] } }; const user = userEvent.setup(); render(<ResearchConversation {...props} />);
        await user.type(screen.getByLabelText("Ihre Frage an die Quellen"), "Privater Sachverhalt");
        expect(screen.getByRole("button", { name: "Fragen" })).toBeDisabled();
        await user.click(screen.getByRole("button", { name: "Rechtsprechung finden" }));
        expect(props.onFindSources).toHaveBeenCalledWith("public"); expect(api.send).not.toHaveBeenCalled();
    });
    it("retains the same immutable sources for a follow-up after a different library selection", async () => {
        const props = base(); const user = userEvent.setup(); const { rerender } = render(<ResearchConversation {...props} />);
        await user.type(screen.getByLabelText("Ihre Frage an die Quellen"), "Was steht zum Datum?"); await user.click(screen.getByRole("button", { name: "Fragen" }));
        await waitFor(() => expect(api.send).toHaveBeenCalledOnce());
        rerender(<ResearchConversation {...props} candidate={second} />);
        expect(screen.getByRole("button", { name: "Eigene Quellen wählen" })).toBeDisabled();
        await user.type(screen.getByLabelText("Ihre Frage an die Quellen"), "Und zum Betrag?"); await user.click(screen.getByRole("button", { name: "Fragen" }));
        expect(api.send.mock.calls[1][0]).toMatchObject({ content: "Und zum Betrag?", files: first.files, model: "courtos-local", public_sources: [] });
        await user.click(screen.getByRole("button", { name: "Neues Gespräch" }));
        await user.type(screen.getByLabelText("Ihre Frage an die Quellen"), "Neue Quelle"); await user.click(screen.getByRole("button", { name: "Fragen" }));
        expect(api.send.mock.calls[2][0].files).toEqual(second.files);
    });
    it("restores only history and an unsent draft, then resends exact public descriptors", async () => {
        const public_sources = [{ decision_id: "BGE_137_I_195", start: 30, end: 70, content_hash: null }];
        api.load.mockResolvedValue({ chat: { id: chatId, user_id: owner, project_id: null, access_role: "owner" }, messages: [{ role: "user", content: "Erste Frage", public_sources }, { role: "assistant", content: "Belegte Antwort", citations: [], citationStatus: "final" }] });
        const props = base(), user = userEvent.setup(); render(<ResearchConversation {...props} initialState={{ chat_id: chatId, draft: "Offene Folgefrage" }} />);
        await screen.findByText("Erste Frage"); expect(api.send).not.toHaveBeenCalled();
        expect(screen.getByLabelText("Ihre Frage an die Quellen")).toHaveValue("Offene Folgefrage");
        expect(screen.queryByText("Belegte Antwort")).toBeNull();
        expect(screen.queryByTestId("answer")).toBeNull();
        await user.click(screen.getByRole("button", { name: "Fragen" }));
        expect(api.send.mock.calls[0][0]).toMatchObject({ files: [], public_sources, content: "Offene Folgefrage" });
    });
    it("rejects a foreign or project conversation and keeps the draft without sending", async () => {
        api.load.mockResolvedValue({ chat: { id: chatId, user_id: "other", project_id: null, access_role: "owner" }, messages: [{ role: "assistant", content: "FOREIGN" }] });
        render(<ResearchConversation {...base()} initialState={{ chat_id: chatId, draft: "Mein Entwurf" }} />);
        await screen.findByRole("alert"); expect(screen.queryByText("FOREIGN")).toBeNull();
        expect(screen.getByLabelText("Ihre Frage an die Quellen")).toHaveValue("Mein Entwurf"); expect(screen.getByRole("button", { name: "Fragen" })).toBeDisabled(); expect(api.send).not.toHaveBeenCalled();
    });
    it("adopts a created ID for transfer without reloading or submitting twice", async () => {
        const props = base(), user = userEvent.setup(); render(<ResearchConversation {...props} />);
        api.send.mockImplementationOnce(async () => { api.created!(chatId); return chatId; });
        await user.type(screen.getByLabelText("Ihre Frage an die Quellen"), "Bitte Quelle erklären"); await user.click(screen.getByRole("button", { name: "Fragen" }));
        await waitFor(() => expect(props.onState).toHaveBeenLastCalledWith({ chat_id: chatId, draft: "" }));
        expect(api.load).not.toHaveBeenCalled(); expect(api.send).toHaveBeenCalledOnce();
    });
    it("holds browser transfer until the first conversation ID and preserves failed question drafts", async () => {
        let finish!: (value: null) => void; api.send.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        const props = { ...base(), onTransferReady: vi.fn() }, user = userEvent.setup(); render(<ResearchConversation {...props} />);
        await user.type(screen.getByLabelText("Ihre Frage an die Quellen"), "Meine genaue Frage"); await user.click(screen.getByRole("button", { name: "Fragen" }));
        expect(props.onTransferReady).toHaveBeenLastCalledWith(false);
        await act(async () => { finish(null); });
        expect(screen.getByLabelText("Ihre Frage an die Quellen")).toHaveValue("Meine genaue Frage");
        expect(api.send).toHaveBeenCalledOnce();
    });
    it("renders an original-checked source answer without offering transcript transfer to frontier", async () => {
        const citation = { type: "citation_data", kind: "public_decision", ref: 1, decision_id: "BGE_137_I_195", title: "Quelle", source_url: "https://example.org/original", pdf_url: null, content_hash: null, start: 0, end: 21, quote: "Exakter Originaltext.", verified: true };
        citation.end = Array.from(citation.quote).length;
        api.load.mockResolvedValue({ chat: { id: chatId, user_id: owner, project_id: null, access_role: "owner" }, messages: [{ role: "user", content: "Frage", files: first.files }, { role: "assistant", content: "Freigegebene Antwort", events: [{ type: "source_bound_answer", version: 1 }, { type: "content", text: "Freigegebene Antwort" }], citations: [citation], citationStatus: "final" }] });
        render(<ResearchConversation {...base()} initialState={{ chat_id: chatId, draft: "" }} />);
        expect(await screen.findByTestId("answer")).toHaveAttribute("data-frontier", "false"); expect(screen.getByText("Freigegebene Antwort")).toBeVisible();
    });
    it.each(["de", "fr", "it", "en"] as const)("preserves the question and explains a changed source in %s", async locale => {
        setCourtOSLocale(owner, locale); api.send.mockImplementationOnce(async () => { api.failure!("changed"); return chatId; });
        const user = userEvent.setup(); render(<CourtOSLocaleProvider ownerId={owner}><ResearchConversation {...base()} /></CourtOSLocaleProvider>);
        const question = screen.getByRole("textbox"); await user.type(question, "Meine Frage bleibt erhalten");
        const form = question.closest("form")!; await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
        await screen.findByText(sourceGroundingMessages.changed[locale]); expect(question).toHaveValue("Meine Frage bleibt erhalten"); expect(api.send).toHaveBeenCalledOnce();
    });
    it("shows Stop for an active request and never starts a second request", async () => {
        api.busy = true; const user = userEvent.setup(); render(<ResearchConversation {...base()} />);
        await user.click(screen.getByRole("button", { name: "Anhalten" })); expect(api.stop).toHaveBeenCalledOnce(); expect(api.send).not.toHaveBeenCalled();
    });
});
