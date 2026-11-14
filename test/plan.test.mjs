import { test } from "node:test";
import assert from "node:assert/strict";
import { debtsOf, forecastMortgage, mortgagePayoff, simulate, wayOut } from "../src/plan.js";
import { planHtml } from "../src/wayout.js";

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

test("a zero minimum is a real minimum and is not missing", () => {
  const book = { cards: [
    { section: "Cards (detail)", id: "L1", name: "Store", balance: 100, terms: { apr: 0, min_payment: 0 } },
  ] };
  const debt = debtsOf(book)[0];
  assert.equal(debt.missing, false);
  assert.equal(debt.min, 0);
  const plan = wayOut(book, 50);
  assert.equal(plan.methods.avalanche.ok, true);
  assert.equal(plan.methods.avalanche.payoff_month.L1, 2);
});

test("mortgage cash, interest, escrow and a held half-draft stay apart", () => {
  const debt = {
    id: "N3", name: "Mortgage", balance: 12000, mortgage: true,
    terms: { apr: 6, pi: 100, escrow: 40, draft: 70, frequency: "biweekly", extra_principal_policy: "unknown", asof: "2026-11-01", unapplied: "hold_until_full_payment" },
  };
  const two = forecastMortgage(debt, { drafts: 2 });
  assert.equal(two.posted, false);
  assert.equal(two.estimate, true);
  assert.equal(two.rows[0].applied, false);
  assert.equal(two.rows[0].cash_out, 70);
  assert.equal(two.rows[0].principal, 12000);
  assert.equal(two.rows[0].unapplied, 70);
  assert.equal(two.rows[0].statement_due_extra, 0);
  assert.equal(two.rows[1].applied, true);
  assert.equal(two.rows[1].interest, 60);
  assert.equal(two.rows[1].principal_paid, 40);
  assert.equal(two.rows[1].escrow, 40);
  assert.equal(two.rows[1].principal, 11960);
  assert.equal(two.rows[0].cash_out + two.rows[1].cash_out, 140);
  assert.notEqual(two.rows[0].cash_out + two.rows[1].cash_out, 280);
  assert.equal(two.accelerated_payoff, "conditional");
  const year = forecastMortgage(debt, { drafts: 24 });
  const extra = forecastMortgage(debt, { drafts: 26 });
  assert.equal(extra.rows.filter((row) => row.applied).length, 12);
  assert.equal(extra.principal, year.principal);
  assert.equal(extra.rows[24].conditional, true);
  assert.equal(extra.rows[24].principal, year.principal);
  const annual = forecastMortgage({ ...debt, terms: { ...debt.terms, extra_principal_policy: "annual" } }, { drafts: 26 });
  assert.equal(annual.rows.filter((row) => row.applied).length, 13);
  assert.ok(annual.principal < extra.principal);
  const page = planHtml({ cards: [{ ...debt, section: "Loans", kind: "mortgage" }], plan: { budget: 200 } });
  assert.match(page, /data-mortgage="N3"/);
  assert.match(page, /data-mortgage-posted="false"/);
  assert.match(page, /data-draft="1" data-applied="false"/);
  assert.match(page, /data-draft="2" data-applied="true"/);
  assert.match(page, /Deferred interest can apply/);
  const thin = mortgagePayoff({ ...debt, terms: { ...debt.terms, pi: null } });
  assert.equal(thin.ok, false);
  assert.equal(thin.payoff_month, null);
  assert.equal(thin.posted, false);
  assert.ok(thin.missing.includes("pi"));
});

import { readFileSync } from "node:fs";
test("index.html still loads the app after the vault (a merge on 2026-11-04 cut it off and the site could not unlock)", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const vaultEnd = html.indexOf("</script>", html.indexOf('<script id="vault"'));
  assert.ok(vaultEnd > 0, "vault script present");
  assert.match(html.slice(vaultEnd), /<script type="module" src="\.\/midas\.js"><\/script>\s*<\/body>\s*<\/html>\s*$/);
});
