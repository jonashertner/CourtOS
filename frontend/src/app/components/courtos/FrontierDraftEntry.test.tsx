import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatInputHandle } from "@/app/components/assistant/ChatInput";
import { FRONTIER_RETURN_KEY } from "@/app/lib/frontierDraft";
import { FrontierDraftEntry } from "./FrontierDraftEntry";
const identity = vi.hoisted(() => ({ id: "user-a" }));
vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: identity.id } }) }));
beforeEach(() => { sessionStorage.clear(); identity.id = "user-a"; });
function setup(accept: boolean, ownerId = "user-a", chatId?: string) {
    sessionStorage.setItem(FRONTIER_RETURN_KEY, JSON.stringify({ version: 1, ownerId, createdAt: Date.now(), text: "Externe Prüfung", chatId: "chat-a" }));
    const prepare = vi.fn().mockReturnValue(accept);
    const inputRef = createRef<ChatInputHandle>();
    inputRef.current = { addDoc: vi.fn(), addFiles: vi.fn(), startWorkflow: vi.fn(), startWorkflowDocumentSelection: vi.fn(), prepareFrontierDraft: prepare };
    const rendered = render(<FrontierDraftEntry inputRef={inputRef} chatId={chatId} />);
    return { prepare, inputRef, ...rendered };
}
describe("frontier return to local composer", () => {
    it("prepares an owned draft without consuming its recovery copy or submitting", () => {
        const fetch = vi.spyOn(globalThis, "fetch");
        const { prepare } = setup(true);
        expect(prepare).toHaveBeenCalledWith("Externe Prüfung", expect.any(Function));
        expect(screen.getByRole("status")).toHaveTextContent("Entwurf · noch nicht gesendet");
        expect(sessionStorage.getItem(FRONTIER_RETURN_KEY)).not.toBeNull();
        prepare.mock.calls[0][1]();
        expect(sessionStorage.getItem(FRONTIER_RETURN_KEY)).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
        fetch.mockRestore();
    });
    it("keeps an existing draft until the empty composer accepts the return explicitly", () => {
        const { prepare } = setup(false);
        expect(sessionStorage.getItem(FRONTIER_RETURN_KEY)).not.toBeNull();
        expect(screen.getByText(/vorhandener Entwurf bleibt erhalten/)).toBeVisible();
        prepare.mockReturnValue(true);
        fireEvent.click(screen.getByRole("button", { name: "In leeres Eingabefeld übernehmen" }));
        expect(sessionStorage.getItem(FRONTIER_RETURN_KEY)).not.toBeNull();
        prepare.mock.calls.at(-1)![1]();
        expect(sessionStorage.getItem(FRONTIER_RETURN_KEY)).toBeNull();
    });
    it("does not expose a draft owned by another user", () => {
        const { prepare } = setup(true, "user-b");
        expect(prepare).not.toHaveBeenCalled();
        expect(screen.queryByRole("complementary")).toBeNull();
        expect(sessionStorage.getItem(FRONTIER_RETURN_KEY)).toBeNull();
    });
    it("does not insert a returned draft into a different existing conversation", () => {
        const { prepare } = setup(true, "user-a", "chat-b");
        expect(prepare).not.toHaveBeenCalled();
        expect(sessionStorage.getItem(FRONTIER_RETURN_KEY)).not.toBeNull();
    });
});
