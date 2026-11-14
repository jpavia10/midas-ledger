"""Data contract for build.py. Plaintext fixtures only — never a real ledger."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build  # noqa: E402


LEDGER = """
Update: 2026-11-03
Floor goal: **$3,000.00**

## Cash
### A3 · Everyday checking — VERIFIED PLAID 2026-11-03
- harvest **$1,804.00**
- available **$420.50**
- current **$1,735.87**
- ACH HOLD Valon Payment **$1,260.96**
- ACH HOLD CITI AUTOPAY **$54.41**
### A1 · Sink — VERIFIED 2026-11-03
- available **$25.00**
- current **$80.00**
### A9 · Old jar — STALE? 2026-01-01
- available **$999.00**

## Cards (detail)
### L4 · Home Depot — NEED YOU
- last statement **$300.00**
### L8 · Cleared card — VERIFIED PLAID 2026-11-03
- available **$10.00**

## Loans
### N2 · Truck — PAST DUE 2026-08-01
- balance **$4,000.00**

## Assets beyond cash
### A2 · Brokerage — VERIFIED 2026-10-01
- **$50.00**

## Cash flow (Plaid)
window: 2026-10-01..2026-12-31

### 2026-10 Oct

| Line | Amount |
| --- | ---: |
| Payroll income | 100.00 |
| Other in | 10.00 |
| Lifestyle spend | 40.00 |
| Debt service | 30.00 |
| Interest/fees | 5.00 |
| Cash/ATM | 2.00 |

| Category | Amount |
| --- | ---: |
| Food & drink | 22.00 |
| Gas/transport | 18.00 |

### 2026-12 Dec

| Line | Amount |
| --- | ---: |
| Payroll income | 80.00 |
| Other in | 0 |
| Lifestyle spend | 10.00 |
| Debt service | 0 |
| Interest/fees | 0 |
| Cash/ATM | 0 |
| Net | 70.00 |

## Utilities over time

| Month | SoCal Gas | SCE | Frazier Park | Starlink |
| --- | ---: | ---: | ---: | ---: |
| 2026-10 Oct | 4.00 | 6.00 | 1.00 | 2.00 |
| 2026-12 Dec | 3.00 | 0 | 0 | 0 |

## Net worth

| When | Assets | Liabilities | Net |
| --- | ---: | ---: | ---: |
| 2026-07-01 | 1000.00 | 400.00 | 600.00 |

