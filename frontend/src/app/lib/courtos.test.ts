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
        for (const path of ["/research", "/knowledge", "/library", "/library/folders/folder-a"]) expect(isResearchShellPath(path)).toBe(true);
        for (const path of ["/assistant", "/assistant/chat/one", "/projects", "/workflows", "/library-other"]) expect(isResearchShellPath(path)).toBe(false);
    });
    it.each([[false, true], [true, false]])("does not alter the inherited shell without both flags (%s/%s)", async (pilot, knowledge) => {
        const { COURTOS_HOME, isResearchShellPath } = await settings(pilot, knowledge);
        expect(COURTOS_HOME).toBe("/pilot");
        expect(isResearchShellPath("/library")).toBe(false);
    });
});
