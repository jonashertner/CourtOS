import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FRONTIER_OUTBOUND_KEY } from "@/app/lib/frontierDraft";
import { FrontierAnswerAction } from "./FrontierAnswerAction";
vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-a" } }) }));
vi.mock("@/app/lib/courtos", () => ({ COURTOS_HYBRID_PATH: "#frontier" }));
beforeEach(() => { sessionStorage.clear(); });
describe("answer hand-off", () => {
    it("keeps the original text for review without an API call", () => {
        const fetch = vi.spyOn(globalThis, "fetch");
        render(<FrontierAnswerAction text="Antwort [1]." chatId="chat-a" />);
        fireEvent.click(screen.getByRole("button", { name: "Mit Frontier prüfen" }));
        expect(JSON.parse(sessionStorage.getItem(FRONTIER_OUTBOUND_KEY)!)).toMatchObject({ ownerId: "user-a", chatId: "chat-a", text: "Antwort [1]." });
        expect(fetch).not.toHaveBeenCalled();
        fetch.mockRestore();
    });
    it("explains an oversized answer rather than silently truncating it", () => {
        render(<FrontierAnswerAction text={"x".repeat(12_001)} />);
        fireEvent.click(screen.getByRole("button", { name: "Mit Frontier prüfen" }));
        expect(screen.getByRole("alert")).toHaveTextContent("mehr als 12’000 Zeichen");
        expect(screen.getByRole("link", { name: "Frontier-Prüfung öffnen" })).toBeVisible();
        expect(sessionStorage.getItem(FRONTIER_OUTBOUND_KEY)).toBeNull();
    });
});