## Recent log
- 2026-05-01 v1 harvest revolving $9,000 · A3 harvest $1,804.00 · banked $1,804.00 stress 700 → 690 · assets $900 liabilities $400
- 2026-09-01 v2 note only, kept in the trimmed tail
- 2026-09-02 v3 note
- 2026-09-03 v4 note
- 2026-09-04 v5 note
- 2026-09-05 v6 note
- 2026-09-06 v7 note
- 2026-09-07 v8 note
- 2026-09-08 v9 note
- 2026-09-09 v10 note
- 2026-09-10 v11 note
- 2026-09-11 v12 note
- 2026-11-03 v40 plaid refresh banked liquid $9,999.00 revolving $1,200 stress 690 → 510
"""


class ContractTest(unittest.TestCase):
    def book(self, rollup=None, sidecar=None):
        return build.build_book(LEDGER, rollup=rollup, sidecar=sidecar, now="test")

    def test_spendable_ignores_harvest_and_current(self):
        book = self.book()
        a3 = next(card for card in book["cards"] if card["id"] == "A3")
        self.assertEqual(a3["balance"], 420.50)
        self.assertEqual(a3["available"], 420.50)
        self.assertEqual(a3["current"], 1735.87)
        self.assertNotEqual(a3["balance"], 1804)
        self.assertTrue(a3["plaid"])
        self.assertEqual(a3["source"], "plaid")
        self.assertNotIn("STALE?", a3["marks"])
        self.assertEqual(book["headline"]["spendable"], 445.50)
        self.assertEqual(book["headline"]["banked"], 445.50)
        self.assertEqual(book["headline"]["logged_banked"], 9999.00)
        self.assertEqual(book["liquid"]["avail"], 445.50)
        self.assertEqual(book["liquid"]["current"], 1815.87)
        ids = [row["id"] for row in book["liquid"]["by_acct"]]
        self.assertEqual(ids, ["A3", "A1", "A9"])
        stale = next(row for row in book["liquid"]["by_acct"] if row["id"] == "A9")
        self.assertTrue(stale["stale"])
        self.assertIsNone(stale["avail"])

    def test_holds_are_explicit_and_not_subtracted_twice(self):
        book = self.book()
        memos = " ".join(h["memo"] for h in book["liquid"]["holds"])
        self.assertIn("Valon", memos)
        self.assertIn("CITI", memos)
        amounts = sorted(h["amount"] for h in book["liquid"]["holds"])
        self.assertEqual(amounts, [54.41, 1260.96])
        self.assertEqual(book["liquid"]["avail"], 445.50)

    def test_stale_rows_include_past_due_need_you_and_stale(self):
        ids = {row["id"] for row in self.book()["stale"]}
        self.assertEqual(ids, {"A9", "L4", "N2"})
        depot = next(card for card in self.book()["cards"] if card["id"] == "L4")
        self.assertIsNone(depot["balance"])

    def test_cashflow_months_and_future_append(self):
        rollup = {
            "window": "2026-10-01..2026-11-03",
            "source": "Finance/Plaid",
            "oct": {
                "payroll": 200,
                "other_in": 1,
                "lifestyle": 50,
                "debt_total": 20,
                "fees": 3,
                "cash_atm": 4,
                "net": -11,
                "categories": {"Food & drink": 50},
            },
            "nov1_3": {
                "payroll": 0,
                "other_in": 5,
                "lifestyle": 6,
                "debt_total": 7,
                "fees": 0,
                "cash_atm": 0,
                "net": -8,
                "pending": [["A3", "ACH HOLD Valon extra", -15]],
            },
        }
        book = self.book(rollup=rollup)
        ids = [m["id"] for m in book["cashflow"]["months"]]
        self.assertEqual(ids, ["2026-10", "2026-11", "2026-12"])
        oct = book["cashflow"]["months"][0]
        self.assertEqual(oct["income"], 200)
        self.assertEqual(oct["other_in"], 1)
        self.assertEqual(oct["lifestyle"], 50)
        self.assertEqual(oct["debt"], 20)
        self.assertEqual(oct["fees"], 3)
        self.assertEqual(oct["atm"], 4)
        self.assertEqual(oct["net"], -11)
        self.assertFalse(oct["stub"])
        nov = book["cashflow"]["months"][1]
        self.assertTrue(nov["stub"])
        self.assertEqual(nov["income"], 0)
        dec = book["cashflow"]["months"][2]
        self.assertEqual(dec["income"], 80)
        self.assertEqual(dec["net"], 70)
        fields = {"income", "other_in", "lifestyle", "debt", "fees", "atm", "net"}
        for month in book["cashflow"]["months"]:
            self.assertTrue(fields <= set(month))
        burn = next(m["burn"] for m in book["categories"]["months"] if m["id"] == "2026-10")
        self.assertEqual(burn, 50)
        memos = [h["memo"] for h in book["liquid"]["holds"]]
        self.assertTrue(any("extra" in m for m in memos))
        self.assertEqual(len([m for m in memos if "Valon" in m]), 2)

    def test_utilities_stack_and_cumulative(self):
        book = self.book()
        months = book["utilities"]["months"]
        self.assertEqual([m["id"] for m in months], ["2026-10", "2026-12"])
        self.assertEqual(months[0]["providers"]["gas_socal"], 4)
        self.assertEqual(months[0]["providers"]["electric_sce"], 6)
        self.assertEqual(months[0]["total"], 13)
        self.assertEqual(months[0]["cumulative"], 13)
        self.assertEqual(months[1]["total"], 3)
        self.assertEqual(months[1]["cumulative"], 16)

    def test_networth_survives_log_trim_and_sidecar(self):
        sidecar = [{"when": "2026-01-15", "assets": 10, "liabilities": 4, "net": 6}]
        book = self.book(sidecar=sidecar)
        self.assertEqual(len(book["log"]), 12)
        self.assertFalse(any("2026-05-01" in line for line in book["log"]))
        whens = [s["when"] for s in book["networth"]["snapshots"]]
        self.assertEqual(whens, ["2026-01-15", "2026-05-01", "2026-07-01"])
        may = book["networth"]["snapshots"][1]
        self.assertEqual(may["assets"], 900)
        self.assertEqual(may["liabilities"], 400)
        self.assertEqual(may["net"], 500)
        self.assertEqual(may["source"], "log")

    def test_overlay_prefers_available_over_first_harvest_amount(self):
        md = """
