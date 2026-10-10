import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CourtOSLocaleProvider, useCourtOSLocale } from "./CourtOSLocaleContext";
import { CourtOSLanguageSelect } from "@/app/components/courtos/CourtOSLanguageSelect";
import { setCourtOSLocale } from "@/app/lib/courtosLocale";

beforeEach(() => {
    localStorage.clear(); vi.restoreAllMocks();
    Object.defineProperty(navigator, "languages", { configurable: true, value: ["de-CH"] });
    Object.defineProperty(window, "Office", { configurable: true, value: undefined });
});
function Consumer() {
    const { t } = useCourtOSLocale();
    return <><CourtOSLanguageSelect explain /><p>{t({ de: "Deutsch gewählt", fr: "Français choisi", it: "Italiano scelto", en: "English selected" })}</p></>;
}
it("switches accessible UI and document lang while leaving unrelated model and query state untouched", () => {
    localStorage.setItem("courtos:research:model:v1:user-a", "external-model-sentinel");
    window.history.replaceState(null, "", "/research?handoff=00000000-0000-4000-8000-000000000001");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<CourtOSLocaleProvider ownerId="user-a"><Consumer /></CourtOSLocaleProvider>);
    expect(screen.getByRole("group", { name: "Sprache der Oberfläche" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deutsch" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Français" }));
    expect(screen.getByRole("button", { name: "Français" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Deutsch" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Français choisi")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("fr-CH");
    expect(localStorage.getItem("courtos:research:model:v1:user-a")).toBe("external-model-sentinel");
    expect(window.location.search).toContain("handoff="); expect(fetchSpy).not.toHaveBeenCalled();
});
it("does not briefly expose the previous account preference after owner changes", () => {
    setCourtOSLocale("provider-a", "it"); setCourtOSLocale("provider-b", "en");
    const view = render(<CourtOSLocaleProvider ownerId="provider-a"><Consumer /></CourtOSLocaleProvider>);
    expect(screen.getByText("Italiano scelto")).toBeInTheDocument();
    view.rerender(<CourtOSLocaleProvider ownerId="provider-b"><Consumer /></CourtOSLocaleProvider>);
    expect(screen.getByText("English selected")).toBeInTheDocument();
    expect(screen.queryByText("Italiano scelto")).not.toBeInTheDocument();
});
it("announces a temporary choice when persistent storage is blocked", () => {
    render(<CourtOSLocaleProvider ownerId="provider-storage-failure"><Consumer /></CourtOSLocaleProvider>);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Unavailable"); });
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("status")).toHaveTextContent("could not be saved for later visits");
});
it("reacts to another same-owner window's stored language without account crossover", () => {
    render(<CourtOSLocaleProvider ownerId="provider-synced"><Consumer /></CourtOSLocaleProvider>);
    act(() => { setCourtOSLocale("provider-synced", "fr"); });
    expect(screen.getByText("Français choisi")).toBeInTheDocument();
    act(() => { setCourtOSLocale("provider-other", "it"); });
    expect(screen.getByText("Français choisi")).toBeInTheDocument();
});
