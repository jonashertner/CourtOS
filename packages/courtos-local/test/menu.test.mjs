// The menu-bar apps (macOS, Windows) take their texts from src/menu.json, in the interface language.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MENU, messages } from "../src/terminal.mjs";

const source = (path) => readFile(new URL(`../installer/${path}`, import.meta.url), "utf8");
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

test("every menu text exists in German, French, Italian and English, with the same placeholders", () => {
  assert.deepEqual(Object.keys(MENU), ["de", "fr", "it", "en"]);
  for (const language of ["fr", "it", "en"]) {
    assert.deepEqual(Object.keys(MENU[language]), Object.keys(MENU.de), `the keys in ${language}`);
    for (const [key, text] of Object.entries(MENU[language])) {
      assert.ok(text.trim(), `${language}.${key} is empty`);
      assert.deepEqual(placeholders(text), placeholders(MENU.de[key]), `${language}.${key}`);
    }
  }
});

test("both apps show only texts from menu.json, which the installed package contains", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.ok(pkg.files.includes("src/"), "menu.json is in the package the installers bundle");
  for (const [path, call, add] of [["macos/CourtOS.swift", "Strings.t", "add(menu, "], ["windows/CourtOS.cs", "Strings.T", "Add(menu, "]]) {
    const code = await source(path);
    assert.match(code, /app[/"].*node_modules.*@courtos.*local.*src.*menu\.json/, `${path} reads the bundled menu.json`);
    const keys = [...code.matchAll(new RegExp(`${call.replace(".", "\\.")}\\(([^)]*)\\)`, "g"))].flatMap(m => [...m[1].matchAll(/"(\w+)"/g)].map(k => k[1]))
      .concat([...code.matchAll(new RegExp(`${add.replace("(", "\\(")}"(\\w+)"`, "g"))].map(m => m[1]));
    const known = new Set([...Object.keys(MENU.de), "port", "name"]);
    for (const key of keys) assert.ok(known.has(key), `${path} uses an unknown text: ${key}`);
    for (const key of ["open", "quit", "certificate", "busy", "running", "stopped", "startFailed", "crashed", "portBusy"]) assert.ok(keys.includes(key), `${path} shows ${key}`);
    // Dialogs and menu items take a key, never a German sentence.
    assert.doesNotMatch(code, /\b(?:inform|confirm|Inform|Ask|Fail|add|Add)\((?:menu, )?\$?"[^"]*[äöü ]/, `${path} has a literal text in a dialog or menu`);
    assert.match(code, /Strings\.language = Strings\.chosenLanguage\(\)|Strings\.Language = Strings\.Chosen\(\)/, `${path} follows a language change`);
  }
});

test("the terminal names the certificate menu item as the menu shows it", () => {
  assert.equal(messages("de")("certApp"), "Für Word im CourtOS-Menü „Zertifikat für Word einrichten …“ wählen.");
  assert.match(messages("fr")("certApp"), /« Configurer le certificat pour Word … »/);
  assert.match(messages("it")("certApp"), /«Configurare il certificato per Word …»/);
  assert.match(messages("en")("certApp"), /“Set up the certificate for Word …”/);
});