## Cash
### A4 · Spare — VERIFIED 2026-10-01
- **$10.00**
## Recent log
- 2026-11-01 v9 harvest revolving $1 · A4 $1,804.00 available $420.15
"""
        book = build.build_book(md, now="test")
        card = book["cards"][0]
        self.assertEqual(card["balance"], 420.15)
        self.assertNotEqual(card["balance"], 1804)

    def test_overlay_does_not_replace_existing_with_harvest_label(self):
        md = """
## Cash
### A3 · Everyday — VERIFIED 2026-11-02
- **$420.50**
## Recent log
- 2026-08-01 v2 harvest revolving $1 · A3 harvest $1,804.00
"""
        book = build.build_book(md, now="test")
        self.assertEqual(book["cards"][0]["balance"], 420.50)
        self.assertEqual(book["headline"]["banked"], 420.50)

    def test_terms_and_plan_lines_feed_the_payoff_planner(self):
        md = """## Cards (detail)
### L8 · Alpha — VERIFIED 2026-11-01
- balance **$640.00**
- terms: APR 27.99% · min $35 · due 14 · limit $1,000 · promo 0% to 2027-03-31 · as of 2026-10-28
### L6 · Beta — VERIFIED 2026-11-01
- balance **$410.40**
## Notes
- plan: order L8, L6
- plan budget: $520
"""
        book = build.build_book(md, now="test")
        alpha = next(c for c in book["cards"] if c["id"] == "L8")
        self.assertEqual(alpha["terms"], {"apr": 27.99, "min_payment": 35, "due_day": 14, "credit_limit": 1000, "promo_apr": 0.0, "promo_end": "2027-03-31", "asof": "2026-10-28"})
        self.assertNotIn("terms", next(c for c in book["cards"] if c["id"] == "L6"))
        self.assertEqual(book["plan"], {"method": "custom", "order": ["L8", "L6"], "budget": 520})

    def test_refuses_plaintext_inside_repo(self):
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as handle:
            handle.write("## Cash\n")
            path = handle.name
        try:
            rc = build.main(["--ledger", path, "--out", os.path.join(build.repo_root(), "book.json")])
        finally:
            os.remove(path)
        self.assertEqual(rc, 2)
        self.assertFalse(os.path.exists(os.path.join(build.repo_root(), "book.json")))

    def test_rollup_file_maps_oct_and_utilities(self):
        upload = "/home/ubuntu/.cursor/projects/agent-repos-midas-ledger/uploads/oct2026-rollup_6444.json"
        if not os.path.isfile(upload):
            self.skipTest("local rollup upload is not on this machine")
        with open(upload, encoding="utf-8") as handle:
            rollup = json.load(handle)
        book = build.build_book("", rollup=rollup, now="test")
        oct = next(m for m in book["cashflow"]["months"] if m["id"] == "2026-10")
        self.assertEqual(oct["income"], 4707.83)
        self.assertEqual(oct["other_in"], 631.68)
        self.assertEqual(oct["lifestyle"], 3317.81)
        self.assertEqual(oct["debt"], 4802.85)
        self.assertEqual(oct["fees"], 355.28)
        self.assertEqual(oct["atm"], 1400.0)
        self.assertEqual(oct["net"], -3768.11)
        nov = next(m for m in book["cashflow"]["months"] if m["id"] == "2026-11")
        self.assertTrue(nov["stub"])
        utils = {m["id"]: m for m in book["utilities"]["months"]}
        self.assertEqual(utils["2026-10"]["providers"]["gas_socal"], 45.92)
        self.assertEqual(utils["2026-10"]["total"], 398.36)
        self.assertEqual(utils["2026-11"]["cumulative"], 441.64)
        holds = book["liquid"]["holds"]
        self.assertTrue(any(h["acct"] == "A3" and "Valon" in h["memo"] and h["amount"] == 1260.96 for h in holds))
        self.assertTrue(any("Citi" in h["memo"] or "CITI" in h["memo"] for h in holds))


class RepairTest(unittest.TestCase):
    """Each defect from the repair brief, on synthetic figures only."""

    def test_debt_bar_is_outstanding_not_autopay_minimum_due_or_prior(self):
        md = """
