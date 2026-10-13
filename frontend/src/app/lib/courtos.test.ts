import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
async function settings(pilot: boolean, knowledge: boolean) {
    vi.stubEnv("NEXT_PUBLIC_COURTOS_PILOT_MODE", String(pilot));
    vi.stubEnv("NEXT_PUBLIC_COURTOS_KNOWLEDGE_ENABLED", String(knowledge));
    vi.resetModules();
    return import("./courtos");
}
describe("research entry scope", () => {
    it("passes only a supported interface language to the separate Citecheck app", async () => {
        const { courtosCitecheckUrl } = await settings(true, true);
        for (const locale of ["de", "fr", "it", "en"]) {
            const url = new URL(courtosCitecheckUrl(locale));
            expect(url.origin + url.pathname).toBe("https://jonashertner.github.io/citecheck/taskpane.html");
            expect([...url.searchParams.entries()]).toEqual([["lang", locale]]);
            expect(url.hash).toBe("");
        }
        for (const locale of [undefined, null, "es", "fr&text=private", { locale: "en" }]) {
            expect(courtosCitecheckUrl(locale)).toBe("https://jonashertner.github.io/citecheck/taskpane.html?lang=de");
        }
    });
    it("uses the research shell for research and nested personal-library routes only", async () => {
        const { COURTOS_HOME, isResearchShellPath } = await settings(true, true);
        expect(COURTOS_HOME).toBe("/research");
        for (const path of ["/research", "/word/research", "/review", "/knowledge", "/library", "/library/folders/folder-a", "/sources/library/doc/version"]) expect(isResearchShellPath(path)).toBe(true);
        for (const path of ["/assistant", "/assistant/chat/one", "/projects", "/workflows", "/library-other", "/word", "/word/research-other"]) expect(isResearchShellPath(path)).toBe(false);
    });
    it.each([[false, true], [true, false]])("does not alter the inherited shell without both flags (%s/%s)", async (pilot, knowledge) => {
        const { COURTOS_HOME, isResearchShellPath } = await settings(pilot, knowledge);
        expect(COURTOS_HOME).toBe("/pilot");
        expect(isResearchShellPath("/library")).toBe(false);
    });
    it("grants self-registration only when pilot mode, Cloudflare auth and the explicit flag all agree", async () => {
        vi.stubEnv("NEXT_PUBLIC_COURTOS_PILOT_MODE", "true");
        vi.stubEnv("NEXT_PUBLIC_COURTOS_AUTH_MODE", "cloudflare");
        vi.stubEnv("NEXT_PUBLIC_COURTOS_ACCESS_SELF_REGISTRATION", "true");
        vi.resetModules();
        const { COURTOS_SELF_REGISTRATION } = await import("./courtos");
        expect(COURTOS_SELF_REGISTRATION).toBe(true);
    });
    it.each([
        ["false", "cloudflare", "true"],
        ["true", "other", "true"],
        ["true", "cloudflare", "false"],
    ])("withholds self-registration unless pilot mode, Cloudflare auth and the flag all agree (%s/%s/%s)", async (pilot, auth, flag) => {
        vi.stubEnv("NEXT_PUBLIC_COURTOS_PILOT_MODE", pilot);
        vi.stubEnv("NEXT_PUBLIC_COURTOS_AUTH_MODE", auth);
        vi.stubEnv("NEXT_PUBLIC_COURTOS_ACCESS_SELF_REGISTRATION", flag);
        vi.resetModules();
        const { COURTOS_SELF_REGISTRATION } = await import("./courtos");
        expect(COURTOS_SELF_REGISTRATION).toBe(false);
    });
    it("limits the settings-is-managed hint to provider and connector pages", async () => {
        const { isPilotManagedSettingsPath } = await settings(true, true);
        expect(isPilotManagedSettingsPath("/settings/byok")).toBe(true);
        expect(isPilotManagedSettingsPath("/settings/byok/openai")).toBe(true);
        expect(isPilotManagedSettingsPath("/settings/models")).toBe(true);
        expect(isPilotManagedSettingsPath("/settings/connectors")).toBe(true);
        expect(isPilotManagedSettingsPath("/settings/connectors/google")).toBe(true);
        expect(isPilotManagedSettingsPath("/settings")).toBe(false);
        expect(isPilotManagedSettingsPath("/settings/byok-other")).toBe(false);
    });
    it("keeps the Word navigation hint scoped to the dedicated route or explicit library URL", async () => {
        const { isWordResearchContext } = await settings(true, true);
        expect(isWordResearchContext("/word/research")).toBe(true);
        expect(isWordResearchContext("/library", "word")).toBe(true);
        expect(isWordResearchContext("/library/folders/one", "word")).toBe(true);
        expect(isWordResearchContext("/library")).toBe(false);
        expect(isWordResearchContext("/library", "Word")).toBe(false);
        expect(isWordResearchContext("/research", "word")).toBe(false);
        expect(isWordResearchContext("/library-other", "word")).toBe(false);
    });
});
