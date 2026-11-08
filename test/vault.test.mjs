import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { openVault } from "../src/ledger.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_CT_SHA256 = "d6ca6c87732acb6b549c1602cea8b655497307ff0067346571eb462872f17d4d";

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
  assert.equal(vault.salt, "jVEGCzs1IxBDj4FgYL2XOg==");
  assert.equal(vault.iv, "nUlsuIH5cHZET8Pl");
  assert.equal(crypto.createHash("sha256").update(vault.ct).digest("hex"), EXPECTED_CT_SHA256);
  assert.equal(html.split(vault.salt).length - 1, 1);
  assert.equal(html.split("VAULT_JSON_HERE").length - 1, 0);
});

test("published book rejects a wrong password", { timeout: 60000 }, async () => {
  const { vault } = readVault();
  await assert.rejects(() => openVault(vault, "not-the-password"));
});
