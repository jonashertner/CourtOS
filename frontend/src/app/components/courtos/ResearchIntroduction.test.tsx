import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourtOSLocaleProvider } from "@/app/contexts/CourtOSLocaleContext";
import { setCourtOSLocale } from "@/app/lib/courtosLocale";
import { ResearchIntroduction } from "./ResearchIntroduction";
import { hasContinuedToResearch } from "@/app/lib/researchIntroduction";

const auth = vi.hoisted(() => ({ user: { id: "introduction-reader" } }));
vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => auth }));

beforeEach(() => { localStorage.clear(); auth.user.id = "introduction-reader"; });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("optional book-first research entry", () => {
    it("opens the English edition for an English-speaking reader", () => {
        setCourtOSLocale(auth.user.id, "en");
        render(<CourtOSLocaleProvider ownerId={auth.user.id}><ResearchIntroduction><h1>Research controls</h1></ResearchIntroduction></CourtOSLocaleProvider>);
        expect(screen.getByRole("link", {name: "Read the guide"})).toHaveAttribute("href", "/guide/en.html");
    });
    it("offers the book first without mounting research or treating a book click as consent or completion", () => {
        const fetch = vi.spyOn(globalThis, "fetch");
        render(<ResearchIntroduction><h1>Research controls</h1></ResearchIntroduction>);
        const book = screen.getByRole("link", { name: "Arbeitsbuch lesen" });
        expect(book).toHaveAttribute("href", "/guide/de.html");
        book.addEventListener("click", event => event.preventDefault());
        fireEvent.click(book);
        expect(hasContinuedToResearch(auth.user.id)).toBe(false);
        expect(localStorage.length).toBe(0);
        expect(screen.queryByRole("heading", { name: "Research controls" })).toBeNull();
        expect(screen.getByRole("button", { name: "Recherche öffnen" })).toBeEnabled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("continues immediately, puts keyboard focus on research, and remembers only this account", () => {
        const view = render(<ResearchIntroduction><h1>Research controls</h1></ResearchIntroduction>);
        fireEvent.click(screen.getByRole("button", { name: "Recherche öffnen" }));
        expect(screen.getByRole("heading", { name: "Research controls" })).toBeVisible();
        expect(screen.getByLabelText("Recherche")).toHaveFocus();
        expect(hasContinuedToResearch(auth.user.id)).toBe(true);
        auth.user.id = "other-introduction-reader";
        view.rerender(<ResearchIntroduction><h1>Research controls</h1></ResearchIntroduction>);
        expect(screen.getByRole("heading", { name: "CourtOS kennenlernen" })).toBeVisible();
        expect(screen.queryByRole("heading", { name: "Research controls" })).toBeNull();
    });
});
