import { describe, expect, it } from "vitest";
import { normaliseSourceGroundingIssue, sourceGroundingMessages, sourceGroundingText } from "./sourceGroundingMessages";
describe("closed source failure presentation", () => {
    it.each(["required","scope","unavailable","changed","verification"] as const)("maps %s in all four UI languages", issue => {
        expect(normaliseSourceGroundingIssue(issue)).toBe(issue);
        expect(sourceGroundingText("source_grounding_failed",issue)).toBe(sourceGroundingMessages[issue]);
        expect(Object.keys(sourceGroundingMessages[issue])).toEqual(["de","fr","it","en"]);
    });
    it.each([null,undefined,"__proto__","RAW SERVER MESSAGE",{},"Scope"])("rejects unknown issue %j", issue => {
        expect(normaliseSourceGroundingIssue(issue)).toBeNull();
        expect(sourceGroundingText("source_grounding_failed",issue)).toBe(sourceGroundingMessages.verification);
    });
    it("keeps required and historical failures distinct without trusting arbitrary codes",()=>{
        expect(sourceGroundingText("source_required")).toBe(sourceGroundingMessages.required);
        expect(sourceGroundingText("source_history_withheld","scope")).toBe(sourceGroundingMessages.history);
        expect(sourceGroundingText("arbitrary", "required")).toBeNull();
    });
});
