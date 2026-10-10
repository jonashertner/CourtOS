import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchShell } from "./ResearchShell";
const state = vi.hoisted(() => ({ pathname: "/research", email: "very.long.but.realistically.named.reader@court.example.org", signOut: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => ({ replace: state.replace }) }));
vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ user: { email: state.email }, signOut: state.signOut }) }));
vi.mock("@/app/lib/courtos", () => ({ COURTOS_CLOUDFLARE_AUTH: false, COURTOS_CITECHECK_URL: "https://jonashertner.github.io/citecheck/taskpane.html?lang=de", COURTOS_GUIDE_PATH: "/guide/", COURTOS_SOURCE_URL: "https://github.com/jonashertner/CourtOS" }));
beforeEach(() => { state.pathname = "/research"; state.signOut.mockReset().mockResolvedValue(undefined); state.replace.mockReset(); });
describe("compact research window", () => {
    it("shows research and personal library, complete identity and source offer without workspace navigation", () => {
        render(<ResearchShell><p>Source results</p></ResearchShell>);
        expect(screen.getByRole("link", { name: "Recherche" })).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("link", { name: "Meine Bibliothek" })).toHaveAttribute("href", "/library");
        expect(screen.getByRole("link", { name: /Quellcode/ })).toHaveAttribute("href", "https://github.com/jonashertner/CourtOS");
        const citecheck = screen.getByRole("link", { name: "Zitate prüfen" });
        expect(citecheck).toHaveAttribute("href", "https://jonashertner.github.io/citecheck/taskpane.html?lang=de");
        expect(citecheck).toHaveAttribute("target", "_blank");
        expect(citecheck).toHaveAttribute("rel", "noopener noreferrer");
        expect(screen.getByText(state.email)).toBeVisible();
        expect(screen.getByRole("main")).toHaveTextContent("Source results");
        expect(screen.queryByRole("link", { name: /Projekte|Arbeitsabläufe|Assistent/ })).toBeNull();
    });
    it("keeps library navigation active inside a folder", () => {
        state.pathname = "/library/folders/one";
        render(<ResearchShell>Folder</ResearchShell>);
        expect(screen.getByRole("link", { name: "Meine Bibliothek" })).toHaveAttribute("aria-current", "page");
    });
    it("ends the application session before returning to password login", async () => {
        render(<ResearchShell>Results</ResearchShell>);
        fireEvent.click(screen.getByRole("button", { name: "Abmelden" }));
        await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/login"));
        expect(state.signOut).toHaveBeenCalledOnce();
    });
    it("keeps an unsuccessful sign-out visible and recoverable", async () => {
        state.signOut.mockRejectedValue(new Error("private server detail"));
        render(<ResearchShell>Results</ResearchShell>);
        fireEvent.click(screen.getByRole("button", { name: "Abmelden" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Die Abmeldung ist gerade nicht möglich");
        expect(screen.queryByText("private server detail")).toBeNull();
        expect(state.replace).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Abmelden" })).toBeEnabled();
    });
});
