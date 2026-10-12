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
const { consentLost, h, issuePlaces } = await import("../web/shared.js");
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

test("the first five parties carry their own colour, so an appeal's authorities are told apart", () => {
  assert.equal(partyClass("P1"), "pty P1");
  assert.equal(partyClass("P2"), "pty P2");
  assert.equal(partyClass("P5"), "pty P5");
  assert.equal(partyClass("P6"), "pty");
  assert.equal(partyClass(null), "pty");
});

test("closing a released case or switching cases does not report a lost release", () => {
  const open = { id: "a", consent_valid: true };
  assert.equal(consentLost(open, { id: "a", consent_valid: false }), true, "the same case lost its release");
  assert.equal(consentLost(open, null), false, "the case was closed");
  assert.equal(consentLost(open, { id: "b", consent_valid: false }), false, "another case was opened");
  assert.equal(consentLost({ id: "a", consent_valid: false }, { id: "a", consent_valid: false }), false);
});

test("the release warning counts pages and labels, not the entries that name them", () => {
  const issues = [
    { document: "D1", page: 3, code: "registered_term_remains" }, { document: "D1", page: 3, code: "mirror_guard" },
    { document: "D2", page: 3, code: "mirror_guard" }, { document: "D2", page: null, code: "mirror_guard" }, { party: "P1", code: "mirror_guard" },
  ];
  assert.deepEqual(issuePlaces(issues), { pages: 2, labels: 2 });
  assert.deepEqual(issuePlaces([]), { pages: 0, labels: 0 });
});
