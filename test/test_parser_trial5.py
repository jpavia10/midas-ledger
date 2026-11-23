"""Gemini's parser trial 5 (MID-GEM-12), the four gaps Joseph approved fixing on 2026-11-23, plus what must stay as it was.

Cases 20, 21, 26 and 28 of midas_gemini_parser-trial_20261120-0940.json, word for word. Made-up numbers only.
Run: python3 -m unittest discover -s test -p 'test_parser_trial5.py'
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build  # noqa: E402


def terms(line):
    return build.parse_terms("terms: " + line)


class TrialFive(unittest.TestCase):
    def test_case_20_ordinal_due_day(self):
        t = terms("APR 20.99% · min $35 · due 15th · as of 2026-11-01")
        self.assertEqual((t["apr"], t["min_payment"], t["due_day"], t["asof"]), (20.99, 35.0, 15, "2026-11-01"))
        for word, day in (("1st", 1), ("2nd", 2), ("3rd", 3), ("21st", 21)):
            self.assertEqual(terms(f"APR 20% · due {word}")["due_day"], day)

    def test_case_21_non_zero_promo_rate_beside_a_promo_end(self):
        t = terms("APR 3.99% · promo end 2027-09-01 · purchase APR 24.99% · min $80 · due 7 · as of 2026-11-01")
        self.assertEqual((t["promo_apr"], t["promo_end"], t["apr"]), (3.99, "2027-09-01", 24.99))
        # without a purchase APR a non-zero bare APR is still the APR, as before
        t = terms("APR 3.99% · promo end 2027-09-01 · min $80")
        self.assertEqual(t["apr"], 3.99); self.assertNotIn("promo_apr", t)

    def test_case_26_no_deferred_interest(self):
        t = terms("promo 0% to 2027-05-01 · purchase APR 22.99% · no deferred interest · min $35 · due 10 · as of 2026-11-01")
        self.assertNotIn("deferred_interest", t)
        self.assertEqual((t["promo_apr"], t["promo_end"], t["apr"]), (0.0, "2027-05-01", 22.99))
        for neg in ("deferred interest: none", "not deferred interest", "non-deferred interest"):
            self.assertNotIn("deferred_interest", terms("APR 20% · " + neg), neg)
        # the plain caveat still sets it
        self.assertTrue(terms("purchase APR 24.99% · promo 0% to 2027-06-30 · min $0 · due 12 · deferred interest")["deferred_interest"])

    def test_case_28_thru(self):
        t = terms("promo 0% thru 2027-09-30 · purchase APR 25.49% · min $40 · due 16 · as of 2026-11-01")
        self.assertEqual((t["promo_apr"], t["promo_end"], t["apr"], t["due_day"]), (0.0, "2027-09-30", 25.49, 16))
        self.assertEqual(terms("APR 0% thru 2027-09-30 · purchase APR 25.49%")["promo_end"], "2027-09-30")


if __name__ == "__main__":
    unittest.main()
