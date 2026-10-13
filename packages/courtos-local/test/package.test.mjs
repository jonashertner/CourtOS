import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { builtinModules } from "node:module";
import { promisify } from "node:util";
import { SAMPLES } from "../src/samples.mjs";

const here = new URL("..", import.meta.url);

/** What a tester's tarball would contain, without writing it. */
async function packed() {
  const { stdout } = await promisify(execFile)("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: here });
  const [pack] = JSON.parse(stdout);
  return { bundled: pack.bundled, files: pack.files.map(f => f.path) };
}

async function sources(dir) {
  const entries = await readdir(new URL(dir, here), { recursive: true, withFileTypes: true });
  return entries.filter(e => e.isFile() && /\.m?js$/.test(e.name)).map(e => `${e.parentPath}/${e.name}`);
}

test("the tester's tarball installs on its own: siblings bundled, every import declared", async () => {
  const { bundled, files } = await packed();
  const pkg = JSON.parse(await readFile(new URL("package.json", here), "utf8"));
  assert.deepEqual(bundled.sort(), ["@courtos/projection", "@courtos/workflows"], "the repository siblings travel inside the tarball");
  for (const need of ["bin/courtos-local.mjs", "src/server.mjs", "web/index.html", "web/theme.js", "word/manifest.xml", "README.md", "TESTING.md"]) {
    assert.ok(files.includes(need), `${need} is packed`);
  }
  for (const sample of SAMPLES) assert.ok(files.some(f => f.startsWith(`fixtures/${sample.folder}/`)), `the sample ${sample.id} is packed`);
  assert.equal(files.some(f => f.startsWith("fixtures/samples/") || f.endsWith(".py")), false, "the sample sources and generators stay in the repository");
  assert.ok(files.includes("node_modules/@courtos/workflows/system.txt"), "the model contract is packed");

  // Nothing private: no case memory, no runs, no keys, no environment files.
  assert.deepEqual(files.filter(f => /(^|\/)\.courtos\/|(^|\/)\.env|\.(key|pem|crt)$/.test(f)), []);

  // Every bare import in the shipped code is a Node builtin or a declared dependency.
  const declared = new Set(Object.keys(pkg.dependencies));
  const builtin = new Set(builtinModules);
  for (const file of [...await sources("bin"), ...await sources("src")]) {
    const code = await readFile(file, "utf8");
    const statements = /^\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"'./][^"']*)["']|\b(?:import|require)\(\s*["']([^"'./][^"']*)["']/gm;
    for (const [, a, b] of code.matchAll(statements)) {
      const spec = a ?? b;
      const name = spec.startsWith("node:") ? null : spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/");
      assert.ok(name === null || declared.has(name) || builtin.has(name), `${file} imports ${spec}, which a fresh install would not have`);
    }
  }
});
