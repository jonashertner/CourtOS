import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUserProfile } from "@/app/contexts/UserProfileContext";
import { ResearchDraftEntry } from "@/app/components/courtos/ResearchDraftEntry";
import { prepareResearchDraft, RESEARCH_DRAFT_KEY } from "@/app/lib/researchDraft";
import { FrontierDraftEntry } from "@/app/components/courtos/FrontierDraftEntry";
import { FRONTIER_RETURN_KEY } from "@/app/lib/frontierDraft";
import { ChatInput, type ChatInputHandle } from "./ChatInput";

const pilot = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/app/lib/courtos", () => ({
    get COURTOS_PILOT_MODE() { return pilot.enabled; },
    COURTOS_KNOWLEDGE_ENABLED: false,
}));

vi.mock("@/app/lib/mikeApi", () => ({
    listWorkflows: vi.fn(async () => []),
    uploadProjectDocument: vi.fn(),
    uploadStandaloneDocument: vi.fn(),
}));

vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-a" } }) }));
vi.mock("@/app/contexts/UserProfileContext", () => ({
    useUserProfile: vi.fn(),
}));
vi.mock("@/app/hooks/useConfiguredModels", () => ({
    useConfiguredModels: () => [],
}));

vi.mock("@/app/lib/modelAvailability", () => ({
    getModelProvider: vi.fn(),
    isModelAvailable: vi.fn(() => true),
}));

// The real module is kept for its constants — useSelectedModel imports
// ALLOWED_MODEL_IDS/DEFAULT_MODEL_ID/canonicalModelId from it, and this test
// exercises the real hook.
vi.mock("./ModelToggle", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./ModelToggle")>()),
    ModelToggle: ({
        onChange,
        onReasoningChange,
    }: {
        onChange: (model: string) => void;
        onReasoningChange?: (reasoning: "xhigh") => void;
    }) => (
        <>
            <button type="button" onClick={() => onChange("gpt-6-astra")}>
                Select test model
            </button>
            <button type="button" onClick={() => onReasoningChange?.("xhigh")}>
                Select test reasoning
            </button>
        </>
    ),
}));

vi.mock("./AddDocButton", () => ({ AddDocButton: () => null }));
vi.mock("./UploadOverlay", () => ({ UploadOverlay: () => null }));
vi.mock("../shared/FileTypeIcon", () => ({ FileTypeIcon: () => null }));
vi.mock("../modals/AddDocumentsModal", () => ({
    AddDocumentsModal: () => null,
}));
vi.mock("./AssistantWorkflowModal", () => ({
    AssistantWorkflowModal: () => null,
}));
vi.mock("../popups/ApiKeyMissingPopup", () => ({
    ApiKeyMissingPopup: () => null,
}));

const STORED = "openrouter/pricy/frontier";
const persistChatModelSelection = vi.fn(async () => true);
const persistChatReasoningSelection = vi.fn(async () => true);

class ResizeObserverMock {
    observe() {}
    disconnect() {}
}

function emptyApiKeys() {
    return {
        claude: { configured: false, source: null },
        gemini: { configured: false, source: null },
        openai: { configured: false, source: null },
        openrouter: { configured: false, source: null },
        vercel: { configured: false, source: null },
        courtlistener: { configured: false, source: null },
    };
}

function mockProfile(apiKeysDegraded: boolean) {
    vi.mocked(useUserProfile).mockReturnValue({
        profile: {
            openRouterModels: [],
            vercelModels: [],
            openCodeGoModels: [],
            lastSelectedChatModel: "gpt-6-luna",
            lastSelectedReasoningLevel: "high",
            apiKeys: emptyApiKeys(),
        },
        loading: false,
        apiKeysDegraded,
        persistChatModelSelection,
        persistChatReasoningSelection,
    } as unknown as ReturnType<typeof useUserProfile>);
}

