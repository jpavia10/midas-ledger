import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { openVault } from "../src/ledger.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_CT_SHA256 = "ec56b55af8ef7b6185172a9682cec0cc0c8468062b47d5b5a12ed20e1873e2bc";

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
  assert.equal(vault.salt, "zwp1Y9ivvizrE56IVAL5Ww==");
  assert.equal(vault.iv, "Tp0wHOw3+vzStGEU");
  assert.equal(crypto.createHash("sha256").update(vault.ct).digest("hex"), EXPECTED_CT_SHA256);
  assert.equal(html.split(vault.salt).length - 1, 1);
  assert.equal(html.split("VAULT_JSON_HERE").length - 1, 0);
});

test("published book rejects a wrong password", { timeout: 60000 }, async () => {
  const { vault } = readVault();
  await assert.rejects(() => openVault(vault, "not-the-password"));
});
