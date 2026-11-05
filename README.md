# Midas Ledger

The finance wing of Prometheus Hub, in the Prometheus look (cool midnight, pearl type, Midas gold as the one warm light; v2, 2026-11-05, replaced the neon HUD). Home leads with **the way out**: the debt-free month, the months and interest left at your monthly budget, and how much you have paid down since the starting line this device saw. **Plan** compares avalanche, snowball, your own order and minimums only, with a budget slider and what $100 more a month changes. Tab bar: Home, Flow, Accounts, Plan, Debt, Book. The book stays encrypted in the browser.

https://jpavia10.github.io/midas-ledger/

Balances are AES-256-GCM. The key is PBKDF2-SHA256, 600k iterations, and it never leaves the device. Remembering on this device stores the raw AES key in `localStorage` under `midasKey`, tied to the salt. A new salt asks for the password again. No password and no plaintext ledger are stored in this repo.

Home shows **spendable available** (Plaid available, not the inflated current balance), the holds sitting on top of it, the gap to the floor, the stress dial, and revolving. Flow charts income against spend, categories, utilities, and net worth when the decrypted book carries those fields. Stale, past due, and need-you rows stay out of the spendable sum.

Pin, a device note, copy balance, and reviewed live on the account panel. They are stored in `localStorage` under `midasDesk:` plus the vault salt. They do not rewrite the encrypted book. Lock & forget clears the remembered key (`midasKey`) and leaves these device notes in place.

Back to the desk: https://jpavia10.github.io/prometheus-hub/

## Pages

Publish the root of this repo to **jpavia10/midas-ledger**, branch **main**, folder **/ (root)**. `.nojekyll` is included. GitHub Pages does not run a build; `midas.js` is already bundled. The bundle is the HUD plus a CSS grid on canvas. It does not ship Three.js.

```bash
npm install
npm run build
npm run check
```

`npm run check` runs the browser tests and `test/test_build.py`.

Locally, after a build:

```bash
python3 -m http.server 8742
```

`http://127.0.0.1:8742/?hud=1` opens a fictional book so the HUD can be reviewed without the password. That flag only works on localhost. The published site still asks for the password.

## The payoff planner

`src/plan.js` (tested in `test/plan.test.mjs` against cases worked by hand): each month interest = balance x APR / 12 / 100, rounded to the cent and added; every minimum is paid; the rest goes to the target (avalanche = highest APR, snowball = lowest balance, custom = your order), and money left after a target is paid off goes to the next one the same month. It needs each card's and loan's terms in the book: one `- terms:` line under the card and optional `- plan:` / `- plan budget:` lines (`docs/BOOK_SCHEMA.md`). A debt without terms is listed as "terms missing" and left out of the date.

## Updating the encrypted book

Plaintext stays off git. `publish.sh` reads the ledger and an optional Plaid rollup, encrypts with `LEDGER_PAGE_PASSWORD`, and swaps the ciphertext via `scripts/set-vault.mjs`.

```bash
export LEDGER_MD=/path/to/LEDGER.md
export LEDGER_PAGE_PASSWORD='…'          # not committed
export CASHFLOW_JSON=/workspace/cashflow/oct2026-rollup.json   # optional
export NETWORTH_JSON=/path/to/networth.json                    # optional sidecar
./publish.sh
```

What that runs:

1. `python3 build.py` writes the book JSON to a temp directory (it refuses `--out` inside this repo).
2. `node scripts/encrypt-vault.mjs` turns that JSON into `{ v, iter, salt, iv, ct }`. Password from the environment, AES-256-GCM, PBKDF2-SHA256, 600k.
3. `node scripts/set-vault.mjs` replaces the `#vault` script in `index.html` and the checksum in `test/vault.test.mjs`.
4. `npm run build` and `npm run check`.

Commit `index.html`, `test/vault.test.mjs`, and `midas.js`. Do not commit the password, `LEDGER.md`, `book.json`, or the rollup.

`build.py` on its own:

```bash
python3 build.py --ledger "$LEDGER_MD" --cashflow "$CASHFLOW_JSON" --networth "$NETWORTH_JSON" --out /tmp/book.json
```

If `/workspace/cashflow/oct2026-rollup.json` is on the machine, it is picked up when `--cashflow` is omitted. A Cash flow section in the ledger is parsed too. The same month id (`2026-10`) merges, and the rollup wins on numbers. A later month in either source is appended.

The book JSON the page decrypts includes:

- `liquid.avail`, `liquid.current`, `liquid.holds[]`, `liquid.by_acct[]` — avail is the spendable sum of fresh cash available balances. Holds (Valon, Citi ACH, and the like) are listed and are not subtracted a second time.
- `cashflow.months[]` with `income`, `other_in`, `lifestyle`, `debt`, `fees`, `atm`, `net`.
- `utilities.months[]` with `providers`, `total`, and `cumulative`.
- `categories.months[]` and `burn` when a category table or rollup has them.
- `networth.snapshots[]`, taken from the full log before it is trimmed to 12 lines, plus a Net worth section, plus the sidecar when older points have fallen out of the log.
- `stale[]` for `STALE?`, `PAST DUE`, and `NEED YOU`.

Headline `banked` is set to that spendable available figure. A harvest log line cannot replace a fresher Plaid available balance (including the old A3 harvest `$1,804` overlay). Current balances are stored and shown, and they are not the headline.

## Home screen

iPhone: Safari → Share → Add to Home Screen. Android: Chrome → Install app. The name is Midas Ledger.
