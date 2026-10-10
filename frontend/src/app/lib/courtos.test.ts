import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
async function settings(pilot: boolean, knowledge: boolean) {
    vi.stubEnv("NEXT_PUBLIC_COURTOS_PILOT_MODE", String(pilot));
    vi.stubEnv("NEXT_PUBLIC_COURTOS_KNOWLEDGE_ENABLED", String(knowledge));
    vi.resetModules();
    return import("./courtos");
}
describe("research entry scope", () => {
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