## Cards (detail)
### L4 · Depot — VERIFIED 2026-11-07
- balance **$1,250.00** (**−$40.00**) autopay **$300.00**
- minimum due **$0.00**
- statement balance **$0.00**
- prior balance **$1,400.00**
- amount due **$0.00**
- projected after pending **$1,100.00**
- terms: purchase APR 24.99% · promo 0% to 2027-06-30 · min $0 · due 12 · as of 2026-11-07 · deferred interest
### L9 · Warehouse — VERIFIED 2026-11-07
- balance **$640.00**
- balance **$500.00**
## Recent log
- 2026-08-01 v2 harvest revolving $1 · L9 old $200.00 · L4 autopay $300.00
"""
        book = build.build_book(md, now="test")
        depot = next(c for c in book["cards"] if c["id"] == "L4")
        self.assertEqual(depot["balance"], 1250)
        self.assertEqual(depot["autopay"], 300)
        self.assertEqual(depot["minimum_due"], 0)
        self.assertEqual(depot["amount_due"], 0)
        self.assertEqual(depot["statement_balance"], 0)
        self.assertEqual(depot["prior_balance"], 1400)
        self.assertEqual(depot["projected"], 1100)
        self.assertNotEqual(depot["balance"], depot["autopay"])
        self.assertNotEqual(depot["balance"], depot["projected"])
        self.assertEqual(depot["terms"]["apr"], 24.99)
        self.assertEqual(depot["terms"]["promo_apr"], 0)
        self.assertEqual(depot["terms"]["promo_end"], "2027-06-30")
        self.assertEqual(depot["terms"]["due_day"], 12)
        self.assertNotEqual(depot["terms"]["promo_end"], depot["terms"]["due_day"])
        self.assertEqual(depot["terms"]["min_payment"], 0)
        self.assertTrue(depot["terms"]["deferred_interest"])
        self.assertNotIn("min_unknown", depot["terms"])
        warehouse = next(c for c in book["cards"] if c["id"] == "L9")
        self.assertEqual(warehouse["balance"], 640)
        self.assertNotEqual(warehouse["balance"], 500)
        self.assertNotEqual(warehouse["balance"], 200)

    def test_unknown_minimum_is_not_the_autopay(self):
        md = """
## Cards (detail)
### L4 · Depot — VERIFIED 2026-11-07
- autopay **$300.00**
- terms: min unknown · promo 0% to 2027-06-30 · APR 0% · as of 2026-11-07
"""
        card = build.build_book(md, now="test")["cards"][0]
        self.assertIsNone(card["balance"])
        self.assertTrue(card["unknown"])
        self.assertEqual(card["autopay"], 300)
        self.assertNotIn("min_payment", card["terms"])
        self.assertTrue(card["terms"]["min_unknown"])
        self.assertNotIn("apr", card["terms"])
        self.assertEqual(card["terms"]["promo_apr"], 0)
        self.assertEqual(card["terms"]["promo_end"], "2027-06-30")

    def test_headline_uses_latest_date_and_keeps_projection_apart(self):
        md = """
