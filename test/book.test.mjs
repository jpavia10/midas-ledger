import assert from "node:assert/strict";
import test from "node:test";
import { compositionHtml, floorTip, sparkHtml } from "../src/charts.js";
import { deskKey, readDesk, updateCard } from "../src/desk.js";
import { deviceHtml } from "../src/detail.js";
import { accountMatches, blankFilter, filterActive, filterSummary } from "../src/filter.js";
import { ledgerHtml } from "../src/ledger.js";

function memory() {
  const box = new Map();
  return {
    getItem: (key) => (box.has(key) ? box.get(key) : null),
    setItem: (key, value) => box.set(key, String(value))
  };
}

function book(banked = 4200) {
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

test("the open book exposes filters, account hooks, and charts", () => {
  const html = ledgerHtml(book());
  assert.match(html, /id="filters"/);
  assert.match(html, /id="q"/);
  assert.match(html, /data-filter-section="Cash"/);
  assert.match(html, /data-filter-section="Cards \(detail\)"/);
  assert.match(html, /data-filter-section="Loans"/);
  assert.match(html, /data-filter-section="Assets beyond cash"/);
  assert.match(html, /data-filter-mark="NEED YOU"/);
  assert.match(html, /data-filter-mark="STALE\?"/);
  assert.match(html, /data-filter-mark="HOLD"/);
  assert.match(html, /data-filter-pin/);
  assert.match(html, /data-filter-reset/);
  assert.match(html, /data-account/);
  assert.match(html, /data-chart="gauge"/);
  assert.match(html, /data-chart="stress"/);
  assert.match(html, /data-chart="floor"/);
  assert.match(html, /data-chart="revolving"/);
  assert.match(html, /data-banked="4200"/);
  assert.match(html, /data-floor="3000"/);
  assert.match(html, /data-score="500"/);
  assert.match(html, /data-score="380"/);
  assert.match(html, /data-open="history:0"/);
  assert.match(ledgerHtml(book(1000)), /data-banked="1000"/);
});

test("filters match section, mark, search, and pin", () => {
  const all = blankFilter();
  const alpha = { section: "Cards (detail)", id: "L8", name: "Alpha", marks: ["NEED YOU"] };
  const beta = { section: "Cards (detail)", id: "L10", name: "Beta <card>", marks: ["VERIFIED"] };
  const car = { section: "Loans", id: "N1", name: "Car", marks: ["STALE?"] };
  const house = { section: "Assets beyond cash", id: "A14", name: "House", marks: ["HOLD"] };
  assert.equal(accountMatches(beta, all, false), true);
  assert.equal(accountMatches(alpha, { ...all, section: "Cash" }, false), false);
  assert.equal(accountMatches(house, { ...all, section: "Assets beyond cash" }, false), true);
  assert.equal(accountMatches(alpha, { ...all, mark: "NEED YOU" }, false), true);
  assert.equal(accountMatches(beta, { ...all, mark: "NEED YOU" }, false), false);
  assert.equal(accountMatches(car, { ...all, mark: "STALE?" }, false), true);
  assert.equal(accountMatches(house, { ...all, mark: "HOLD" }, false), true);
  assert.equal(accountMatches(beta, { ...all, q: "l10" }, false), true);
  assert.equal(accountMatches(beta, { ...all, q: "<card>" }, false), true);
  assert.equal(accountMatches(alpha, { ...all, q: "checking" }, false), false);
  assert.equal(accountMatches(alpha, { ...all, pinned: true }, false), false);
  assert.equal(accountMatches(alpha, { ...all, pinned: true }, true), true);
  assert.equal(filterActive(all), false);
  assert.equal(filterActive({ ...all, q: " a " }), true);
  assert.equal(
    filterSummary({ ...all, section: "Loans", mark: "HOLD", pinned: true, q: "car" }, { shown: 1, total: 6 }),
    "Showing 1 of 6 · Loans · Hold · Pinned · “car”"
  );
});

test("charts use decrypted card numbers and no stand-in balances", () => {
  const html = compositionHtml(book().cards);
  const balances = [...html.matchAll(/data-balance="([^"]*)"/g)].map((match) => match[1]);
  assert.deepEqual(balances.slice().sort(), ["", "10", "3"]);
  assert.match(html, /Beta &lt;card&gt;/);
  assert.doesNotMatch(html, /<card>/);
  assert.doesNotMatch(html, /100\.5/);
  assert.doesNotMatch(html, /1,200/);
  assert.match(html, /see note/);
  const spark = sparkHtml(book().history);
  assert.match(spark, /data-score="500"/);
  assert.match(spark, /data-score="380"/);
  assert.match(spark, /Jan &quot;a&quot;/);
  assert.equal(floorTip(4200, 3000), "Spendable $4,200.00 · Floor $3,000.00 · Above floor by $1,200.00");
  assert.equal(floorTip(1000, 3000), "Spendable $1,000.00 · Floor $3,000.00 · Short $2,000.00");
  assert.equal(floorTip("", 3000), "");
  assert.equal(sparkHtml([{ when: "only", score: 1 }]), "");
});

test("device notes stay on the card and escape text", () => {
  const alpha = book().cards[1];
  const checking = book().cards[3];
  const html = deviceHtml(alpha, { note: "<b>x</b>", pin: true, reviewed: "2026-11-04T18:00:00.000Z" });
  assert.match(html, /On this device/);
  assert.match(html, /does not change the encrypted book/);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /Pinned/);
  assert.match(html, /data-act="copy" disabled/);
  assert.doesNotMatch(html, /data-copy=/);
  assert.match(html, /Reviewed on this device/);
  assert.doesNotMatch(html, /\$100\.50/);
  const cash = deviceHtml(checking, { note: "", pin: false, reviewed: "" });
  assert.match(cash, /data-copy="\$100\.50"/);
  assert.match(cash, /Not reviewed on this device/);
});

test("device desk is keyed by vault salt", () => {
  const store = memory();
  updateCard(store, "salt-a", "L8", { note: "a".repeat(2001), pin: true });
  const saved = readDesk(store, "salt-a").cards.L8;
  assert.equal(saved.note.length, 2000);
  assert.equal(saved.pin, true);
  assert.equal(readDesk(store, "salt-b").cards.L8, undefined);
  assert.equal(deskKey("salt-a"), "midasDesk:salt-a");
  assert.notEqual(deskKey("salt-a").startsWith("midasKey"), true);
  updateCard(store, "salt-a", "L8", { note: "", pin: false, reviewed: "" });
  assert.equal(readDesk(store, "salt-a").cards.L8, undefined);
});
