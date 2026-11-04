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


if __name__ == "__main__":
    unittest.main()