## Recent log
- 2026-11-08 v70 refresh stress 300→280 revolving:$640
- 2026-11-09 v71 projected revolving $500
- 2026-05-01 v1 harvest stress 700 → 690 revolving $9,000
"""
        book = build.build_book(md, now="test")
        head = book["headline"]
        self.assertEqual(head["stress"], 280)
        self.assertEqual(head["stress_asof"], "2026-11-08")
        self.assertNotEqual(head["stress"], 300)
        self.assertNotEqual(head["stress"], 690)
        self.assertEqual(head["revolving"], 640)
        self.assertEqual(head["revolving_basis"], "posted")
        self.assertEqual(head["revolving_projected"], 500)
        self.assertNotEqual(head["revolving"], head["revolving_projected"])
        self.assertEqual([h["score"] for h in book["history"]], [690, 280])

    def test_posted_revolving_on_the_same_line_as_a_pending_payoff(self):
        md = """
## Recent log
- 2026-11-01 v9 projected revolving $10 · assets $100 liabilities $40
- 2026-11-08 v70 posted revolving $640 pending payoff $500 stress 410→400
"""
        book = build.build_book(md, now="test")
        self.assertEqual(book["headline"]["revolving"], 640)
        self.assertEqual(book["headline"]["revolving_projected"], 500)
        snap = next(s for s in book["networth"]["snapshots"] if s["when"] == "2026-11-01")
        self.assertEqual(snap["basis"], "projected")
        self.assertFalse(snap["complete"])
        self.assertEqual(book["networth"]["liabilities"], 640)
        self.assertNotEqual(book["networth"]["liabilities"], 40)
        only_projected = build.build_book("""
## Recent log
- 2026-11-09 v71 projected revolving $500
""", now="test")
        self.assertIsNone(only_projected["headline"]["revolving"])
        self.assertEqual(only_projected["headline"]["revolving_projected"], 500)
        self.assertEqual(only_projected["networth"]["status"], "INCOMPLETE")
        self.assertIsNone(only_projected["networth"]["net"])
        self.assertIn("posted revolving", only_projected["networth"]["missing"])

    def test_flex_installment_is_not_revolving(self):
        md = """
## Cards (detail)
### L8 · Alpha — VERIFIED 2026-11-08
- balance **$640.00**
### L9 · Flex plan — VERIFIED 2026-11-08
- balance **$500.00**
- installment
## Recent log
- 2026-05-01 v1 note stress 100 → 200 revolving $9,000
"""
        book = build.build_book(md, now="test")
        flex = next(c for c in book["cards"] if c["id"] == "L9")
        self.assertEqual(flex["kind"], "installment")
        self.assertEqual(book["headline"]["revolving"], 640)
        self.assertEqual(book["headline"]["revolving_source"], "cards")
        self.assertEqual(book["headline"]["installment"], 500)
        self.assertEqual(book["networth"]["liabilities"], 1140)

    def test_suffixed_ids_do_not_collide_and_duplicates_are_flagged(self):
        md = """
## Assets beyond cash
### A6 · Main brokerage — VERIFIED read-only 2026-11-01
- total **$10,000.00**
- cash **$1,000.00**
- securities **$9,000.00**
- tradable **$4,000.00**
### A6b · Agent — VERIFIED 2026-11-01
- **$200.00**
### A6r · Roth — VERIFIED 2026-11-01
- **$300.00**
### A7 · 401(k) — VERIFIED 2026-11-01
- value **$8,000.00**
### A7e · ESOP — VERIFIED 2026-11-01
- value unknown
"""
        book = build.build_book(md, now="test")
        by_id = {c["id"]: c for c in book["cards"]}
        self.assertEqual(set(by_id), {"A6", "A6b", "A6r", "A7", "A7e"})
        self.assertEqual(by_id["A6"]["balance"], 10000)
        self.assertNotEqual(by_id["A6"]["balance"], 20000)
        self.assertNotEqual(by_id["A6"]["balance"], 4000)
        self.assertNotEqual(by_id["A6"]["balance"], 1000)
        self.assertEqual(by_id["A6r"]["balance"], 300)
        self.assertEqual(by_id["A6"]["name"], "Main brokerage")
        self.assertEqual(by_id["A7"]["name"], "401(k)")
        self.assertNotEqual(by_id["A7"]["name"], "401(k)/ESOP")
        self.assertEqual(by_id["A7"]["balance"], 8000)
        self.assertIsNone(by_id["A7e"]["balance"])
        self.assertTrue(by_id["A7e"]["unknown"])
        self.assertNotEqual(by_id["A7e"].get("balance"), 0)
        dup = build.build_book("""
