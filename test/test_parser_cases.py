"""The 25 parser cases (MID-GEM-10): each one is ledger text in the book's format and what build.py must make of it.

Written by Gemini (midas_gemini_parser-cases_20261118-1940.json), checked against build.py by Claude on 2026-11-20:
22 of 25 agreed as written (7 of them under a field name build.py does not write; corrected here, see each case's
"notes"). Case 18 and 24 are rewritten in the schema's own syntax. Case 10 found a parser gap ('apr 0% promo until DATE'),
fixed 2026-11-20 with Joseph's OK; a case may still carry "known_gap" to be held as an expected failure. Made-up numbers only.
Run: python3 -m unittest test/test_parser_cases.py
"""
import json
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import build  # noqa: E402

CASES = json.load(open(os.path.join(HERE, "parser_cases.json"), encoding="utf-8"))
GROUP = ("cards", "duplicate", "count", "balances", "min_payments", "not_balance", "no_terms", "networth", "headline", "plan", "id")


def field(card, key):
    if key in card:
        return card[key]
    return (card.get("terms") or {}).get(key, KeyError)


def rollup(lines):
    months = []
    for ln in lines:
        mid, rest = ln.split(":", 1)
        parts = [p.strip() for p in rest.split("|")]
        total = build.num(re.search(r"\$([\d,.]+)", parts[0]).group(1))
        cats = [{"name": p.rsplit(" $", 1)[0], "amount": build.num(p.rsplit("$", 1)[1])} for p in parts[1:]]
        months.append({"month": mid.strip(), "categories": cats,
                       "totals": {"income": 0, "other_in": 0, "merchant_spend": total, "debt_service": 0, "fees": 0, "atm": 0}})
    return {"schema": "midas.monthly_categories.v1", "months": months}


class ParserCases(unittest.TestCase):
    def check(self, case):
        exp = case["expect"]
        if "rollup" in case:
            got = build.cashflow_from_monthly_categories(rollup(case["rollup"]))["categories"]["months"]
            self.assertEqual({m["id"]: {"items": {i["name"]: i["amount"] for i in m["items"]}, "partial": m["partial"]} for m in got}, exp)
            return
        book = build.build_book(case["book"], now="test")
        cards = book["cards"]
        if "networth" in exp:
            self.assertEqual(book["networth"]["status"], exp["networth"])
        for key, want in (exp.get("headline") or {}).items():
            self.assertEqual(book["headline"].get(key), want, key)
        if "plan" in exp:
            self.assertEqual(book.get("plan"), exp["plan"])
        if "count" in exp:
            same = [c for c in cards if c["id"] == exp["id"]]
            self.assertEqual(len(same), exp["count"])
            self.assertTrue(all(c.get("duplicate") is True and "DUPLICATE" in c.get("marks", []) for c in same))
            self.assertEqual([c.get("balance") for c in same], exp["balances"])
            if "min_payments" in exp:
                self.assertEqual([field(c, "min_payment") for c in same], exp["min_payments"])
            if "asof" in exp:
                self.assertIn(exp["asof"], [field(c, "asof") for c in same])
            return
        if "cards" in exp:
            targets = [(next(c for c in cards if c.get("name") == sub["name"]), sub) for sub in exp["cards"]]
        elif {"name", "id"} & set(exp):
            targets = [(next(c for c in cards if c.get("name") == exp.get("name", c.get("name")) and c["id"] == exp.get("id", c["id"])), exp)]
        elif "property_balance" in exp:
            by = {c.get("name"): c for c in cards}
            self.assertEqual(by["Property"]["balance"], exp["property_balance"])
            self.assertEqual(by["Equipment"]["balance"], exp["equipment_balance"])
            self.assertIsNone(by["Loan X"].get("balance"))
            self.assertTrue(by["Loan X"].get("unknown"))
            return
        else:
            return
        for card, sub in targets:
            for key, want in sub.items():
                if key in GROUP or key == "name":
                    continue
                self.assertEqual(field(card, key), want, f"{card['id']} {key}")
            for value in sub.get("not_balance", []):
                self.assertNotEqual(card.get("balance"), value)
            if sub.get("no_terms"):
                self.assertNotIn("terms", card)


def _make(case):
    def test(self):
        self.check(case)
    test.__doc__ = f"case {case['n']}: {case['rule']}"
    return unittest.expectedFailure(test) if case.get("known_gap") else test


for _case in CASES:
    setattr(ParserCases, f"test_case_{_case['n']:02d}", _make(_case))


if __name__ == "__main__":
    unittest.main(verbosity=1)
