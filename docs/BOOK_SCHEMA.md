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
- A card or loan without `APR`, `min` or `as of` shows **terms missing** on the Debt screen and the planner leaves it out of the debt-free date (it says so). A minimum of `$0` counts. `min unknown` does not, and an autopay amount is never copied into `min_payment`.
- `apr` is the purchase APR that applies after a promotion. `promo_apr` and `promo_end` are the promotional rate and the date it ends. The promo end is not `due_day`. A bare `APR 0%` next to a promo window is the promo rate, not the purchase APR.
- Say `deferred interest` on the terms line when the lender can charge it if the balance is unpaid at the promo end. The plan shows that caveat. It does not treat the promo rate as the payoff rate.
- A plan of Joseph's own: one more bullet under the headline section, `- plan: avalanche` (or `snowball`, or `order L8, L6, N1`) and `- plan budget: $900` (a month, all debts together). Without it the planner shows all three methods side by side.

## Ledger text the parser reads

`build.py` reads the private `LEDGER.md`. Ids are `[A-Z]` plus digits plus any trailing letters: `A6`, `A6b` and `A6r` are three accounts. A repeated id is kept twice and marked `DUPLICATE`. It is not overwritten. `read-only` and `tradable` do not drop an account.

Cash still uses the available balance. A harvest figure and the current balance are not spendable.

A card or loan balance is the outstanding amount, in this order: the first `balance`, `outstanding`, `posted`, `principal`, or `current balance`; otherwise the first unlabeled amount. These never become that balance: autopay, minimum, amount due, statement balance, prior or old balance, a signed change, a biweekly draft, escrow, P&I, a credit limit, or a pending-payoff projection. A later line does not replace the first balance. A harvest log line does not replace a debt balance. Zero is kept. Unknown stays unknown and is not stored as zero.

```
### L4 · Depot — VERIFIED 2026-11-07
- balance **$1,250.00** (**−$40.00**) autopay **$300.00**
- minimum due **$0.00**
- statement balance **$0.00**
- prior balance **$1,400.00**
- projected after pending **$1,100.00**
- terms: purchase APR 24.99% · promo 0% to 2027-06-30 · min $0 · due 12 · as of 2026-11-07 · deferred interest
```

That card's balance is `1250`. Autopay, the zero minimum, the zero statement balance, the prior balance and the projection are separate fields.

A line that says `installment`, or a card named Flex, is `kind: installment`. It is not part of the revolving total. The revolving headline is the latest **posted** figure by date, not by file order. `stress 300→280` and `revolving:$640` both count. `projected revolving` and `pending payoff` are `revolving_projected` and are not the posted total. When every revolving card has its own posted balance and those dates are newer than the log, the headline uses the sum of those balances.

Log lines are read in date order:

```
- 2026-11-08 v70 refresh stress 300→280 revolving:$640
- 2026-11-09 v71 projected revolving $500
```

Stress history is the same date order. The score after the arrow is the new score.

Assets use gross value. Equity, first cost, and a tradable subset do not. A brokerage `total` is not added to the cash and securities already inside it. 401(k) and ESOP stay separate cards; the parser does not rename one of them to a combined label. `value unknown` is `unknown: true` and is left out of totals.

```
### A8 · Home — VERIFIED 2026-09-01
- gross **$210,000.00**
- equity **$40,000.00**
### A10 · Vehicles — VERIFIED 2026-11-01
- car: unknown
- bike: gross **$1,200.00**
- first cost **$9,000.00**
```

Home's figure is the gross value. Equity is shown beside it and is not added again, and the mortgage is not subtracted there. Vehicles stay unknown because the car is unknown; the bike is not used as the total and the first cost is not the value. `## Nonliquid assets` is the same section as `Assets beyond cash`.

Net worth is `INCOMPLETE` when any of those values is unknown, or when the only revolving figure is a projection. The known asset and liability sums are still reported. `net` is present only when the position is complete. Stale, past-due and need-you rows stay out of the pair. A log snapshot that mentions a projection is `basis: projected` and `complete: false`.

A mortgage balance is principal, never the biweekly draft.

