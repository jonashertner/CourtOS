import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CourtOSLocaleProvider } from "@/app/contexts/CourtOSLocaleContext";
import { ResearchSettings } from "./ResearchSettings";
import { CourtOSAccessGate } from "./CourtOSAccessGate";
import { getResearchModelPreference } from "@/app/lib/researchModelPreference";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), login: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }), useSearchParams: () => new URLSearchParams("next=%2Fresearch%3Fhandoff%3D11111111-1111-4111-8111-111111111111") }));
vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ isAuthenticated: false, authLoading: false, refreshSession: mocks.refresh }) }));
vi.mock("@/app/lib/authApi", async original => ({ ...(await original<typeof import("@/app/lib/authApi")>()), loginWithCloudflare: mocks.login }));
vi.mock("@/app/lib/courtos", async original => ({ ...(await original<typeof import("@/app/lib/courtos")>()), COURTOS_SELF_REGISTRATION: true, COURTOS_PILOT_MODE: true, COURTOS_HOME: "/research" }));
beforeEach(() => {
    localStorage.clear(); vi.clearAllMocks();
    Object.defineProperty(navigator, "languages", { configurable: true, value: ["de-CH"] });
    Object.defineProperty(window, "Office", { configurable: true, value: undefined });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
    mocks.login.mockResolvedValue(undefined); mocks.refresh.mockResolvedValue({ id: "current-owner" });
});
it("changes Word settings copy while leaving unavailable AI controls and model preference intact", () => {
    render(<CourtOSLocaleProvider ownerId="word-french"><ResearchSettings open onClose={vi.fn()} userId="word-french" onSignOut={vi.fn()} modelsAvailable={false} /></CourtOSLocaleProvider>);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "fr" } });
    expect(screen.getByRole("dialog", { name: "Paramètres" })).toBeVisible();
    expect(screen.getByText(/Les requêtes IA ne sont pas encore disponibles/)).toBeVisible();
    expect(screen.getByRole("radio", { name: /Gemma/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Claude/ })).toBeDisabled();
    expect(getResearchModelPreference("word-french")).toBe("gemma");
    expect(screen.getByRole("link", { name: /GitHub/ })).toHaveAttribute("href", "https://github.com/jonashertner/CourtOS");
    expect(screen.queryByText(/MikeOSS/)).not.toBeInTheDocument();
});
it("keeps the precise authenticated continuation when using Italian sign-in controls", async () => {
    render(<CourtOSLocaleProvider ownerId={null}><CourtOSAccessGate /></CourtOSLocaleProvider>);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "it" } });
    fireEvent.click(screen.getByRole("button", { name: "Apri CourtOS" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/research?handoff=11111111-1111-4111-8111-111111111111"));
    expect(mocks.login).toHaveBeenCalledExactlyOnceWith();
});
it("localizes a displayed safe auth error on language change without another login request", async () => {
    mocks.login.mockRejectedValue(new Error("untrusted-server-detail"));
    render(<CourtOSLocaleProvider ownerId={null}><CourtOSAccessGate /></CourtOSLocaleProvider>);
    fireEvent.click(screen.getByRole("button", { name: "CourtOS öffnen" }));
    await screen.findByRole("alert");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "en" } });
    expect(screen.getByRole("alert")).toHaveTextContent("CourtOS is currently unreachable");
    expect(screen.getByRole("alert")).not.toHaveTextContent("untrusted-server-detail");
    expect(mocks.login).toHaveBeenCalledOnce();
});
