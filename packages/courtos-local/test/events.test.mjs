// Server events arrive outside any click. A handler that fails, for example
// because the session ended while the event stream was open, must reach the
// page's own error handling (the pairing page or a message), not become an
// unhandled promise rejection.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

for (const file of ["app.js", "word.js"]) {
  test(`${file} routes every server event through its error handling`, async () => {
    const source = await readFile(new URL(`../web/${file}`, import.meta.url), "utf8");
    assert.match(source, /\n  events\(guarded\(\{/);
    const definition = /\nconst guarded = (.+);\n/.exec(source)[1];
    const handled = [];
    const attempt = async (fn) => { try { return await fn(); } catch (error) { handled.push(error.message); } };
    const guarded = new Function("attempt", `return ${definition};`)(attempt);
    const handlers = guarded({ fails: async () => { throw new Error("not_paired"); }, works: (data) => data * 2 });
    await handlers.fails({});
    assert.deepEqual(handled, ["not_paired"]);
    assert.equal(await handlers.works(21), 42);
  });
}

test("the Word pane's case handler hands its refresh back, so a failed refresh is caught", async () => {
  const source = await readFile(new URL("../web/word.js", import.meta.url), "utf8");
  assert.match(source, /case: \(change\) => \{[^\n]*return refresh\(\); \},/);
});
