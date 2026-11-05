import { test } from "node:test";
import assert from "node:assert/strict";
import { debtsOf, simulate, wayOut } from "../src/plan.js";

// Worked by hand (2026-11-05): A $300 at 0 %, min $100; B $500 at 24 %, min $50; $200 a month.
const DEBTS = [{ id: "A", name: "A", balance: 300, apr: 0, min: 100 }, { id: "B", name: "B", balance: 500, apr: 24, min: 50 }];

test("avalanche pays the highest APR first, to the cent", () => {
  const s = simulate(DEBTS, 200, "avalanche");
  assert.equal(s.ok, true);
  assert.deepEqual(s.months.map((m) => m.balance.B), [410, 318.2, 224.56, 29.05, 0]);
  assert.deepEqual(s.months.map((m) => m.balance.A), [200, 100, 0, 0, 0]);
  assert.deepEqual(s.payoff_month, { A: 3, B: 5 });
  assert.equal(s.total_interest, 29.63);
});

test("snowball pays the smallest balance first and its minimum rolls over", () => {
  const s = simulate(DEBTS, 200, "snowball");
  assert.deepEqual(s.months.map((m) => m.balance.A), [150, 0, 0, 0, 0]);
  assert.deepEqual(s.months.map((m) => m.balance.B), [460, 419.2, 227.58, 32.13, 0]);
  assert.deepEqual(s.payoff_month, { A: 2, B: 5 });
  assert.equal(s.total_interest, 32.77);
});

test("custom order follows the list; a budget under the minimums is refused", () => {
  assert.deepEqual(simulate(DEBTS, 200, "custom", ["A", "B"]).payoff_month, { A: 2, B: 5 });
  assert.equal(simulate(DEBTS, 120, "avalanche").ok, false);
});

test("the book's terms line becomes the plan; a debt without terms is called out", () => {
  const book = { cards: [
    { section: "Cards (detail)", id: "L8", name: "Card", balance: 500, terms: { apr: 24, min_payment: 50 } },
    { section: "Loans", id: "N1", name: "Truck", balance: 300, terms: { apr: 0, min_payment: 100 } },
    { section: "Cards (detail)", id: "L4", name: "Store", balance: 80 },
    { section: "Cash", id: "A3", name: "Everyday", balance: 600 }],
    plan: { method: "avalanche", budget: 200 } };
  assert.deepEqual(debtsOf(book).map((d) => d.id), ["L8", "N1", "L4"]);
  const w = wayOut(book);
  assert.equal(w.missing.length, 1);
  assert.equal(w.methods.avalanche.months.length, 5);
  assert.equal(w.methods.avalanche.total_interest, 29.63);
});

import { readFileSync } from "node:fs";
test("index.html still loads the app after the vault (a merge on 2026-11-04 cut it off and the site could not unlock)", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const vaultEnd = html.indexOf("</script>", html.indexOf('<script id="vault"'));
  assert.ok(vaultEnd > 0, "vault script present");
  assert.match(html.slice(vaultEnd), /<script type="module" src="\.\/midas\.js"><\/script>\s*<\/body>\s*<\/html>\s*$/);
});
