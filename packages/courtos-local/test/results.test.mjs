import { test } from "node:test";
import assert from "node:assert/strict";

// Just enough of a page for the renderers' helpers to run outside a browser.
function fakeElement() {
  const props = new Map();
  return {
    props,
    style: { setProperty: (k, v) => props.set(k, v) },
    dataset: {},
    setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, append() {},
  };
}
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document ??= { documentElement: { dataset: {} }, createElement: () => fakeElement() };
const { h } = await import("../web/shared.js");
const { comparisonStatus, partyClass, tally } = await import("../web/results.js");

test("a custom property in a style reaches the element, so the comparison gets its columns", () => {
  const el = h("div.compare-table", { style: { "--cols": "2", color: "red" } });
  assert.equal(el.props.get("--cols"), "2", "--cols is set through setProperty, not dropped");
  assert.equal(el.style.color, "red", "ordinary properties still apply");
});

test("each point of a comparison is disputed, one-sided, open or set out by both, from the postures alone", () => {
  const row = (...positions) => ({ positions: positions.map(([party, posture]) => ({ party, posture })) });
  assert.equal(comparisonStatus(row(["P1", "allegation"], ["P2", "denial"])), "disputed");
  assert.equal(comparisonStatus(row(["P1", "disputed"], ["P2", "disputed"])), "disputed");
  assert.equal(comparisonStatus(row(["P1", "allegation"])), "one_sided", "the other party says nothing on the point");
  assert.equal(comparisonStatus(row(["P1", "allegation"], ["P1", "allegation"])), "one_sided", "two positions of one party are still one side");
  assert.equal(comparisonStatus(row(["P2", "denial"])), "disputed", "a denial makes a point disputed even when it stands alone");
  assert.equal(comparisonStatus(row(["P1", "allegation"], ["P2", "unresolved"])), "open");
  assert.equal(comparisonStatus(row(["P1", "allegation"], ["P2", "allegation"])), "both", "both state it; that is not read as agreement");
});

test("the overview counts each value in order and leaves out what does not occur", () => {
  assert.deepEqual(tally(["b", "a", "b", "x"], ["a", "b", "c"]), [{ key: "a", count: 1 }, { key: "b", count: 2 }]);
  assert.deepEqual(tally([], ["a"]), []);
});

test("only the claimant and the respondent carry a party colour", () => {
  assert.equal(partyClass("P1"), "pty P1");
  assert.equal(partyClass("P2"), "pty P2");
  assert.equal(partyClass("P3"), "pty");
  assert.equal(partyClass(null), "pty");
});