## Assets beyond cash
### A6 · Main — VERIFIED 2026-11-01
- total **$10.00**
### A6 · Main again — VERIFIED 2026-11-01
- total **$12.00**
""", now="test")
        self.assertEqual(len(dup["cards"]), 2)
        self.assertEqual([c["balance"] for c in dup["cards"]], [10, 12])
        self.assertTrue(all(c.get("duplicate") and "DUPLICATE" in c["marks"] for c in dup["cards"]))

    def test_home_and_vehicles_use_gross_and_unknown_blocks_net_worth(self):
        md = """
## Nonliquid assets
### A8 · Home — VERIFIED 2026-09-01
- gross **$210,000.00**
- equity **$40,000.00**
### A10 · Vehicles — VERIFIED 2026-11-01
- car: unknown
- bike: gross **$1,200.00**
- first cost **$9,000.00**
## Loans
### N4 · Car loan — VERIFIED 2026-11-01
- balance **$3,000.00**
"""
        book = build.build_book(md, now="test")
        home = next(c for c in book["cards"] if c["id"] == "A8")
        vehicles = next(c for c in book["cards"] if c["id"] == "A10")
        self.assertEqual(home["section"], "Assets beyond cash")
        self.assertEqual(home["balance"], 210000)
        self.assertEqual(home["gross"], 210000)
        self.assertEqual(home["equity"], 40000)
        self.assertNotEqual(home["balance"], home["equity"])
        self.assertIsNone(vehicles["balance"])
        self.assertTrue(vehicles["unknown"])
        self.assertEqual(vehicles["cost"], 9000)
        self.assertNotEqual(vehicles.get("balance"), 1200)
        self.assertTrue(any(item["name"] == "car" and item["unknown"] for item in vehicles["components"]))
        nw = book["networth"]
        self.assertEqual(nw["status"], "INCOMPLETE")
        self.assertIsNone(nw["net"])
        self.assertEqual(nw["basis"], "posted")
        self.assertIn("Vehicles", nw["missing"])
        self.assertEqual(nw["assets"], 210000)
        self.assertEqual(nw["liabilities"], 3000)
        self.assertNotEqual(nw["assets"], 210000 - 3000)
        self.assertNotEqual(nw["assets"], 40000)

    def test_mortgage_principal_is_not_the_biweekly_draft(self):
        md = """
