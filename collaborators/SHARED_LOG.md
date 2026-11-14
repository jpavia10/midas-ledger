# Midas Ledger: shared log

Newest first. Every contributor (Claude and every AI) adds a dated 2-3 line entry after a change.

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
