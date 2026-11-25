// Midas v4 (2026-11-25): the arithmetic on Today and what Midas shares with the other pillars.
import { test } from "node:test";
import assert from "node:assert/strict";
import { attention, bookDues, monthDays, owed, safeToSpend } from "../src/today.js";
import { summary } from "../src/share.js";
import { wayOut } from "../src/plan.js";
import { positionFromCards } from "../src/charts.js";

const book = () => ({
  headline: { floor: 1000, spendable: 5000 },
  liquid: { avail: 2500 },
  cards: [
    { section: "Cards (detail)", id: "L1", name: "Visa", balance: 900, marks: ["VERIFIED"], terms: { apr: 24, min_payment: 40, due_day: 31, credit_limit: 3000 } },
    { section: "Cards (detail)", id: "L2", name: "Store", balance: 30, marks: [], terms: { apr: 20, min_payment: 35, due_day: 5, credit_limit: 1000 } },
    { section: "Cards (detail)", id: "L3", name: "Paid off", balance: 0, marks: [], terms: { apr: 20, min_payment: 25, due_day: 10 } },
    { section: "Loans", id: "N1", name: "Car", balance: 4000, kind: "installment", marks: ["PAST DUE"], asof: "2026-10-01", terms: { apr: 7, min_payment: 300, due_day: 20 } },
    { section: "Loans", id: "N3", name: "Mortgage", balance: 200000, kind: "mortgage", marks: [], terms: { apr: 6, pi: 1200, escrow: 400, due_day: 1 } },
    { section: "Cash", id: "A1", name: "Checking", balance: 2500, marks: [] },
  ],
});

test("a due day past the month's end is that month's last day; dates stay inside the window", () => {
  assert.deepEqual(monthDays(31, "2027-02-01", "2027-04-30"), ["2027-02-28", "2027-03-31", "2027-04-30"]);
  assert.deepEqual(monthDays(5, "2026-11-25", "2026-12-09"), ["2026-12-05"]);
});

test("the book's dues: each minimum on its day, never more than the balance, nothing for a paid-off card; the mortgage is P&I plus escrow", () => {
  const d = bookDues(book(), "2026-11-25", "2026-12-09");
  assert.deepEqual(d.map((x) => [x.date, x.name, x.amount]), [["2026-11-30", "Visa", 40], ["2026-12-05", "Store", 30], ["2026-12-01", "Mortgage", 1600]]);
});

test("safe to spend = available − due before payday − floor; without a payday the window is 14 days", () => {
  const bills = [{ id: "b", name: "Power", amount: 120, every: "month", anchor: "2026-12-02", kind: "bill" }];
  const s = safeToSpend(book(), { today: "2026-11-25", bills });
  assert.equal(s.spendable, 2500);                                   // Plaid available, not the headline's other figure
  assert.equal(s.until, "2026-12-09");
  assert.equal(s.dueSum, 40 + 30 + 1600 + 120);
  assert.equal(s.safe, 0); assert.equal(s.short, 1000 - (2500 - 1790));
  const paid = safeToSpend(book(), { today: "2026-11-25", bills, atlas: { nextPay: { date: "2026-12-01", net: 2100 } } });
  assert.equal(paid.until, "2026-11-30"); assert.equal(paid.payday.net, 2100);
  assert.equal(paid.dueSum, 40);                                     // only what falls before payday
  assert.equal(paid.safe, 2500 - 40 - 1000);
});

test("owed splits cards, loans and the mortgage the way the plan does; credit used counts card limits only", () => {
  const o = owed(book());
  assert.equal(o.cards, 930); assert.equal(o.loans, 4000); assert.equal(o.mortgage, 200000); assert.equal(o.plan, 4930);
  assert.equal(Math.round(o.utilization * 1000), Math.round((930 / 4000) * 1000));
});

test("needs you: past due first, with what to do; a promo ending soon is called out", () => {
  const b = book(); b.cards[0].terms.promo_end = "2027-01-15"; b.cards[0].terms.promo_apr = 0; b.cards[0].terms.deferred = true;
  const a = attention(b, "2026-11-25");
  assert.equal(a[0].mark, "PAST DUE"); assert.match(a[0].what, /Pay it or call/);
  assert.ok(a.some((x) => x.mark === "PROMO" && /deferred interest/.test(x.what)));
});

test("the shared summary carries totals and dates only", () => {
  const b = book(), st = safeToSpend(b, { today: "2026-11-25" });
  const s = summary({ book: b, safe: st, owe: owed(b), way: wayOut(b), worth: positionFromCards(b), now: new Date("2026-11-25T12:00:00Z") });
  assert.equal(s.v, 1); assert.equal(s.owed.plan, 4930); assert.ok(s.dues.length >= 2);
  const text = JSON.stringify(s);
  assert.doesNotMatch(text, /terms|lines|marks|credit_limit/);
  assert.ok(s.debtFree && /\d{4}$/.test(s.debtFree.month));
});
