import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { openVault } from "../src/ledger.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_CT_SHA256 = "e43638382d511e4a22030473ea51b553c10861354d2ae2e7d1a9ea23d3c28fe5";

function readVault() {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const match = html.match(/<script id="vault" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match, "vault script missing");
  const vault = JSON.parse(match[1]);
  return { html, vault };
}

test("published ciphertext is intact", () => {
  const { html, vault } = readVault();
  assert.equal(vault.v, 1);
  assert.equal(vault.iter, 600000);
  assert.equal(vault.salt, "muCzBp2ZJqUIJPCMZDIXFw==");
  assert.equal(vault.iv, "wYKzwFcGQqR9lULm");
  assert.equal(crypto.createHash("sha256").update(vault.ct).digest("hex"), EXPECTED_CT_SHA256);
  assert.equal(html.split(vault.salt).length - 1, 1);
  assert.equal(html.split("VAULT_JSON_HERE").length - 1, 0);
});

test("published book rejects a wrong password", { timeout: 60000 }, async () => {
  const { vault } = readVault();
  await assert.rejects(() => openVault(vault, "not-the-password"));
});
