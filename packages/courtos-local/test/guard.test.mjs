import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AgentRun } from "../src/agent/runner.mjs";
import { ScriptedProvider, toolUse } from "../src/agent/providers.mjs";
import { insideRoot, walk } from "../src/scan.mjs";
import { freshCase } from "./helpers.mjs";

test("the guard blocks registered originals, structured identifiers and paths", async () => {
  const { root, store, cleanup } = await freshCase();
  try {
    const guard = store.guard();
    assert.deepEqual(guard.scan("Person 1 rügte die Mängel."), []);
    assert.ok(guard.scan("Frau Keller rügte die Mängel.").length);
    assert.ok(guard.scan("ALPENBLICK").length, "case-insensitive");
    assert.ok(guard.scan("Kontakt: someone@example.org").length, "unregistered e-mail");
    assert.ok(guard.scan("AHV 756.9999.8888.77").length, "unregistered AHV number");
    assert.ok(guard.scan(`siehe ${root}/Beilagen`).length, "local path");
    assert.ok(guard.scan("01 Klage Alpenblick Hotel AG.pdf").length, "file name");
  } finally { await cleanup(); }
});

test("a model turn that writes a real name stops the run before the next request", async () => {
  const { store, cleanup } = await freshCase();
  try {
    await store.release({ model: "demo", budgetChf: null });
    const provider = new ScriptedProvider([
      [{ type: "text", text: "Vielleicht heisst Person 1 in Wirklichkeit Anna Keller." }, toolUse("t1", "list_documents", {})],
      [toolUse("t2", "list_documents", {})],
    ]);
    const run = new AgentRun({ store, provider, task: "chronology", model: "demo" });
    await run.run();
    assert.equal(run.status, "blocked");
    assert.equal(run.error.code, "outbound_blocked");
    assert.equal(provider.calls.length, 1, "the second request was never sent");
  } finally { await cleanup(); }
});

test("names after a line break are caught inside request bodies", async () => {
  const { store, cleanup } = await freshCase();
  try {
    const guard = store.guard();
    const body = { messages: [{ role: "assistant", content: [{ type: "text", text: "Er heisst:\nKeller." }] }] };
    assert.throws(() => guard.checkBody(body), { code: "outbound_blocked" });
    assert.throws(() => guard.checkBody({ x: ["Tel.\n+41 79 555 12 34"] }), { code: "outbound_blocked" });
    assert.doesNotThrow(() => guard.checkBody({ x: "Person 1 rügte\ndie Mängel." }));
  } finally { await cleanup(); }
});

test("a thinking block's signature is not read as text; its thinking is", async () => {
  const { store, cleanup } = await freshCase();
  try {
    const guard = store.guard();
    // Base64 can spell a registered name between "+" and "/": "Keller" here.
    const signature = "EqQBCkYIBRgCKkBx+Keller/9hZ2V0aGlua2luZ3NpZ25hdHVyZQ==";
    assert.doesNotThrow(() => guard.checkBody({ messages: [{ role: "assistant", content: [{ type: "thinking", thinking: "", signature }, { type: "redacted_thinking", data: signature }] }] }));
    assert.throws(() => guard.checkBody({ messages: [{ role: "assistant", content: [{ type: "thinking", thinking: "Frau Keller", signature: "abc" }] }] }), { code: "outbound_blocked" });
    // Only those two fields of those two block types are skipped.
    assert.throws(() => guard.checkBody({ messages: [{ role: "user", content: [{ type: "text", text: "x", signature }] }] }), { code: "outbound_blocked" });
    assert.throws(() => guard.checkBody({ messages: [{ role: "user", content: [{ type: "text", data: signature }] }] }), { code: "outbound_blocked" });
  } finally { await cleanup(); }
});

test("a question that already uses a neutral label is still pseudonymised", async () => {
  const { store, cleanup } = await freshCase();
  try {
    await store.release({ model: "demo", budgetChf: null });
    const provider = new ScriptedProvider([[{ type: "text", text: "Fertig." }], [{ type: "text", text: "Fertig." }]]);
    const label = store.register.entities.find(e => e.label === "Lea Roth").replacement;
    const run = new AgentRun({ store, provider, task: "source_chat", question: `Was sagt ${label} über Frau Keller?`, model: "demo" });
    await run.run();
    const sent = JSON.stringify(provider.calls[0]);
    assert.ok(sent.includes(label));
    assert.equal(sent.includes("Keller"), false);
  } finally { await cleanup(); }
});