## Loans
### N3 · Mortgage — VERIFIED 2026-11-01
- biweekly draft **$450.00**
- principal **$100,000.00**
- terms: APR 6% · P&I $700 · escrow $150 · frequency biweekly · due 1 · as of 2026-11-01 · extra principal unknown
"""
        card = build.build_book(md, now="test")["cards"][0]
        self.assertEqual(card["balance"], 100000)
        self.assertEqual(card["draft"], 450)
        self.assertNotEqual(card["balance"], card["draft"])
        self.assertEqual(card["kind"], "mortgage")
        terms = card["terms"]
        self.assertEqual(terms["apr"], 6)
        self.assertEqual(terms["pi"], 700)
        self.assertEqual(terms["escrow"], 150)
        self.assertEqual(terms["frequency"], "biweekly")
        self.assertEqual(terms["unapplied"], "hold_until_full_payment")
        self.assertEqual(terms["extra_principal_policy"], "unknown")
        self.assertEqual(terms["asof"], "2026-11-01")
        self.assertEqual(terms["due_day"], 1)

    def test_monthly_categories_contract_keeps_zero_remainder_and_exclusions(self):
        doc = {
            "schema": "midas.monthly_categories.v1",
            "coverage": {
                "complete": False,
                "accounts_linked": ["checking"],
                "accounts_missing": ["wallet"],
                "cash_coverage": "partial",
                "note": "Unlinked cash is outside this rollup.",
            },
            "months": [
                {
                    "month": "2026-10",
                    "mtd": False,
                    "asof": "2026-10-31",
                    "totals": {
                        "income": 100,
                        "other_in": 0,
                        "merchant_spend": 40,
                        "debt_service": 10,
                        "fees": 0,
                        "transfers_excluded": 25,
                        "loan_proceeds_excluded": 0,
                    },
                    "categories": [
                        {"name": "Groceries", "amount": 8, "group": "merchant"},
                        {"name": "Fuel", "amount": 7, "group": "fuel"},
                        {"name": "Electric", "amount": 0, "group": "utility"},
                        {"name": "Dining", "amount": 6, "group": "merchant"},
                        {"name": "Pharmacy", "amount": 5, "group": "merchant"},
                        {"name": "Transit", "amount": 4, "group": "merchant"},
                    ],
                },
                {
                    "month": "2026-11",
                    "mtd": True,
                    "totals": {"merchant_spend": 5, "debt_service": 0, "fees": 0},
                    "categories": [{"name": "Fuel", "amount": 5, "group": "fuel"}],
                },
            ],
        }
        book = build.build_book("", rollup=doc, now="test")
        cats = book["categories"]
        self.assertEqual(cats["schema"], "midas.monthly_categories.v1")
        self.assertFalse(cats["coverage"]["complete"])
        self.assertEqual(cats["coverage"]["accounts_missing"], ["wallet"])
        self.assertEqual(cats["coverage"]["cash_coverage"], "partial")
        oct = next(m for m in cats["months"] if m["id"] == "2026-10")
        names = [item["name"] for item in oct["items"]]
        self.assertEqual(names, ["Groceries", "Fuel", "Electric", "Dining", "Pharmacy", "Transit", "Uncategorized"])
        self.assertEqual(len(names), 7)
        electric = next(item for item in oct["items"] if item["name"] == "Electric")
        self.assertEqual(electric["amount"], 0)
        self.assertEqual(electric["group"], "utility")
        fuel = next(item for item in oct["items"] if item["name"] == "Fuel")
        self.assertEqual(fuel["group"], "fuel")
        self.assertEqual(oct["burn"], 40)
        self.assertTrue(oct["partial"])
        self.assertEqual(book["utilities"]["months"], [])
        month = next(m for m in book["cashflow"]["months"] if m["id"] == "2026-10")
        self.assertEqual(month["income"], 100)
        self.assertEqual(month["other_in"], 0)
        self.assertEqual(month["lifestyle"], 40)
        self.assertEqual(month["debt"], 10)
        self.assertEqual(month["fees"], 0)
        self.assertIsNone(month["atm"])
        self.assertIsNone(month["net"])
        self.assertIn("atm", month["no_data"])
        self.assertEqual(month["excluded"]["transfers_excluded"], 25)
        self.assertEqual(month["excluded"]["loan_proceeds_excluded"], 0)
        self.assertEqual(month["lifestyle"], 40)
        self.assertEqual(month["income"], 100)
        nov = next(m for m in book["cashflow"]["months"] if m["id"] == "2026-11")
        self.assertTrue(nov["stub"])
        self.assertIsNone(nov["income"])
        self.assertIn("income", nov["no_data"])
        self.assertEqual(nov["debt"], 0)

    def test_category_table_keeps_every_row_and_the_gap_to_the_total(self):
        md = """
## Cash flow
### 2026-10 Oct

| Category | Amount |
| --- | ---: |
| Groceries | 5.00 |
| Fuel | 4.00 |
| Dining | 3.00 |
| Pharmacy | 2.00 |
| Transit | 1.00 |
| Electric | 0.00 |
| Total | 40.00 |
"""
        book = build.build_book(md, now="test")
        items = book["categories"]["months"][0]["items"]
        self.assertEqual(
            [item["name"] for item in items],
            ["Groceries", "Fuel", "Dining", "Pharmacy", "Transit", "Electric", "Uncategorized"],
        )
        self.assertEqual(items[-1]["amount"], 25)
        self.assertEqual(book["categories"]["months"][0]["burn"], 40)
        self.assertEqual(next(item["amount"] for item in items if item["name"] == "Electric"), 0)


if __name__ == "__main__":
    unittest.main()
