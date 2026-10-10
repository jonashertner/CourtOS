import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchSettings } from "./ResearchSettings";
import { getResearchModelPreference, setResearchModelPreference } from "@/app/lib/researchModelPreference";

beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
});
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("compact research settings", () => {
    it("keeps model selection separate from sending and account actions", () => {
        const signOut = vi.fn(); const close = vi.fn(); const fetch = vi.spyOn(globalThis, "fetch");
        render(<ResearchSettings open onClose={close} userId="settings-owner" email="reader@example.org" onSignOut={signOut} />);
        const server = screen.getByRole("radio", { name: /Gemma 4.*CourtOS-Server.*Deutschland/ });
        const external = screen.getByRole("radio", { name: /Claude Opus 5.5.*Anthropic.*externe API/ });
        expect(server).toBeChecked();
        expect(server.closest("label")).toHaveAttribute("data-processing-route", "server");
        expect(external.closest("label")).toHaveAttribute("data-processing-route", "external");
        fireEvent.click(external);
        expect(getResearchModelPreference("settings-owner")).toBe("claude-opus-5-5");
        expect(fetch).not.toHaveBeenCalled(); expect(signOut).not.toHaveBeenCalled();
        expect(screen.getByText("Eigene Quellen: Suche ohne KI")).toBeVisible();
        expect(screen.queryByText("Suche: ohne KI")).toBeNull();
        expect(screen.getByText("Externe Aufträge: Vorschau vor dem Senden")).toBeVisible();
        fireEvent.click(screen.getByRole("button", { name: "Abmelden" }));
        expect(signOut).toHaveBeenCalledOnce();
    });

    it("returns focus to the opener when closing and delegates Escape without changing a preference", () => {
        const opener = document.createElement("button"); document.body.appendChild(opener); opener.focus();
        const onClose = vi.fn();
        const props = { onClose, userId: "settings-focus", onSignOut: vi.fn() };
        const view = render(<ResearchSettings {...props} open />);
        fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
        expect(onClose).toHaveBeenCalledOnce();
        view.rerender(<ResearchSettings {...props} open={false} />);
        expect(opener).toHaveFocus(); expect(getResearchModelPreference("settings-focus")).toBe("gemma");
        opener.remove();
    });

    it("shows account failures and disables unavailable external processing", () => {
        render(<ResearchSettings open onClose={vi.fn()} userId="settings-unavailable" onSignOut={vi.fn()} signingOut signOutError="Abmeldung fehlgeschlagen." externalAvailable={false} />);
        expect(screen.getByRole("radio", { name: /Claude Opus/ })).toBeDisabled();
        expect(screen.getByRole("radio", { name: /Gemma/ })).toBeChecked();
        expect(screen.getByRole("button", { name: "Wird abgemeldet…" })).toBeDisabled();
        expect(screen.getByRole("alert")).toHaveTextContent("Abmeldung fehlgeschlagen.");
    });

    it("disables Word model controls without erasing the browser preference", () => {
        setResearchModelPreference("settings-word", "claude-opus-5-5");
        const props = { open: true, onClose: vi.fn(), userId: "settings-word", onSignOut: vi.fn() };
        const view = render(<ResearchSettings {...props} modelsAvailable={false} />);
        expect(screen.getByRole("radio", { name: /Gemma/ })).toBeDisabled();
        expect(screen.getByRole("radio", { name: /Claude Opus/ })).toBeDisabled();
        expect(screen.getByText("KI-Aufträge sind in dieser Word-Testfassung noch nicht verfügbar.")).toBeVisible();
        expect(screen.queryByText("Externe Aufträge: Vorschau vor dem Senden")).toBeNull();
        fireEvent.click(screen.getByRole("radio", { name: /Gemma/ }));
        expect(getResearchModelPreference("settings-word")).toBe("claude-opus-5-5");
        view.rerender(<ResearchSettings {...props} />);
        expect(screen.getByRole("radio", { name: /Claude Opus/ })).toBeEnabled();
        expect(screen.getByRole("radio", { name: /Claude Opus/ })).toBeChecked();
    });
});