describe("ChatInput model selection vs. a degraded profile", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        pilot.enabled = false;
        sessionStorage.clear();
        vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    });

    it("restores a research hand-off through real composer remounts and claims it only on edit", () => {
        pilot.enabled = true; mockProfile(false);
        prepareResearchDraft("user-a", "Prüfe diese Fundstelle mit ihrem Beleg.");
        const onSubmit = vi.fn();
        const ref = createRef<ChatInputHandle>();
        function Entry() { return <><ResearchDraftEntry inputRef={ref} /><ChatInput ref={ref} onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} /></>; }
        const first = render(<Entry />);
        expect(screen.getByRole("combobox")).toHaveValue("Prüfe diese Fundstelle mit ihrem Beleg.");
        expect(sessionStorage.getItem(RESEARCH_DRAFT_KEY)).not.toBeNull();
        first.unmount();
        render(<Entry />);
        expect(screen.getByRole("combobox")).toHaveValue("Prüfe diese Fundstelle mit ihrem Beleg.");
        expect(onSubmit).not.toHaveBeenCalled();
        fireEvent.change(screen.getByRole("combobox"), { target: { value: "Meine überarbeitete Frage" } });
        expect(sessionStorage.getItem(RESEARCH_DRAFT_KEY)).toBeNull();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("restores a returned frontier draft after the composer remounts during initial loading", () => {
        pilot.enabled = true;
        mockProfile(false);
        sessionStorage.setItem(FRONTIER_RETURN_KEY, JSON.stringify({ version: 1, ownerId: "user-a", createdAt: Date.now(), text: "Externe Prüfung mit Quellen" }));
        const onSubmit = vi.fn();
        function ReadyComposer() {
            const ref = createRef<ChatInputHandle>();
            return <><FrontierDraftEntry inputRef={ref} /><ChatInput ref={ref} onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} /></>;
        }
        const first = render(<ReadyComposer />);
        expect(screen.getByPlaceholderText("Ihre Frage oder Ihr Arbeitsauftrag…")).toHaveValue("Externe Prüfung mit Quellen");
        expect(sessionStorage.getItem(FRONTIER_RETURN_KEY)).not.toBeNull();
        first.unmount();
        render(<ReadyComposer />);
        const field = screen.getByPlaceholderText("Ihre Frage oder Ihr Arbeitsauftrag…");
        expect(field).toHaveValue("Externe Prüfung mit Quellen");
        expect(screen.getByRole("status")).toHaveTextContent("noch nicht an das lokale Modell gesendet");
        expect(onSubmit).not.toHaveBeenCalled();
        fireEvent.change(field, { target: { value: "Bewusst überarbeiteter Auftrag" } });
        expect(sessionStorage.getItem(FRONTIER_RETURN_KEY)).toBeNull();
        expect(field).toHaveValue("Bewusst überarbeiteter Auftrag");
    });

    it("prepares a frontier return only in an empty pilot composer and never sends it", async () => {
        pilot.enabled = true;
        mockProfile(false);
        const ref = createRef<ChatInputHandle>();
        const onSubmit = vi.fn();
        render(<ChatInput ref={ref} onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
        expect(screen.getByText("Gemma 4 · lokal auf dem CourtOS-Server")).toBeVisible();
        expect(screen.queryByRole("button", { name: "Select test model" })).not.toBeInTheDocument();
        const field = screen.getByPlaceholderText("Ihre Frage oder Ihr Arbeitsauftrag…");
        let accepted: boolean | undefined;
        act(() => { accepted = ref.current?.prepareFrontierDraft?.("Externe Prüfung"); });
        expect(accepted).toBe(true);
        expect(field).toHaveValue("Externe Prüfung");
        act(() => { accepted = ref.current?.prepareFrontierDraft?.("Überschreiben"); });
        expect(accepted).toBe(false);
        expect(field).toHaveValue("Externe Prüfung");
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("preserves an attachment selection when a frontier return is pending", () => {
        pilot.enabled = true;
        mockProfile(false);
        const ref = createRef<ChatInputHandle>();
        const onSubmit = vi.fn();
        render(<ChatInput ref={ref} onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
        act(() => { ref.current?.addDoc({ id: "doc-a", filename: "Literatur.pdf", file_type: "pdf" } as never); });
        let accepted: boolean | undefined;
        act(() => { accepted = ref.current?.prepareFrontierDraft?.("Externe Prüfung"); });
        expect(accepted).toBe(false);
        expect(screen.getByText("Literatur.pdf")).toBeVisible();
        expect(screen.getByPlaceholderText("Ihre Frage oder Ihr Arbeitsauftrag…")).toHaveValue("");
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("persists reasoning immediately for an existing chat", async () => {
        mockProfile(false);
        render(
            <ChatInput
                chatKey="chat-1"
                chatModel="gpt-6-luna"
                chatReasoningLevel="high"
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
                isLoading={false}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Select test reasoning" }),
        );

        await waitFor(() =>
            expect(persistChatReasoningSelection).toHaveBeenCalledWith(
                "xhigh",
                "chat-1",
            ),
        );
    });

    it("persists an initial-view selection to the profile immediately", async () => {
        mockProfile(false);
        render(
            <ChatInput
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
                isLoading={false}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Select test model" }),
        );

        await waitFor(() =>
            expect(persistChatModelSelection).toHaveBeenCalledWith(
                "gpt-6-astra",
                undefined,
            ),
        );
    });

    it("persists an existing-chat selection to the chat and profile immediately", async () => {
        mockProfile(false);
        render(
            <ChatInput
                chatKey="chat-1"
                chatModel="gpt-6-luna"
                chatReasoningLevel="high"
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
                isLoading={false}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Select test model" }),
        );

        await waitFor(() =>
            expect(persistChatModelSelection).toHaveBeenCalledWith(
                "gpt-6-astra",
                "chat-1",
            ),
        );
    });

    it("passes the tabular chat selection key through on toggle changes", async () => {
        mockProfile(false);
        const tabularChatKey = "tabular-review-chat:review-1:chat-1";
        render(
            <ChatInput
                chatKey={tabularChatKey}
                chatModel="gpt-6-luna"
                chatReasoningLevel="high"
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
                isLoading={false}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Select test model" }),
        );

        await waitFor(() =>
            expect(persistChatModelSelection).toHaveBeenCalledWith(
                "gpt-6-astra",
                tabularChatKey,
            ),
        );
    });

    it("hides the model toggle until existing-chat settings load", () => {
        mockProfile(false);
        const { rerender } = render(
            <ChatInput
                chatKey="chat-1"
                chatModel={undefined}
                chatReasoningLevel={undefined}
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
                isLoading={false}
            />,
        );

        expect(
            screen.queryByRole("button", { name: "Select test model" }),
        ).not.toBeInTheDocument();

        rerender(
            <ChatInput
                chatKey="chat-1"
                chatModel="gpt-6-luna"
                chatReasoningLevel="high"
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
                isLoading={false}
            />,
        );

        expect(
            screen.getByRole("button", { name: "Select test model" }),
        ).toBeInTheDocument();
    });

    it("keeps the chat model when router availability is unknown", async () => {
        mockProfile(true);
        const onSubmit = vi.fn();

        render(
            <ChatInput
                chatModel={STORED}
                onSubmit={onSubmit}
                onCancel={vi.fn()}
                isLoading={false}
            />,
        );

        fireEvent.change(screen.getByRole("combobox"), {
            target: { value: "hello" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Send message" }));
        await waitFor(() =>
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({ model: STORED }),
            ),
        );
    });

    it("falls back to profile last-selected when the chat router model is stale", async () => {
        mockProfile(false);
        const onSubmit = vi.fn();

        render(
            <ChatInput
                chatModel={STORED}
                onSubmit={onSubmit}
                onCancel={vi.fn()}
                isLoading={false}
            />,
        );

        fireEvent.change(screen.getByRole("combobox"), {
            target: { value: "hello" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Send message" }));
        await waitFor(() =>
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({ model: "gpt-6-luna" }),
            ),
        );
    });
});
