<!-- doc-status: current; normative: yes -->
# The book: what the page decrypts (and what the payoff planner needs)

`build.py` turns the private `LEDGER.md` (never in git) into the book JSON that `scripts/encrypt-vault.mjs` encrypts into `index.html`. This page lists the fields the app reads. Made-up example: `src/demo.js`.

## Already there

`headline`, `history[]`, `cards[]` (`section`, `id`, `name`, `balance`, `available`, `current`, `marks[]`, `asof`, `source`, `prev`, `lines[]`, `holds[]`), `sections[]`, `log[]`, `liquid`, `cashflow.months[]`, `utilities.months[]`, `categories.months[]`, `networth.snapshots[]`, `stale[]` (see the README).

## debts: the terms line (new, 2026-11-05)

The payoff planner (avalanche, snowball, Joseph's own order; debt-free date) needs each card's and loan's terms. In `LEDGER.md`, under the card's `### L8 · Name — STATUS date` heading, add one bullet:

```
- terms: APR 24.99% · min $95 · due 15 · limit $3,000 · promo 0% to 2027-03-31 · as of 2026-10-28
```

Every part is optional except `APR`, `min` and `as of`; order does not matter; `·` separates them. `build.py` reads it into the card:

```json
"terms": {"apr": 24.99, "min_payment": 95, "due_day": 15, "credit_limit": 3000, "promo_apr": 0, "promo_end": "2027-03-31", "asof": "2026-10-28"}
```

Rules (homework MID-GRK-01):
- From the statement, the lender's site or an alert email: never from memory. `as of` = the statement date it came from.
- A card or loan without `APR`, `min` or `as of` shows **terms missing** on the Debt screen and the planner leaves it out of the debt-free date (it says so).
- A plan of Joseph's own: one more bullet under the headline section, `- plan: avalanche` (or `snowball`, or `order L8, L6, N1`) and `- plan budget: $900` (a month, all debts together). Without it the planner shows all three methods side by side.
