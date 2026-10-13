import { test } from "node:test";
import assert from "node:assert/strict";
import { pinpointInText } from "../src/citecheck.mjs";

test("a pinpoint is matched as written, never read as a pattern", () => {
  const text = "Sachverhalt\nE. 3.2 Die Beschwerdeführerin rügt …\n";
  assert.equal(pinpointInText(text, "3.2"), true);
  assert.equal(pinpointInText(text, "3x2"), false);
  // Characters with a meaning in patterns neither throw nor match something else.
  assert.equal(pinpointInText(text, "3.2("), false);
  assert.equal(pinpointInText(text, "3+2"), false);
  assert.equal(pinpointInText(text, "3\\.2"), false);
});
