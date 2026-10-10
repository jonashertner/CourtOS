import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatInputHandle } from "@/app/components/assistant/ChatInput";
import { prepareResearchDraft, RESEARCH_DRAFT_KEY } from "@/app/lib/researchDraft";
import { ResearchDraftEntry } from "./ResearchDraftEntry";
const identity = vi.hoisted(() => ({ id: "user-a" }));
vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: identity.id } }) }));
beforeEach(() => { sessionStorage.clear(); identity.id = "user-a"; });
function setup(accept: boolean, owner = "user-a") {
    prepareResearchDraft(owner, "Frage und ausgewählte Fundstelle");
    const prepare = vi.fn().mockReturnValue(accept);
    const inputRef = createRef<ChatInputHandle>();
    inputRef.current = { addDoc: vi.fn(), addFiles: vi.fn(), startWorkflow: vi.fn(), startWorkflowDocumentSelection: vi.fn(), prepareFrontierDraft: prepare };
    const rendered = render(<ResearchDraftEntry inputRef={inputRef} />);
    return { prepare, ...rendered };
}
describe("research draft entry", () => {
    it("retains the owner-bound recovery copy until the composer claims it", () => {
        const { prepare } = setup(true);
        expect(prepare).toHaveBeenCalledWith("Frage und ausgewählte Fundstelle", expect.any(Function));
        expect(screen.getByRole("status")).toHaveTextContent("Erst mit Senden");
        expect(sessionStorage.getItem(RESEARCH_DRAFT_KEY)).not.toBeNull();
        prepare.mock.calls[0][1]();
        expect(sessionStorage.getItem(RESEARCH_DRAFT_KEY)).toBeNull();
    });
    it("offers a retry instead of overwriting an existing draft or attachment selection", () => {
        const { prepare } = setup(false);
        expect(screen.getByText(/vorhandener Entwurf und seine Anhänge bleiben erhalten/)).toBeVisible();
        prepare.mockReturnValue(true);
        fireEvent.click(screen.getByRole("button", { name: "In leeres Eingabefeld übernehmen" }));
        expect(screen.getByRole("status")).toHaveTextContent("Erst mit Senden");
        expect(sessionStorage.getItem(RESEARCH_DRAFT_KEY)).not.toBeNull();
    });
    it("never displays a different account's draft", () => {
        const { prepare } = setup(true, "user-b");
        expect(prepare).not.toHaveBeenCalled();
        expect(screen.queryByRole("complementary")).toBeNull();
    });
});
