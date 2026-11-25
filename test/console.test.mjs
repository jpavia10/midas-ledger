// The hub's Payoff Console folded into Midas (2026-11-25): the windfall, the recurring charges, the library's math and the worked cases.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { simulate, windfall } from "../src/plan.js";
import { burn, chargeDates, cleanBill, nextDue, readHub, upcoming, writeHub, HUB_KEY } from "../src/bills.js";
import { deferredExample, evalFormula, minimumTrap } from "../src/library.js";
import { checkCase } from "../src/console.js";

const DEBTS = [{ id: "A", name: "A", balance: 300, apr: 0, min: 100 }, { id: "B", name: "B", balance: 500, apr: 24, min: 50 }];

test("a windfall lands in the method's own order, each debt up to its balance", () => {
  assert.deepEqual(windfall(DEBTS, 600, "avalanche").lands, { B: 500, A: 100 });
  assert.deepEqual(windfall(DEBTS, 600, "snowball").lands, { A: 300, B: 300 });
  assert.deepEqual(windfall(DEBTS, 100, "custom", ["A", "B"]).lands, { A: 100 });
  const w = windfall(DEBTS, 1000, "avalanche"); assert.equal(w.left, 200); assert.ok(w.debts.every((d) => d.balance === 0));
  const before = simulate(DEBTS, 200, "avalanche"), after = simulate(windfall(DEBTS, 250, "avalanche").debts, 200, "avalanche");
  assert.ok(after.months.length < before.months.length && after.total_interest < before.total_interest);
});

test("all twelve worked cases match Midas's engine to the cent", () => {
  const cs = JSON.parse(fs.readFileSync(new URL("../data/payoff-cases.json", import.meta.url), "utf8"));
  assert.equal(cs.length, 12);
  for (const c of cs) { const k = checkCase(c); assert.ok(k.same, `case ${c.case}: ${k.bad} of ${k.n} differ`); }
});

test("charges fall on the hub's calendar: weekly steps, and no 31st in a 30-day month", () => {
  assert.deepEqual(chargeDates({ anchor: "2026-01-31", every: "month" }, "2026-01-01", "2026-05-31"), ["2026-01-31", "2026-03-31", "2026-05-31"]);
  assert.deepEqual(chargeDates({ anchor: "2026-11-02", every: "2weeks" }, "2026-11-20", "2026-12-31"), ["2026-11-30", "2026-12-14", "2026-12-28"]);
  assert.equal(nextDue({ anchor: "2025-03-15", every: "year" }, "2026-11-25"), "2027-03-15");
  assert.equal(nextDue({ anchor: "2026-12-01", every: "quarter" }, "2026-11-25"), "2026-12-01");
  const list = upcoming([{ name: "Rent", amount: 1200, anchor: "2026-12-01", every: "month" }, { name: "Gym", amount: 30, anchor: "2026-11-27", every: "week" }], "2026-11-25", 14);
  assert.deepEqual(list.map((r) => r.date + " " + r.bill.name), ["2026-11-27 Gym", "2026-12-01 Rent", "2026-12-04 Gym"]);
});

test("the burn: a month, a year, subscriptions by their yearly cost", () => {
  const b = burn([{ amount: 100, every: "month" }, { amount: 120, every: "year", kind: "sub", name: "X" }, { amount: 10, every: "month", kind: "sub", name: "Y" }]);
  assert.equal(Math.round(b.monthly * 100) / 100, 120); assert.equal(Math.round(b.yearly), 1440);
  assert.deepEqual(b.subs.map((s) => s.name), ["X", "Y"]);
});

test("the hub's slice is read and written in its own envelope, other fields kept; a newer schema is left alone", () => {
  const mem = new Map(); const ls = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  assert.equal(readHub(ls).found, false);
  mem.set(HUB_KEY, JSON.stringify({ schema: 1, saved: "x", data: { plan: { debts: [] }, events: [{ id: "e" }], bills: [], seen: { pct: 25 }, extraField: 7 } }));
  const h = readHub(ls); assert.equal(h.writable, true);
  h.data.bills.push(cleanBill({ name: " Water ", amount: "41.5", every: "month", anchor: "2026-12-03", kind: "bill" }, "b1"));
  writeHub(ls, h.data); const o = JSON.parse(mem.get(HUB_KEY));
  assert.equal(o.schema, 1); assert.equal(o.data.extraField, 7); assert.deepEqual(o.data.seen, { pct: 25 }); assert.equal(o.data.events.length, 1);
  assert.deepEqual(o.data.bills[0], { id: "b1", name: "Water", amount: 41.5, every: "month", anchor: "2026-12-03", kind: "bill", autopay: false });
  mem.set(HUB_KEY, JSON.stringify({ schema: 2, data: { bills: [] } })); assert.equal(readHub(ls).writable, false);
  assert.equal(cleanBill({ name: "", amount: 1, anchor: "2026-12-03" }), null); assert.equal(cleanBill({ name: "A", amount: 1, anchor: "soon" }), null);
});

test("the formula reader and the minimum trap", () => {
  assert.equal(evalFormula("B < 40 ? B : min(B, max(40, 0.02*(B - F), 0.01*(B - I - F) + I) + F)", { B: 1000, I: 20, F: 0 }), 40);
  assert.equal(evalFormula("max(25, 0.01*B + I)", { B: 5000, I: 100 }), 150);
  assert.throws(() => evalFormula("alert(1)", { B: 1 }));
  const r = minimumTrap({ balance: 5000, apr: 24.99, formula: "max(25, 0.01*B + I)" });
  assert.equal(r.stalled, false); assert.ok(r.months > 100 && r.interestC > 300000);
  assert.equal(minimumTrap({ balance: 5000, apr: 30, formula: "10" }).stalled, true);
});

test("deferred interest bills back to day one only when a balance is left", () => {
  const left = deferredExample({ amount: 2400, apr: 29.99, months: 12, payment: 150 });
  assert.ok(left.leftC > 0 && left.deferredChargeC > 0);
  const paid = deferredExample({ amount: 2400, apr: 29.99, months: 12, payment: 200 });
  assert.equal(paid.leftC, 0); assert.equal(paid.deferredChargeC, 0); assert.equal(paid.payInFullEvery, 200);
});
