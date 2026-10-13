import { test } from "node:test";
import assert from "node:assert/strict";
import { systemPrompt } from "../src/agent/tasks.mjs";

test("progress notes are asked for in the reader's language, a draft in the language of the proceedings", () => {
  assert.match(systemPrompt("chronology", "fr", "de"), /progress note: write it in French\./);
  assert.match(systemPrompt("decision_draft", "fr", "de"), /Write all claim texts in German\./);
  assert.match(systemPrompt("decision_draft", "fr", "de"), /progress note: write it in French\./);
});
