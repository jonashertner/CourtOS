import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsLayout from "./layout";

const push = vi.fn();
let pathname = "/settings/memory";
const mode = vi.hoisted(() => ({ pilot: false, cloudflare: false }));
vi.mock("@/app/lib/courtos", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/app/lib/courtos")>()),
    get COURTOS_PILOT_MODE() { return mode.pilot; },
    get COURTOS_CLOUDFLARE_AUTH() { return mode.cloudflare; },
}));

vi.mock("next/navigation", () => ({
    usePathname: () => pathname,
    useRouter: () => ({ push }),
}));

vi.mock("@/app/contexts/AuthContext", () => ({
    useAuth: () => ({
        isAuthenticated: true,
        authLoading: false,
        user: { email: "testperson@example.test" },
    }),
}));

describe("SettingsLayout", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        pathname = "/settings/memory";
        mode.pilot = false;
        mode.cloudflare = false;
    });

    it("exposes Memory as a dedicated settings page and marks it current", async () => {
        const user = userEvent.setup();
        render(
            <SettingsLayout>
                <div>Memory content</div>
            </SettingsLayout>,
        );

        const memoryTab = screen.getByRole("button", { name: "Memory" });
        expect(memoryTab).toHaveAttribute("aria-current", "page");
        expect(screen.getByText("Memory content")).toBeVisible();

        await user.click(screen.getByRole("button", { name: "Features" }));
        expect(push).toHaveBeenCalledWith("/settings/features");
    });

    it("does not mount provider forms through a direct pilot URL", () => {
        mode.pilot = true;
        pathname = "/settings/byok";
        render(<SettingsLayout><div>Secret entry form</div></SettingsLayout>);
        expect(screen.queryByText("Secret entry form")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Bring Your Own Keys" })).not.toBeInTheDocument();
        expect(screen.getByText("Im Testbetrieb zentral eingerichtet")).toBeVisible();
    });

    it("shows the managed identity instead of local password and email mutations", () => {
        mode.cloudflare = true;
        pathname = "/settings";
        render(<SettingsLayout><div>Password change form</div></SettingsLayout>);
        expect(screen.queryByText("Password change form")).not.toBeInTheDocument();
        expect(screen.getByText("testperson@example.test")).toBeVisible();
    });
});
