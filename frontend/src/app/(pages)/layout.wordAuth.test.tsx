import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ pathname: "/word/research", loading: false, push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => ({ push: state.push }) }));
vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ authLoading: state.loading, isAuthenticated: false }) }));
vi.mock("@/app/components/shared/AppSidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/app/components/courtos/ResearchShell", () => ({ ResearchShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/app/components/shared/FullScreenLoader", () => ({ FullScreenLoader: () => <p>Loading</p> }));
import MikeLayout from "./layout";

beforeEach(() => { state.pathname = "/word/research"; state.loading = false; state.push.mockReset(); window.history.replaceState({}, "", "/"); });
afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); });

describe("Word authentication return", () => {
    it("keeps a fresh Word user on the dedicated research route after login", async () => {
        render(<MikeLayout>Private research</MikeLayout>);
        await waitFor(() => expect(state.push).toHaveBeenCalledWith("/login?next=%2Fword%2Fresearch"));
        expect(screen.queryByText("Private research")).toBeNull();
    });
    it("preserves Word return when a library session expires", async () => {
        state.pathname = "/library/folders/one";
        window.history.replaceState({}, "", "/library/folders/one?host=word");
        render(<MikeLayout>Private library</MikeLayout>);
        await waitFor(() => expect(state.push).toHaveBeenCalledWith("/login?next=%2Fword%2Fresearch"));
        expect(screen.queryByText("Private library")).toBeNull();
    });
    it("does not treat ordinary library navigation as Word", async () => {
        state.pathname = "/library";
        render(<MikeLayout>Private library</MikeLayout>);
        await waitFor(() => expect(state.push).toHaveBeenCalledWith("/login"));
    });
    it("preserves an authenticated source version and page through a fresh login", async () => {
        state.pathname = "/sources/library/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222";
        const path = state.pathname + "?page=7";
        window.history.replaceState({}, "", path);
        render(<MikeLayout>Private source</MikeLayout>);
        await waitFor(() => expect(state.push).toHaveBeenCalledWith(`/login?next=${encodeURIComponent(path)}`));
        expect(screen.queryByText("Private source")).toBeNull();
    });
    it("waits for authentication to settle before redirecting", () => {
        state.loading = true;
        render(<MikeLayout>Private research</MikeLayout>);
        expect(state.push).not.toHaveBeenCalled();
        expect(screen.getByText("Loading")).toBeVisible();
    });
});
