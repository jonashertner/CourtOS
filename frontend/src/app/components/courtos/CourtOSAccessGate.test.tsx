import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourtOSAccessGate } from "./CourtOSAccessGate";

const state = vi.hoisted(() => ({
    replace: vi.fn(), bridge: vi.fn(), refresh: vi.fn(),
    authenticated: false, loading: false, selfRegistration: false,
}));

vi.mock("@/app/lib/courtos", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/app/lib/courtos")>()),
    COURTOS_HOME: "/pilot", COURTOS_PILOT_MODE: true,
    get COURTOS_SELF_REGISTRATION() { return state.selfRegistration; },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({
    isAuthenticated: state.authenticated, authLoading: state.loading,
    refreshSession: state.refresh,
}) }));
vi.mock("@/app/lib/authApi", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/app/lib/authApi")>()),
    loginWithCloudflare: state.bridge,
}));

describe("CourtOS Access entry", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.authenticated = false;
        state.loading = false;
        state.selfRegistration = false;
        state.bridge.mockResolvedValue({ user: { id: "synthetic-user" } });
        state.refresh.mockResolvedValue({ id: "synthetic-user" });
    });

    it("waits for an explicit action and offers no second password or identity field", async () => {
        render(<CourtOSAccessGate />);
        expect(state.bridge).not.toHaveBeenCalled();
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
        expect(document.querySelector('input[type="password"]')).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: "CourtOS öffnen" }));
        await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/pilot"));
        expect(state.bridge).toHaveBeenCalledTimes(1);
        expect(state.bridge).toHaveBeenCalledWith();
        expect(state.refresh).toHaveBeenCalledTimes(1);
    });

    it("keeps a failed bridge on screen without retry loops or exposing backend details", async () => {
        state.bridge.mockRejectedValue(new Error("private database detail"));
        render(<CourtOSAccessGate />);
        await userEvent.click(screen.getByRole("button", { name: "CourtOS öffnen" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("CourtOS ist gerade nicht erreichbar");
        expect(screen.queryByText("private database detail")).not.toBeInTheDocument();
        expect(state.replace).not.toHaveBeenCalled();
        expect(state.bridge).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("link", { name: "Mit E-Mail-Code neu anmelden" })).toHaveAttribute("href", "/cdn-cgi/access/logout");
        expect(screen.getByRole("button", { name: "CourtOS öffnen" })).toBeEnabled();
    });

    it("does not enter the workspace when the bridge failed to establish a session", async () => {
        state.refresh.mockResolvedValue(null);
        render(<CourtOSAccessGate />);
        await userEvent.click(screen.getByRole("button", { name: "CourtOS öffnen" }));
        await screen.findByRole("alert");
        expect(state.replace).not.toHaveBeenCalled();
    });

    it("describes first-use account creation only when self-registration is enabled", () => {
        state.selfRegistration = true;
        render(<CourtOSAccessGate />);
        expect(screen.getByText(/Beim ersten Öffnen wird Ihr persönliches CourtOS-Konto erstellt/)).toBeInTheDocument();
        expect(screen.getByText(/Eine Einladung oder ein zusätzliches Passwort ist nicht nötig/)).toBeInTheDocument();
        expect(screen.getByRole("complementary", { name: "Nutzungsgrenzen des Piloten" })).toHaveTextContent("20 MiB");
        expect(screen.getByRole("complementary", { name: "Nutzungsgrenzen des Piloten" })).toHaveTextContent("nicht automatisch frei");
    });

    it("does not advertise self-registration in the default closed mode", () => {
        render(<CourtOSAccessGate />);
        expect(screen.queryByText(/Beim ersten Öffnen wird/)).not.toBeInTheDocument();
        expect(screen.queryByRole("complementary", { name: "Nutzungsgrenzen des Piloten" })).not.toBeInTheDocument();
    });

    it("reuses an authenticated session without another bridge request", async () => {
        state.authenticated = true;
        render(<CourtOSAccessGate />);
        await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/pilot"));
        expect(state.bridge).not.toHaveBeenCalled();
    });
});
