import { describe, expect, it } from "vitest";
import { hasUncitedProse } from "./sourceBoundAnswer";
describe("paragraph evidence coverage (not semantic entailment)", () => {
  it("permits short paragraphs each linked to a checked original", () => expect(hasUncitedProse("The party alleges payment [1].\n\nThe exhibit says a different sum [2].", new Set([1, 2]))).toBe(false));
  it.each(["A sourced assertion [1].\n\nUncited substantive conclusion.", "Intro.\n\nA sourced assertion [1].", "A sourced assertion [1].\n- Uncited extra assertion.", "A sourced assertion [1].\n\nWould you like advice?", "A sourced assertion [2].", "[An arbitrary authority](https://example.test) [1].", "``` fabricated code ``` [1]"])("withholds uncited or unsupported structure %s", text => expect(hasUncitedProse(text, new Set([1]))).toBe(true));
  it("does not pretend an exact citation determines the truth of an interpretation", () => {
    expect(hasUncitedProse("An interpretation that still needs human scrutiny [1].", new Set([1]))).toBe(false);
  });
});