```
### N3 · Mortgage — VERIFIED 2026-11-01
- principal **$100,000.00**
- biweekly draft **$450.00**
- terms: APR 6% · P&I $700 · escrow $150 · frequency biweekly · due 1 · as of 2026-11-01 · extra principal unknown
```

The book then carries `terms.pi`, `terms.escrow`, `terms.frequency`, `terms.unapplied` (`hold_until_full_payment`), `terms.extra_principal_policy` and `terms.asof`. Interest in the forecast is `principal × APR / 12`, once a month. Two drafts make one full payment of P&I plus escrow. The first draft is held and does not reduce principal. The statement due is not a second cash out. Escrow reduces cash inside that payment and does not reduce principal, and a later tax or insurance payment from escrow is not a new expense. Drafts 25 and 26 of a biweekly year do not reduce principal unless the terms say `extra principal annual` or `extra principal monthly`. Forecast rows are `estimate: true` and `posted: false`. If principal, APR, P&I or escrow is missing, there is no payoff date.

## midas.monthly_categories.v1

A rollup with `"schema": "midas.monthly_categories.v1"` is the multi-month category input. Pass it as `--cashflow`. Field names:

| Field | Meaning |
| --- | --- |
| `coverage.complete` | `false` unless every linked account and the cash the household spends are in the rollup. The book must not claim the spending is complete when this is false. |
| `coverage.accounts_linked` | Accounts the rollup actually read. |
| `coverage.accounts_missing` | Accounts that were requested and not linked. |
| `coverage.cash_coverage` | `full`, `partial`, `none`, or `unknown`. |
| `coverage.note` | One sentence on what was left out. |
| `months[].month` | `YYYY-MM`. |
| `months[].mtd` | `true` for a month still in progress. The book marks that month as a stub. |
| `months[].asof` | `YYYY-MM-DD` the month was closed or last read. |
| `months[].totals.income` | Pay in. |
| `months[].totals.other_in` | Other money in that is not a transfer and not loan proceeds. |
| `months[].totals.merchant_spend` | Merchant spend only. This becomes the lifestyle figure. |
| `months[].totals.debt_service` | Debt payments. Not mixed into merchant spend. |
| `months[].totals.fees` | Interest and fees. Not mixed into merchant spend. |
| `months[].totals.atm` | Cash withdrawn. |
| `months[].totals.transfers_excluded` | Internal transfers. Stored under `excluded` and not added to income, merchant spend, debt or fees. |
| `months[].totals.loan_proceeds_excluded` | Raw loan proceeds. Same exclusion. |
| `months[].categories[]` | `{ name, amount, group }`. `group` is `merchant`, `fuel`, `utility`, `fee` or `other`. Fuel is not a utility provider. |

Zero is a measured zero. Omit the key, or send `null`, when there is no data. The book keeps `0`, stores the missing names on `no_data`, and leaves `net` null until income, other in, merchant spend, debt service, fees and atm are all present.

Every category row is kept. If `merchant_spend` is larger than the sum of the rows, the book adds one `Uncategorized` remainder and sets `partial: true`. It does not drop rows to make the list match the total. The same rule applies to a category table in the ledger: a `Total` row sets the burn, and the gap becomes `Uncategorized`.

```json
{
  "schema": "midas.monthly_categories.v1",
  "coverage": {
    "complete": false,
    "accounts_linked": ["checking"],
    "accounts_missing": ["wallet"],
    "cash_coverage": "partial",
    "note": "Unlinked cash is outside this rollup."
  },
  "months": [{
    "month": "2026-10",
    "mtd": false,
    "asof": "2026-10-31",
    "totals": {
      "income": 100,
      "other_in": 0,
      "merchant_spend": 40,
      "debt_service": 10,
      "fees": 0,
      "transfers_excluded": 25,
      "loan_proceeds_excluded": 0
    },
    "categories": [
      {"name": "Groceries", "amount": 20, "group": "merchant"},
      {"name": "Fuel", "amount": 10, "group": "fuel"},
      {"name": "Electric", "amount": 0, "group": "utility"}
    ]
  }]
}
```
