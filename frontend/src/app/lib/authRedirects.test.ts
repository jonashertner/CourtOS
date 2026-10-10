import { afterEach, describe, expect, it, vi } from "vitest";
import {
    authErrorDescription,
    safeAuthNext,
    safeCourtOSResearchNext,
} from "./authRedirects";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("safeCourtOSResearchNext", () => {
    it.each(["/word/research", "/research"])("accepts the exact research return path %s", (path) => {
        expect(safeCourtOSResearchNext(path, "/pilot")).toBe(path);
    });
    it("retains only an exact validated source reference across sign-in", () => {
        const path = "/sources/library/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222?page=7";
        expect(safeCourtOSResearchNext(path, "/research")).toBe(path);
        for (const candidate of [path + "&next=https://evil.example", path + "#quote", path.replace("page=7", "page=0"), path.replace("/11111111-", "/../11111111-")]) expect(safeCourtOSResearchNext(candidate, "/research")).toBe("/research");
    });
    it.each([null, undefined, "", "//evil.example", "https://evil.example", "/word\\research", "/word/research\n", "/word/research?x=1", "/word/research#x", "/word/research/../login", "%2Fword%2Fresearch"])("fails closed for %s", (path) => {
        expect(safeCourtOSResearchNext(path, "/research")).toBe("/research");
    });
});

describe("safeAuthNext", () => {
    it("allows known internal destinations with query parameters", () => {
        expect(safeAuthNext("/settings?emailChange=processed")).toBe(
            "/settings?emailChange=processed",
        );
        expect(safeAuthNext("/reset-password")).toBe("/reset-password");
        expect(safeAuthNext("/onboarding/profile")).toBe("/onboarding/profile");
    });

    it.each([
        "assistant",
        "https://evil.example",
        "//evil.example/path",
        "/unknown",
        "/settings\\evil",
        "/settings\n/assistant",
    ])("rejects unsafe destination %s", (candidate) => {
        expect(safeAuthNext(candidate)).toBe("/assistant");
    });

    it("uses a caller-provided fallback when no destination is supplied", () => {
        expect(safeAuthNext(undefined, "/login")).toBe("/login");
    });
});

describe("authErrorDescription", () => {
    it("reads provider errors from query parameters or implicit-flow hashes", () => {
        expect(
            authErrorDescription("?error_description=Expired+link", ""),
        ).toBe("This confirmation link is invalid or has expired.");
        expect(
            authErrorDescription("", "#error=access_denied"),
        ).toBe("Authentication was cancelled or denied.");
        expect(authErrorDescription("?error=query_error", "")).toBe(
            "Authentication could not be completed. Please try again.",
        );
        expect(
            authErrorDescription("", "#error_description=Invalid+request"),
        ).toBe("This confirmation link is invalid or has expired.");
        expect(authErrorDescription("", "")).toBeNull();
    });
});
