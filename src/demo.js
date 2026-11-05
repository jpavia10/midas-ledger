/* Fictional book for localhost ?hud=1. Not the encrypted ledger. */

export function demoBook() {
  return {
    built_pt: "2026-11-04 00:00 PT",
    plan: { method: "avalanche", budget: 520 },
    ledger_update: "preview",
    headline: { stress: 462, banked: 1804, spendable: 842.16, floor: 3000, revolving: 2410.4 },
    history: [
      { when: "Aug", score: 710 },
      { when: "Sep", score: 640 },
      { when: "Oct", score: 580 },
      { when: "Nov", score: 462 }
    ],
    cards: [
      { section: "Cash", id: "A3", name: "Everyday", balance: 642.16, available: 642.16, current: 1902.16, marks: ["VERIFIED"], asof: "2026-11-03", source: "plaid", prev: null, lines: ["available is spendable"], holds: [{ memo: "Valon ACH", amount: 400 }, { memo: "Citi ACH", amount: 25 }] },
      { section: "Cash", id: "A1", name: "Sink", balance: 200, available: 200, current: 260, marks: ["VERIFIED"], asof: "2026-11-03", source: "plaid", prev: null, lines: [] },
      { section: "Cash", id: "A9", name: "Old jar", balance: 9999, marks: ["STALE?"], asof: "2026-01-01", source: "note", prev: null, lines: ["do not spend this"] },
      { section: "Cards (detail)", id: "L8", name: "Alpha card", balance: 640, marks: ["VERIFIED"], asof: "2026-11-01", source: "plaid", prev: null, lines: [], terms: { apr: 27.99, min_payment: 35, due_day: 14, credit_limit: 1000, asof: "2026-10-28" } },
      { section: "Cards (detail)", id: "L6", name: "Beta card", balance: 410.4, marks: ["VERIFIED"], asof: "2026-11-01", source: "plaid", prev: null, lines: [], terms: { apr: 0, min_payment: 25, due_day: 3, credit_limit: 2000, promo_apr: 0, promo_end: "2027-03-31", asof: "2026-10-20" } },
      { section: "Cards (detail)", id: "L10", name: "Gamma", balance: 220, marks: ["HOLD"], asof: "2026-10-02", source: "card", prev: null, lines: [], terms: { apr: 22.9, min_payment: 25, due_day: 21, credit_limit: 500, asof: "2026-10-02" } },
      { section: "Cards (detail)", id: "L4", name: "Store card", balance: null, marks: ["NEED YOU"], asof: "", source: "note", prev: 80, lines: ["statement missing"] },
      { section: "Loans", id: "N1", name: "Truck", balance: 8400, marks: ["PAST DUE"], asof: "2026-08-01", source: "note", prev: null, lines: ["past due"], terms: { apr: 9.5, min_payment: 285, due_day: 1, asof: "2026-08-01" } },
      { section: "Assets beyond cash", id: "A14", name: "House", balance: 12000, marks: ["HOLD"], asof: "", source: "note", prev: null, lines: ["never"] }
    ],
    sections: [
      { title: "Cash flow (Plaid)", body: "Structured months live on Flow. This page is the written ledger." },
      { title: "Notes", body: "Preview numbers are fictional." }
    ],
    log: ["2026-11-03 v40 preview stress 580 → 462"],
    liquid: {
      avail: 842.16,
      current: 2162.16,
      holds: [
        { acct: "A3", name: "Everyday", amount: 400, memo: "ACH HOLD Valon" },
        { acct: "A3", name: "Everyday", amount: 25, memo: "ACH HOLD Citi autopay" }
      ],
      by_acct: [
        { id: "A3", name: "Everyday", avail: 642.16, current: 1902.16, plaid: true },
        { id: "A1", name: "Sink", avail: 200, current: 260, plaid: true }
      ]
    },
    cashflow: {
      window: "2026-09-01..2026-11-03",
      source: "preview",
      months: [
        { id: "2026-09", label: "Sep", stub: false, income: 3200, other_in: 140, lifestyle: 1800, debt: 900, fees: 40, atm: 60, net: 540 },
        { id: "2026-10", label: "Oct", stub: false, income: 4100, other_in: 80, lifestyle: 2100, debt: 2400, fees: 55, atm: 100, net: -475 },
        { id: "2026-11", label: "Nov", stub: true, income: 0, other_in: 40, lifestyle: 220, debt: 300, fees: 0, atm: 0, net: -480 }
      ]
    },
    categories: {
      months: [{
        id: "2026-10",
        label: "Oct",
        stub: false,
        burn: 2100,
        items: [
          { name: "General merch", amount: 900 },
          { name: "Food & drink", amount: 480 },
          { name: "Gas/transport", amount: 360 },
          { name: "Utilities", amount: 240 },
          { name: "Services", amount: 120 }
        ]
      }]
    },
    utilities: {
      providers: [
        { id: "gas_socal", name: "SoCal Gas" },
        { id: "electric_sce", name: "SCE" },
        { id: "water_frazier_park", name: "Frazier Park" },
        { id: "internet_starlink", name: "Starlink" }
      ],
      months: [
        { id: "2026-09", label: "Sep", stub: false, providers: { gas_socal: 40, electric_sce: 150, water_frazier_park: 90, internet_starlink: 80 }, total: 360, cumulative: 360 },
        { id: "2026-10", label: "Oct", stub: false, providers: { gas_socal: 48, electric_sce: 170, water_frazier_park: 100, internet_starlink: 80 }, total: 398, cumulative: 758 },
        { id: "2026-11", label: "Nov", stub: true, providers: { gas_socal: 42 }, total: 42, cumulative: 800 }
      ]
    },
    networth: {
      snapshots: [
        { when: "2026-08-01", assets: 14000, liabilities: 12000, net: 2000, source: "sidecar" },
        { when: "2026-09-01", assets: 14800, liabilities: 11800, net: 3000, source: "log" },
        { when: "2026-10-01", assets: 15200, liabilities: 12100, net: 3100, source: "log" },
        { when: "2026-11-03", assets: 13642, liabilities: 10810, net: 2832, source: "book" }
      ]
    },
    stale: [
      { id: "A9", name: "Old jar", section: "Cash", marks: ["STALE?"], status: "STALE?" },
      { id: "L4", name: "Store card", section: "Cards (detail)", marks: ["NEED YOU"], status: "NEED YOU" },
      { id: "N1", name: "Truck", section: "Loans", marks: ["PAST DUE"], status: "PAST DUE" }
    ]
  };
}
