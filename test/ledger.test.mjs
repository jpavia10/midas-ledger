import assert from "node:assert/strict";
import test from "node:test";
import { b64, dec, ledgerHtml, openVault, rememberedRecord } from "../src/ledger.js";

function b64e(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fixture(banked = 4200) {
  return {
    built_pt: "2026-10-19 15:54 PT",
    ledger_update: "2026-10-19",
    headline: { stress: banked === 4200 ? 380 : 600, banked, floor: 3000, revolving: 1200.5 },
    history: [
      { when: 'Jan "a"', score: 500 },
      { when: "Feb", score: 380 }
    ],
    cards: [
      { section: "Cards (detail)", id: "L10", name: "Beta <card>", balance: 10, marks: ["VERIFIED"], asof: "Oct", source: "card", prev: null, lines: ["ok"] },
      { section: "Cards (detail)", id: "L8", name: "Alpha", balance: null, marks: ["NEED YOU"], asof: "", source: "note", prev: 5, lines: ["call them"] },
      { section: "Cards (detail)", id: "L13", name: "Hold me", balance: 3, marks: ["HOLD", "STALE?"], asof: "Sep", source: "card", prev: null, lines: [] },
      { section: "Cash", id: "C1", name: "Checking", balance: 100.5, marks: [], asof: "Oct", source: "bank", prev: null, lines: [] },
      { section: "Assets beyond cash", id: "A14", name: "House", balance: 1, marks: ["HOLD"], asof: "", source: "note", prev: null, lines: ["never"] },
      { section: "Loans", id: "N1", name: "Car", balance: 50, marks: ["STALE?"], asof: "", source: "card", prev: null, lines: ["old"] }
    ],
    sections: [{ title: "Notes <x>", body: "hello & bye" }],
    log: ["line <1>", "line 2"]
  };
}

test("ledger html keeps the book and escapes text", () => {
  const html = ledgerHtml(fixture());
  const cards = html.slice(html.indexOf('id="cards"'), html.indexOf('id="cash"'));
  const attention = html.slice(html.indexOf('id="attention"'), html.indexOf('id="cards"'));
  assert.ok(cards.indexOf("Alpha") < cards.indexOf("Beta"));
  assert.ok(cards.indexOf("Beta") < cards.indexOf("Hold me"));
  assert.match(cards, /Phase 1/);
  assert.match(cards, /Phase 2/);
  assert.match(cards, /0% autopay|Hold/);
  assert.match(html, /Beta &lt;card&gt;/);
  assert.doesNotMatch(html, /<card>/);
  assert.match(html, /see note/);
  assert.match(html, /· from note/);
  assert.match(html, /card said \$5\.00/);
  assert.match(html, /\$4,200\.00/);
  assert.match(html, /\$100\.50/);
  assert.match(html, /\$1,200\.50/);
  assert.match(html, /Above floor by \$1,200\.00/);
  assert.match(html, /#d5e2cf/);
  assert.match(html, /380/);
  assert.match(html, /2 points · dashed line = goal 400/);
  assert.match(attention, /Alpha/);
  assert.match(attention, /Hold me/);
  assert.match(attention, /Car/);
  assert.doesNotMatch(attention, /Beta/);
  assert.match(html, /HOLD · never sell/);
  assert.match(html, /Notes &lt;x&gt;/);
  assert.match(html, /hello &amp; bye/);
  assert.match(html, /line &lt;1&gt;/);
  assert.match(html, /Lock &amp; forget device/);
  assert.match(html, /Jan &quot;a&quot;/);
  assert.match(html, /Built 2026-10-19 15:54 PT/);
});

test("short of the floor uses the warm bar", () => {
  const html = ledgerHtml(fixture(1000));
  assert.match(html, /Short \$2,000\.00/);
  assert.match(html, /#e4c48a/);
  assert.match(html, /#e3a598/);
});

test("round trip matches the remembered-key format", async () => {
  const password = "roundtrip";
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const vault = {
    v: 1,
    iter: 1000,
    salt: b64e(salt),
    iv: b64e(iv),
    ct: ""
  };
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: vault.iter },
    base,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const plain = new TextEncoder().encode(JSON.stringify({ ok: true, n: 2 }));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  vault.ct = b64e(ct);

  const opened = await openVault(vault, password);
  assert.equal(opened.data.n, 2);
  const record = await rememberedRecord(vault, opened.key);
  assert.equal(record.salt, vault.salt);
  const key2 = await crypto.subtle.importKey("raw", b64(record.k), "AES-GCM", false, ["decrypt"]);
  const again = await dec(vault, key2);
  assert.equal(again.ok, true);
  await assert.rejects(() => openVault(vault, "nope"));
});
