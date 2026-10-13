// The macOS and Windows installers: what a tester sees before CourtOS runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../installer/${path}`, import.meta.url), "utf8");

test("the macOS package has a title, so the Installer reads \"Install CourtOS\"", async () => {
  const build = await source("macos/build.sh");
  assert.match(build, /<title>CourtOS<\/title>/);
  assert.match(build, /productbuild[^\n]*--distribution "\$build\/distribution\.xml"/);
  assert.doesNotMatch(build, /productbuild[^\n]*--package "\$build\/CourtOS-component\.pkg"[^\n]*"\$out"/, "a package built without the distribution has no title");
});

test("a start by hand offers the secure connection again until it is set up, a start at login never", async () => {
  for (const path of ["macos/CourtOS.swift", "windows/CourtOS.cs"]) {
    const code = await source(path);
    assert.doesNotMatch(code, /CertificateOffered/, `${path} offers the certificate only once`);
    assert.match(code, /certificates == nil && !atLogin|certificates == null && !atLogin/, `${path} asks on a start by hand only`);
  }
});
