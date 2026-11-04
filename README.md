# Midas Ledger

The finance wing of Prometheus Hub. Cool midnight field, pearl glass, no vault gold. The book stays encrypted in the browser.

https://jpavia10.github.io/midas-ledger/

Balances are AES-256-GCM. The key is PBKDF2-SHA256, 600k iterations, and it never leaves the device. Remembering on this device stores the raw AES key in `localStorage` under `midasKey`, tied to the salt. A new salt asks for the password again. No password and no plaintext ledger are stored in this repo.

Open the book, then tap an account, a headline figure, a chart point, a written page, or a dock tile. The glass grows out of that item. On a phone the panel sits as a sheet. Back, Escape, or a downward drag closes it.

The filter bar under the headline narrows accounts by section (Cash, Cards, Loans, Assets), by mark (Need you, Stale, Hold), by pin, and by name or id. Reset clears it.

The stress spark scrubs by point. The gauge and the cash-versus-floor bar show the figure under the pointer. Card balances sit beside the revolving total, and a row opens that account. Every chart uses numbers from the decrypted book.

Pin, a device note, copy balance, and reviewed live on the account panel. They are stored in `localStorage` under `midasDesk:` plus the vault salt. They do not rewrite the encrypted book. Lock & forget clears the remembered key (`midasKey`) and leaves these device notes in place.

Back to the desk: https://jpavia10.github.io/prometheus-hub/

## Particles

The field is the hub’s morph-particles desk, adapted from [MisterPrada/morph-particles](https://github.com/MisterPrada/morph-particles). Scroll mixes nebula, coin, ledger, and ring. The pointer leans the cloud. Shapes are drawn here. The christmas models are not included.

## Pages

Publish the root of this repo to **jpavia10/midas-ledger**, branch **main**, folder **/ (root)**. `.nojekyll` is included. GitHub Pages does not run a build; `midas.js` is already bundled.

Build it again after editing `src/`:

```bash
npm install
npm run build
npm run check
```

`npm run build` bundles `src/main.js` to `midas.js` with esbuild and copies the Outfit faces into `fonts/`. Three.js `0.164.1` matches the hub.

Locally:

```bash
npm install
npm run build
python3 -m http.server 8742
```

## Updating the encrypted book

Put the new payload in a JSON file with `v`, `iter`, `salt`, `iv`, and `ct`. Then:

```bash
node scripts/set-vault.mjs path/to/vault.json
npm run check
```

That replaces the `#vault` script in `index.html` and the checksum in `test/vault.test.mjs`. Commit both. Do not commit the password or the plaintext.

## Home screen

iPhone: Safari → Share → Add to Home Screen. Android: Chrome → Install app. The icon is the thin square. The name is Midas Ledger.
