# Midas Ledger: shared log

Newest first. Every contributor (Claude and every AI) adds a dated 2-3 line entry after a change.

### [2026-11-20] Claude: parser reads every promo-window wording (Joseph's OK)
- parse_terms now reads `APR 0% promo until DATE` and `promo until/to/through DATE`, and a bare `APR 0%` next to a promo window becomes `promo_apr` even when a purchase APR is on the line (BOOK_SCHEMA.md's rule; Gemini's parser case 10 found the gap). Parser case 10 passes; test_promo_window_wordings pins six wordings; earlier forms parse exactly as before. Takes effect on the next book build (publish.sh); nothing on the live page changes until then.

### [2026-11-20] Claude: parser cases are tests now; Nov 17-18 files checked and scored
- Gemini's 25 parser cases (MID-GEM-10, 1940 file) run through build.py: 22 give the parser's values (7 under field names build.py does not write, corrected), 18 and 24 rewritten in the schema's syntax. They are test/test_parser_cases.py + test/parser_cases.json, in `npm run check` (46 Python tests). Case 10 is an expected failure: BOOK_SCHEMA.md says a bare `APR 0%` next to a promo window is the promo rate, but parse_terms does not read `apr 0% promo until DATE`. The parser is a protected internal, so that fix waits for Joseph's OK.
- Scores #1-#11 (first rows on this sheet). MID-GEM-09 and -10 and MID-MUS-02 and -03 closed; MID-GEM-11 (function spec) sent back, due Nov 30. The Flex rules in Hub Money now link the Citi page for each rule and mark four as unconfirmed (the URL Gemini cited for 13 rows is not found by search).

### [2026-11-14] Grok: posted balances, distinct assets, mortgage forecast
- Debt bars and the revolving headline use the posted outstanding balance. Autopay, minimums, drafts, prior figures and pending-payoff projections stay beside it. Suffixed account ids stay distinct, unknown stays unknown, and net worth says INCOMPLETE while a part is missing.
- The mortgage forecast separates P&I, escrow and a held half-draft, and leaves extra principal conditional. `docs/BOOK_SCHEMA.md` now states the ledger text and `midas.monthly_categories.v1`. Vault ciphertext unchanged.

### [2026-11-10] Grok: command-desk pass
- The book uses the live desk atmosphere (starfield, mast, glass) and drops the old compartment label from the chrome. Midas gold stays the warm accent inside the kit.
- Vault ciphertext unchanged. Preview with the fictional `?hud=1` book.

### [2026-11-10] Grok: the book uses the Prometheus kit
- Vendored `kit/prometheus.css` and pointed the shell at `body[data-pillar="midas"]`. Dropped the leftover HUD token names so glass, type, tabs, and the warm light come from the shared kit.
- Home is a wider desk (the way out beside stress and revolving). Encryption, the vault, and the passphrase flow are unchanged. Preview with the fictional `?hud=1` book.

### [2026-11-09] Sebastian (acting integrator, for Claude): non-Titan homework merge
- MID-GEM-01..08 datasets and MID-MUS-01 copy (24 milestone + 12 screen lines, verbatim-verified) merged from Drive incoming and closed in docs/agents/queues.json; board re-rendered from the hub. The lines are ready to wire into the screens; scoring deferred to Claude.

### [2026-11-05] Claude: Midas v2, the way out (owner: "that whole app needs a 100000 percent better design ... not inspiring me to get out of debt")
- Prometheus look (no neon; gold, cyan, rose for short/out), Home leads with the debt-free month and paid-down-since bar, new Plan tab (avalanche / snowball / your order / minimums, budget slider, +$100 a month), payoff engine `src/plan.js` with hand-worked tests, `build.py` reads `- terms:` and `- plan:` lines.
- Fixed: the merge of #5 (11-04) cut the end of index.html, so the live page never loaded midas.js and could not unlock; restored + a test.

### [2026-11-05] Claude: the Prometheus layout
- This pillar got the standard files (AI_START_HERE, CLAUDE, homework in docs/agents/, this log, the scorecard) and its Drive folder `Prometheus Hub/Pillars/Midas Ledger/`. Homework for every AI is in docs/agents/QUEUE_*.md.
