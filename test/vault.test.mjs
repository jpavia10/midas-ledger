import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { openVault } from "../src/ledger.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_CT_SHA256 = "5d5a2846bfd229c8bf83321842a95d11188d20fbb81d77640f80d76d16a6dfbc";

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
  assert.equal(vault.salt, "ZtyG1J7tTYY6xVeduFXL5g==");
  assert.equal(vault.iv, "YV0j65icNzdnG0vw");
  assert.equal(crypto.createHash("sha256").update(vault.ct).digest("hex"), EXPECTED_CT_SHA256);
  assert.equal(html.split(vault.salt).length - 1, 1);
  assert.equal(html.split("VAULT_JSON_HERE").length - 1, 0);
});

test("published book rejects a wrong password", { timeout: 60000 }, async () => {
  const { vault } = readVault();
  await assert.rejects(() => openVault(vault, "not-the-password"));
});
