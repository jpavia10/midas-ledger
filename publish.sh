#!/usr/bin/env bash
# Publish path: LEDGER + optional Plaid rollup → ciphertext in index.html.
# Plaintext stays in $TMPDIR. Joseph commits the ciphertext; this script does not.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
LEDGER="${LEDGER_MD:-}"
CASHFLOW="${CASHFLOW_JSON:-/workspace/cashflow/oct2026-rollup.json}"
NETWORTH="${NETWORTH_JSON:-}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/midas-publish-XXXXXX")"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

if [[ -z "$LEDGER" || ! -f "$LEDGER" ]]; then
  echo "Set LEDGER_MD to the ledger file. It is not stored in this repo." >&2
  exit 1
fi

ARGS=(--ledger "$LEDGER" --out "$WORK/book.json")
if [[ -f "$CASHFLOW" ]]; then
  case "$CASHFLOW" in
    "$ROOT"|"$ROOT"/*)
      echo "Refusing a cashflow path inside the repo: $CASHFLOW" >&2
      exit 1
      ;;
  esac
  ARGS+=(--cashflow "$CASHFLOW")
fi
if [[ -n "$NETWORTH" && -f "$NETWORTH" ]]; then
  ARGS+=(--networth "$NETWORTH")
fi

python3 "$ROOT/build.py" "${ARGS[@]}"
if [[ -z "${LEDGER_PAGE_PASSWORD:-}" ]]; then
  echo "LEDGER_PAGE_PASSWORD is required. Plaintext was only in $WORK and has been removed." >&2
  exit 1
fi
node "$ROOT/scripts/encrypt-vault.mjs" "$WORK/book.json" "$WORK/vault.json"
node "$ROOT/scripts/set-vault.mjs" "$WORK/vault.json"
(cd "$ROOT" && npm run build && npm run check)
echo "Ciphertext is in index.html. Review, then commit index.html, test/vault.test.mjs, and midas.js."
echo "Do not commit the ledger, the password, or book.json."