test("a planted symlink in place of the workspace is refused", async () => {
  const { dir, root, cleanup } = await freshCase();
  try {
    const { rm, mkdir: mk } = await import("node:fs/promises");
    const { CaseStore } = await import("../src/caseStore.mjs");
    await rm(join(root, ".courtos"), { recursive: true, force: true });
    await mk(join(dir, "elsewhere"));
    await symlink(join(dir, "elsewhere"), join(root, ".courtos"));
    await assert.rejects(CaseStore.open(root), { code: "workspace_unsafe" });
  } finally { await cleanup(); }
});

test("a question typed with real names is pseudonymised before it is sent", async () => {
  const { store, cleanup } = await freshCase();
  try {
    await store.release({ model: "demo", budgetChf: null });
    const provider = new ScriptedProvider([[{ type: "text", text: "Fertig." }], [{ type: "text", text: "Fertig." }]]);
    const run = new AgentRun({ store, provider, task: "source_chat", question: "Was sagt Marco Bianchi von der Bergfeld Bau GmbH?", model: "demo" });
    await run.run();
    const sent = JSON.stringify(provider.calls[0]);
    assert.equal(sent.includes("Bianchi"), false);
    assert.equal(sent.includes("Bergfeld"), false);
    assert.match(sent, /Person \d+/);
  } finally { await cleanup(); }
});

test("quotations from unread pages and invented quotations are rejected", async () => {
  const { store, cleanup } = await freshCase();
  try {
    await store.release({ model: "demo", budgetChf: null });
    const s1 = store.mirror.documents.find(d => d.label === "Klage").pages[0].section;
    const claims = [{ id: "C1", text: "x", citations: [{ section_id: s1, exact_quote: "Rechtsbegehren" }] }];
    const invented = [{ id: "C1", text: "x", citations: [{ section_id: s1, exact_quote: "Die Beklagte hat alles zugegeben." }] }];
    const provider = new ScriptedProvider([
      [toolUse("t1", "submit_result", { claims, rows: [{ id: "R1", answer: "C1" }], more_claims_reported: false })],
      [toolUse("t2", "read", { sections: [s1] })],
      [toolUse("t3", "submit_result", { claims: invented, rows: [{ id: "R1", answer: "C1" }], more_claims_reported: false })],
      [toolUse("t4", "submit_result", { claims: invented, rows: [{ id: "R1", answer: "C1" }], more_claims_reported: false })],
      [toolUse("t5", "submit_result", { claims: invented, rows: [{ id: "R1", answer: "C1" }], more_claims_reported: false })],
    ]);
    const run = new AgentRun({ store, provider, task: "source_chat", question: "Was wird beantragt?", model: "demo" });
    await run.run();
    const reasons = run.events.filter(e => e.type === "rejected").map(e => e.reason.split(":")[0]);
    assert.equal(reasons[0], "read_before_quoting");
    assert.ok(reasons.slice(1).every(r => r === "quotation"), "a result whose only claim is invented is never kept, even after its correction");
    assert.equal(run.status, "failed");
    assert.equal(run.error.code, "result_failed_validation");
    assert.equal(run.bound, undefined, "nothing is kept from a failed run");
  } finally { await cleanup(); }
});

test("paths outside the case folder, into .courtos, or through symlinks are refused", async () => {
  const { dir, root, cleanup } = await freshCase();
  try {
    const { realRoot } = await walk(root);
    await assert.rejects(insideRoot(realRoot, "../secret.txt"), { code: "path_rejected" });
    await assert.rejects(insideRoot(realRoot, ".courtos/private/register.json"), { code: "path_rejected" });
    await mkdir(join(dir, "outside"), { recursive: true });
    await writeFile(join(dir, "outside", "other-case.md"), "Fremder Fall\n");
    await symlink(join(dir, "outside"), join(root, "link-out"));
    await assert.rejects(insideRoot(realRoot, "link-out/other-case.md"), { code: "path_rejected" });
    const { files } = await walk(root);
    assert.equal(files.some(f => f.rel_path.startsWith("link-out")), false, "symlinked folders are not followed");
  } finally { await cleanup(); }
});
