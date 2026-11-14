import assert from "node:assert/strict";
import test from "node:test";
import { flowChartsHtml, positionFromCards } from "../src/charts.js";
import { ledgerHtml } from "../src/ledger.js";

function book() {
  return {
    built_pt: "2026-11-04 00:00 PT",
    ledger_update: "2026-11-04",
    headline: { stress: 510, banked: 1804, floor: 3000, revolving: 900 },
    history: [
      { when: "Oct", score: 600 },
      { when: "Nov", score: 510 }
    ],
    cards: [
      { section: "Cash", id: "A3", name: "Checking", balance: 420.5, available: 420.5, current: 1735.87, marks: ["VERIFIED"], asof: "Nov", source: "plaid", prev: null, lines: [] },
      { section: "Cards (detail)", id: "L8", name: "Alpha", balance: null, marks: ["NEED YOU"], asof: "", source: "note", prev: 5, lines: ["call them"] },
      { section: "Loans", id: "N1", name: "Car", balance: 9999, marks: ["STALE?"], asof: "", source: "card", prev: null, lines: [] }
    ],
    sections: [{ title: "Cash flow", body: "kept as a page" }],
    log: ["line"],
    liquid: {
      avail: 420.5,
      current: 1735.87,
      holds: [{ acct: "A3", name: "Checking", amount: 1260.96, memo: "ACH HOLD Valon Payment" }],
      by_acct: [{ id: "A3", avail: 420.5, current: 1735.87 }]
    },
    cashflow: {
      window: "2026-10-01..2026-11-03",
      source: "Finance/Plaid",
      months: [
        { id: "2026-10", label: "Oct", stub: false, income: 100, other_in: 10, lifestyle: 40, debt: 30, fees: 5, atm: 2, net: 33 },
        { id: "2026-11", label: "Nov", stub: true, income: 0, other_in: 5, lifestyle: 6, debt: 7, fees: 0, atm: 0, net: -8 }
      ]
    },
    categories: {
      months: [{ id: "2026-10", label: "Oct", stub: false, burn: 40, items: [{ name: "Food & drink", amount: 22 }, { name: "Gas/transport", amount: 18 }] }]
    },
    utilities: {
      providers: [{ id: "gas_socal", name: "SoCal Gas" }, { id: "electric_sce", name: "SCE" }],
      months: [
        { id: "2026-10", label: "Oct", stub: false, providers: { gas_socal: 4, electric_sce: 6 }, total: 10, cumulative: 10 },
        { id: "2026-11", label: "Nov", stub: true, providers: { gas_socal: 1 }, total: 1, cumulative: 11 }
      ]
    },
    networth: {
      snapshots: [
        { when: "2026-08-01", assets: 1000, liabilities: 400, net: 600 },
        { when: "2026-11-01", assets: 1100, liabilities: 500, net: 600 }
      ]
    },
    stale: [{ id: "N1", name: "Car", marks: ["STALE?"] }]
  };
}

test("home uses spendable available and lists holds", () => {
  const html = ledgerHtml(book());
  assert.match(html, /Spendable available/);
  assert.match(html, /data-banked="420.5"/);
  assert.match(html, /\$420\.50/);
  assert.match(html, /ACH HOLD Valon Payment/);
  assert.match(html, /data-tab-panel="flow"/);
  assert.match(html, /data-tab-panel="accounts"/);
  assert.match(html, /data-tab-panel="debt"/);
  assert.match(html, /data-tab-panel="book"/);
  assert.doesNotMatch(html, /data-banked="1804"/);
});

test("flow charts read structured months, categories, utilities, and net worth", () => {
  const html = flowChartsHtml(book());
  assert.match(html, /data-flow-month="2026-10"/);
  assert.match(html, /data-flow-income="110"/);
  assert.match(html, /data-flow-spend="77"/);
  assert.match(html, /data-flow-net="33"/);
  assert.match(html, /data-flow-month="2026-11"/);
  assert.match(html, /data-cat="Food &amp; drink"/);
  assert.match(html, /data-amount="22"/);
  assert.match(html, /Burn \$40\.00/);
  assert.match(html, /SoCal Gas/);
  assert.match(html, /data-util-cum="11"/);
  assert.match(html, /data-nw="2026-08-01"/);
  assert.match(html, /data-net="600"/);
  const position = positionFromCards(book());
  assert.equal(position.assets, 420.5);
  assert.equal(position.liabilities, 900);
  assert.equal(position.status, "COMPLETE");
  const gross = positionFromCards({
    headline: { revolving: 100, revolving_projected: 80 },
    cards: [
      { section: "Assets beyond cash", id: "A8", name: "Home", balance: 200, gross: 200, equity: 50, marks: [] },
      { section: "Assets beyond cash", id: "A7e", name: "ESOP", balance: null, unknown: true, marks: [] },
      { section: "Loans", id: "N3", name: "Mortgage", balance: 150, kind: "mortgage", marks: [] },
      { section: "Cards (detail)", id: "L9", name: "Flex plan", balance: 40, kind: "installment", marks: [] },
    ],
  });
  assert.equal(gross.assets, 200);
  assert.equal(gross.liabilities, 290);
  assert.equal(gross.status, "INCOMPLETE");
  assert.ok(gross.missing.includes("ESOP"));
  const incomplete = flowChartsHtml({
    ...book(),
    headline: { ...book().headline, revolving_projected: 400 },
    cards: book().cards.concat([{ section: "Assets beyond cash", id: "A7e", name: "ESOP", balance: null, unknown: true, marks: [] }]),
  });
  assert.match(incomplete, /data-nw-status="INCOMPLETE"/);
  assert.match(incomplete, /Pending payoff/);
});
