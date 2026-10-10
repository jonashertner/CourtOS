import { beforeEach, describe, expect, it, vi } from "vitest";
import CourtOSPilotPage from "./page";

const state = vi.hoisted(() => ({ knowledgeEnabled: true, redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));
vi.mock("@/app/lib/courtos", () => ({ get COURTOS_KNOWLEDGE_ENABLED() { return state.knowledgeEnabled; } }));
beforeEach(() => { state.knowledgeEnabled = true; state.redirect.mockReset(); });
describe("historical CourtOS entry", () => {
    it("opens the working research surface directly", () => { CourtOSPilotPage(); expect(state.redirect).toHaveBeenCalledWith("/research"); });
    it("keeps a useful entry when knowledge is not enabled", () => { state.knowledgeEnabled = false; CourtOSPilotPage(); expect(state.redirect).toHaveBeenCalledWith("/assistant"); });
});
