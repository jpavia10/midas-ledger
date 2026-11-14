#!/usr/bin/env python3
"""Build the Midas book JSON from LEDGER.md and optional Plaid rollups.

The plaintext book is never written inside this repo. Encrypt it with
scripts/encrypt-vault.mjs and publish the ciphertext with scripts/set-vault.mjs
(see publish.sh). Password stays in LEDGER_PAGE_PASSWORD.

Spendable liquid is the sum of fresh Plaid *available* balances. Current
balances are recorded but never used as the headline. A harvest log line must
not paint an older figure (the A3 $1,804 harvest bug) over a fresher card,
and it must not override a card marked PLAID.

Future cash-flow months append. A month id of YYYY-MM is the join key.
When a rollup and the ledger both have that month, rollup numbers win.
Net-worth points are collected from the full log *before* it is trimmed, and
an optional sidecar fills dates the trimmed log no longer carries.
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import sys

MONEY = r"\$([\d,]+(?:\.\d{1,2})?)"
# Letter suffixes are part of the id. A6, A6b and A6r are three accounts.
ID_RE = r"[A-Z]\d+[a-z]*"
MARK_KEYS = [
    "VERIFIED", "GROK", "APP", "SMS", "STALE?", "NEED YOU", "HOLD",
    "SCREENSHOT", "GAP", "OK", "PAST DUE", "PLAID", "DUPLICATE",
]
CARD_RE = re.compile(rf"^### ({ID_RE})\s*(?:·)?\s*(.*?)\s+[—–-]\s+(.*)$")
_MONEY_TOKEN = re.compile(
    r"(?P<sign>[-−–])?\s*\*\*\s*(?P<sign2>[-−–])?\s*\$\s*(?P<num>[\d,]+(?:\.\d{1,2})?)\s*\*\*"
    r"|"
    r"(?P<sign3>[-−–])?\s*\$(?P<num2>[\d,]+(?:\.\d{1,2})?)"
)
MONTH_NAMES = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
PROVIDER_IDS = {
    "socal gas": "gas_socal",
    "gas": "gas_socal",
    "sce": "electric_sce",
    "electric": "electric_sce",
    "frazier park water/utility": "water_frazier_park",
    "frazier park": "water_frazier_park",
    "water": "water_frazier_park",
    "starlink": "internet_starlink",
    "internet": "internet_starlink",
}
PROVIDER_LABELS = {
    "gas_socal": "SoCal Gas",
    "electric_sce": "SCE",
    "water_frazier_park": "Frazier Park",
    "internet_starlink": "Starlink",
}
FLOW_LINES = {
    "payroll income": "income",
    "payroll": "income",
    "income": "income",
    "other in": "other_in",
    "other income": "other_in",
    "lifestyle spend": "lifestyle",
    "lifestyle": "lifestyle",
    "debt service": "debt",
    "debt": "debt",
    "interest/fees": "fees",
    "interest": "fees",
    "fees": "fees",
    "cash/atm": "atm",
    "cash atm": "atm",
    "atm": "atm",
    "net": "net",
}
FLOW_FIELDS = ("income", "other_in", "lifestyle", "debt", "fees", "atm", "net")


def num(value):
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return round(float(value), 2)
    try:
        return round(float(str(value).replace(",", "").replace("$", "")), 2)
    except (TypeError, ValueError):
        return None


def r2(value):
    return round(float(value), 2)


def repo_root():
    return os.path.dirname(os.path.abspath(__file__))


def outside_repo(path):
    root = os.path.abspath(repo_root())
    dest = os.path.abspath(path)
    return dest != root and not dest.startswith(root + os.sep)


def parse_table(lines):
    rows = []
    for ln in lines:
        if not ln.startswith("|"):
            if rows:
                break
            continue
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if not cells or set(cells[0]) <= set("-: "):
            continue
        if all(re.fullmatch(r":?-{3,}:?", c.replace(" ", "")) or c == "" for c in cells):
            continue
        rows.append(cells)
    if len(rows) < 2:
        return []
    header, body = rows[0], rows[1:]
    out = []
    for cells in body:
        if len(cells) < len(header):
            cells = cells + [""] * (len(header) - len(cells))
        out.append(dict(zip(header, cells)))
    return out


def split_sections(md):
    sections, cur = [], None
    for ln in md.splitlines():
        m = re.match(r"^## (.+)", ln)
        if m:
            cur = {"title": m.group(1).strip(), "body": []}
            sections.append(cur)
            continue
        if cur is not None:
            cur["body"].append(ln)
    for s in sections:
        s["body"] = "\n".join(s["body"]).strip()
    return sections


def section_by(sections, pred):
    for s in sections:
        if pred(s["title"].lower()):
            return s
    return None


def classify_label(label):
    text = (label or "").lower()
    if "available" in text or re.search(r"\bavail\b", text):
        return "avail"
    if "current value" in text:
        return "plain"
    if "current" in text:
        return "current"
    if "harvest" in text or re.search(r"\bold\b", text) or "stale" in text:
        return "harvest"
    if "hold" in text:
        return "hold"
    return "plain"


def labeled_amounts(text, bold_only=False):
    found = []
    pattern = r"(.{0,48})\*\*" + MONEY + r"\*\*"
    for m in re.finditer(pattern, text or ""):
        found.append((classify_label(m.group(1)), num(m.group(2)), m.group(1).strip()))
    if found or bold_only:
        return found
    for m in re.finditer(r"(.{0,48})" + MONEY, text or ""):
        found.append((classify_label(m.group(1)), num(m.group(2)), m.group(1).strip()))
    return found


def pick_balance(amounts):
    """Cash only: prefer available. Never treat current or a harvest figure as spendable."""
    avail = [a for a in amounts if a[0] == "avail"]
    plain = [a for a in amounts if a[0] == "plain"]
    current = [a for a in amounts if a[0] == "current"]
    balance = avail[-1][1] if avail else (plain[-1][1] if plain else None)
    cur = current[-1][1] if current else None
    av = avail[-1][1] if avail else None
    return balance, av, cur


def canonical_section(title):
    """Group cards into the sections the page already renders."""
    raw = (title or "").strip()
    text = raw.lower()
    if "cash flow" in text or "net worth" in text or text.startswith("recent") or "utilit" in text:
        return raw
    if "card" in text:
        return "Cards (detail)"
    if "loan" in text:
        return "Loans"
    if (
        "nonliquid" in text or "non-liquid" in text or "beyond cash" in text
        or text == "assets" or text.startswith("assets")
    ):
        return "Assets beyond cash"
    if text == "cash" or text.startswith("cash"):
        return "Cash"
    return raw


def scan_money(text):
    """Amounts in reading order, each with the label on its own side of the previous amount."""
    found = []
    prev = 0
    for match in _MONEY_TOKEN.finditer(text or ""):
        raw = match.group("num") or match.group("num2")
        value = num(raw)
        if value is None:
            prev = match.end()
            continue
        sign = bool(match.group("sign") or match.group("sign2") or match.group("sign3"))
        before = text[prev:match.start()]
        cut = max(before.rfind("\n"), before.rfind("·"), before.rfind("|"))
        if cut >= 0:
            before = before[cut + 1:]
        after = text[match.end():match.end() + 32]
        after = re.split(r"[\n·\|]|\$|\*\*", after)[0]
        found.append((value, sign, before, after))
        prev = match.end()
    return found


def _words(before, after):
    text = re.sub(r"[*$]+", " ", before or "")
    text = re.sub(r"\s+", " ", text).strip().lower()
    if re.search(r"[a-z]", text):
        return text
    return re.sub(r"\s+", " ", re.sub(r"[*$]+", " ", after or "")).strip().lower()


def debt_role(before, after):
    """What a dollar figure is on a card or loan. The outstanding balance is the only figure that may be the bar."""
    label = _words(before, after)
    if re.search(r"auto[\s-]?pay", label):
        return "autopay"
    if re.search(r"minimum|\bmin\b", label):
        return "minimum"
    if re.search(r"amount due|payment due|\bdue\b", label):
        return "due"
    if re.search(r"bi-?weekly|half[\s-]?draft|\bdraft\b", label):
        return "draft"
    if re.search(r"principal\s+and\s+interest|\bp\s*&\s*i\b|\bp&i\b", label):
        return "pi"
    if re.search(r"\bescrow\b|\binsurance\b", label):
        return "escrow"
    if re.search(r"statement balance|last statement", label):
        return "statement"
    if re.search(r"prior|previous|\bold\b|harvest|stale", label):
        return "prior"
    if re.search(r"projected|pending payoff|after pending|\bpending\b", label):
        return "projected"
    if re.search(r"\bchange\b|decreas|increas", label):
        return "change"
    if re.search(r"available|\bavail\b|credit limit|\blimit\b|tradable|read[\s-]?only", label):
        return "ignore"
    if re.search(r"outstanding|\bposted\b|\bprincipal\b|current balance|\bbalance\b|\bowed\b", label):
        return "balance"
    return "plain"


def _first(items, role):
    for item_role, value in items:
        if item_role == role:
            return value
    return None


def apply_debt_body(card, body):
    """Outstanding balance is the first labeled balance, else the first unlabeled amount.

    Autopay, minimum, amount due, a prior balance, a biweekly draft, escrow and a
    pending-payoff projection are stored beside it and never become the balance.
    A minimum of zero is kept. An unknown minimum is not filled from autopay.
    """
    found = []
    rejected = False
    for line in (body or "").splitlines():
        if re.match(r"^\s*terms:", line, re.I):
            continue
        for value, sign, before, after in scan_money(line):
            role = "change" if sign else debt_role(before, after)
            if role in ("autopay", "minimum", "due", "draft", "prior", "statement", "projected", "pi", "escrow"):
                rejected = True
            found.append((role, value))
    balance = _first(found, "balance")
    if balance is None:
        balance = _first(found, "plain")
    if balance is not None:
        card["balance"] = balance
    autopay = _first(found, "autopay")
    if autopay is not None:
        card["autopay"] = autopay
    minimum = _first(found, "minimum")
    if minimum is not None:
        card["minimum_due"] = minimum
    due = _first(found, "due")
    if due is not None:
        card["amount_due"] = due
    prior = _first(found, "prior")
    if prior is not None:
        card["prior_balance"] = prior
    statement = _first(found, "statement")
    if statement is not None:
        card["statement_balance"] = statement
    projected = _first(found, "projected")
    if projected is not None:
        card["projected"] = projected
    draft = _first(found, "draft")
    if draft is not None:
        card["draft"] = draft
    if re.search(r"\bunknown\b|\bn/a\b|\btbd\b|\bnot known\b", body or "", re.I) and balance is None:
        card["unknown"] = True
    card["_rejected_debt_amount"] = rejected and balance is None


def _component_name(line):
    stripped = (line or "").strip()
    named = re.match(
        r"^(car|bike|bicycle|truck|suv|motorcycle|vehicle)\b\s*[:\-]?\s*(.*)$",
        stripped,
        re.I,
    )
    if named:
        return named.group(1).lower()
    colon = re.match(r"^([A-Za-z][\w' .-]{0,24}?)\s*:\s+\S", stripped)
    if not colon:
        return None
    name = colon.group(1).strip()
    if re.search(r"gross|equity|cost|total|value|balance|terms|first|market|principal", name, re.I):
        return None
    return name


def apply_asset_body(card, body):
    """Gross value is the asset figure. Equity, cost and a partial vehicle list are not.

    A brokerage total is not added to the cash and securities already inside it.
    Read-only and tradable are not reasons to drop the account or to use a subset.
    Unknown stays unknown and is not stored as zero.
    """
    components = []
    gross = equity = cost = total = None
    parts = []
    part_unknown = False
    unlabeled = []
    said_unknown = False
    for line in (body or "").splitlines():
        if re.match(r"^\s*terms:", line, re.I):
            continue
        low = line.lower()
        name = _component_name(line)
        amounts = [(value, before, after) for value, sign, before, after in scan_money(line) if not sign]
        unknown_line = bool(re.search(r"\bunknown\b|\bn/a\b|\btbd\b|\bnot known\b|\?", low))
        if name and (unknown_line or amounts):
            if unknown_line or not amounts:
                components.append({"name": name, "gross": None, "unknown": True})
            else:
                label = _words(amounts[0][1], amounts[0][2])
                if re.search(r"\bcost\b|first cost|purchase", label) and not re.search(r"gross|value|market", label):
                    components.append({"name": name, "gross": None, "cost": amounts[0][0], "unknown": True})
                else:
                    components.append({"name": name, "gross": amounts[0][0], "unknown": False})
            continue
        if unknown_line and not amounts:
            said_unknown = True
            continue
        for value, before, after in amounts:
            label = _words(before, after)
            if re.search(r"available|\bavail\b|tradable|read[\s-]?only", label):
                continue
            if re.search(r"\bequity\b", label):
                equity = value
                continue
            if re.search(r"first cost|purchase price|cost basis|\bcost\b", label) and not re.search(
                r"gross|market|current value|\bvalue\b", label
            ):
                cost = value
                continue
            if re.search(r"\b(total|aggregate|portfolio)\b", label):
                total = value
                continue
            if re.search(r"gross|market|valuation|zillow|appraised|current value|\bvalue\b", label):
                gross = value
                continue
            if re.search(r"\b(cash|securities|stocks|bonds|positions)\b", label):
                parts.append(value)
                continue
            unlabeled.append(value)
        if unknown_line and re.search(r"\b(cash|securities|stocks|bonds|positions)\b", low):
            part_unknown = True
    if cost is not None:
        card["cost"] = cost
    if equity is not None:
        card["equity"] = equity
    if components:
        card["components"] = components
        if any(item.get("unknown") or item.get("gross") is None for item in components):
            card["balance"] = None
            card["unknown"] = True
        else:
            card["balance"] = r2(sum(item["gross"] for item in components))
            card["gross"] = card["balance"]
        return
    if part_unknown or (said_unknown and total is None and gross is None):
        card["balance"] = None
        card["unknown"] = True
        if parts:
            card["parts"] = parts
        return
    if total is not None:
        card["balance"] = total
        card["gross"] = total
    elif gross is not None:
        card["balance"] = gross
        card["gross"] = gross
    elif unlabeled:
        card["balance"] = unlabeled[0]
        card["gross"] = unlabeled[0]
    elif parts:
        card["balance"] = r2(sum(parts))
    if parts:
        card["parts"] = parts


def card_kind(card):
    section = card.get("section") or ""
    name = card.get("name") or ""
    blob = name + "\n" + "\n".join(card.get("lines") or [])
    terms = card.get("terms") or {}
    if section == "Cash":
        return "cash"
    if section == "Assets beyond cash":
        return "asset"
    mortgage = bool(re.search(r"\bmortgage\b", name, re.I)) or (
        terms.get("frequency") == "biweekly" and (terms.get("pi") is not None or terms.get("escrow") is not None)
    )
    if section == "Loans" and mortgage:
        return "mortgage"
    if section == "Loans":
        return "installment"
    if section == "Cards (detail)":
        if re.search(r"\bflex\b|\binstallment\b", blob, re.I):
            return "installment"
        return "revolving"
    return "other"


def finish_cards(cards):
    """Terms may name the principal. They must not turn a draft or an autopay into the balance or the minimum."""
    counts = {}
    for card in cards:
        counts[card["id"]] = counts.get(card["id"], 0) + 1
    for card in cards:
        terms = dict(card.get("terms") or {})
        if card.get("balance") is None and terms.get("principal") is not None:
            card["balance"] = terms["principal"]
        if (
            card.get("minimum_due") is not None
            and terms.get("min_payment") is None
            and not terms.get("min_unknown")
        ):
            terms["min_payment"] = card["minimum_due"]
        if terms.get("draft") is not None:
            card["draft"] = terms["draft"]
        if terms.get("frequency") == "biweekly":
            terms["unapplied"] = "hold_until_full_payment"
            terms.setdefault("extra_principal_policy", "unknown")
        if terms:
            card["terms"] = terms
        elif "terms" in card and not card["terms"]:
            card.pop("terms", None)
        card["kind"] = card_kind(card)
        rejected = card.pop("_rejected_debt_amount", False)
        if (
            card["kind"] in ("revolving", "installment", "mortgage")
            and card.get("balance") is None
            and not is_attention(card)
            and (rejected or card.get("unknown"))
        ):
            card["unknown"] = True
        if counts[card["id"]] > 1:
            card["duplicate"] = True
            if "DUPLICATE" not in (card.get("marks") or []):
                card.setdefault("marks", []).append("DUPLICATE")
    return cards


def parse_holds(lines):
    holds = []
    for ln in lines:
        if not re.search(r"\bHOLD\b|ACH HOLD", ln, re.I):
            continue
        amounts = labeled_amounts(ln)
        amt = None
        for kind, value, _ctx in amounts:
            if kind == "hold" or kind == "plain" or kind == "current":
                amt = abs(value) if value is not None else None
        if amt is None and amounts:
            amt = abs(amounts[-1][1])
        if amt is None:
            continue
        memo = re.sub(r"\*\*", "", ln).strip()
        holds.append({"amount": amt, "memo": memo})
    return holds


def marks_in(status):
    marks = []
    for key in MARK_KEYS:
        if re.search(r"(?<![A-Z])" + re.escape(key) + r"(?![A-Z])", status or ""):
            marks.append(key)
    if re.search(r"PAST DUE", status or "", re.I) and "PAST DUE" not in marks:
        marks.append("PAST DUE")
    return marks


def is_attention(card):
    marks = set(card.get("marks") or [])
    if marks & {"STALE?", "NEED YOU", "PAST DUE"}:
        return True
    blob = (card.get("status") or "") + " " + " ".join(card.get("lines") or [])
    return bool(re.search(r"PAST DUE", blob, re.I))


def is_fresh_plaid(card):
    if card.get("plaid"):
        return True
    blob = (card.get("status") or "") + " " + " ".join(card.get("lines") or [])
    return bool(re.search(r"PLAID", blob, re.I))


def card_asof(card):
    m = re.search(r"(\d{4}-\d{2}-\d{2})", card.get("asof") or "")
    return m.group(1) if m else ""


def parse_cards(lines):
    cards, card, sec = [], None, ""
    for ln in lines:
        m = re.match(r"^## (.+)", ln)
        if m:
            sec = canonical_section(m.group(1).strip())
            card = None
            continue
        m = CARD_RE.match(ln)
        if m:
            card = {
                "id": m.group(1),
                "name": m.group(2).strip() or m.group(1),
                "status": m.group(3).strip(),
                "section": sec,
                "lines": [],
                "balance": None,
                "source": "card",
            }
            cards.append(card)
            continue
        if ln.startswith("### "):
            card = None
            continue
        if card is not None and ln.startswith("- "):
            card["lines"].append(ln[2:].strip())
    for c in cards:
        body = "\n".join(c["lines"])
        if c.get("section") in ("Cards (detail)", "Loans"):
            apply_debt_body(c, body)
        elif c.get("section") == "Assets beyond cash":
            apply_asset_body(c, body)
        else:
            bold = labeled_amounts(body, bold_only=True)
            loose = labeled_amounts(body)
            amounts = list(bold)
            if not any(item[0] == "avail" for item in amounts):
                amounts.extend(item for item in loose if item[0] == "avail")
            if not any(item[0] == "current" for item in amounts):
                amounts.extend(item for item in loose if item[0] == "current")
            balance, avail, current = pick_balance(amounts)
            c["balance"] = balance
            if avail is not None:
                c["available"] = avail
            if current is not None:
                c["current"] = current
        holds = parse_holds(c["lines"])
        if holds:
            c["holds"] = holds
        c["marks"] = marks_in(c["status"])
        if "PLAID" in c["marks"] or re.search(r"PLAID", body, re.I):
            c["plaid"] = True
            c["source"] = "plaid"
            if "PLAID" in c["marks"]:
                c["marks"] = [m for m in c["marks"] if m != "PLAID"]
        if "GAP" in c["marks"] or "NEED YOU" in c["marks"]:
            if c.get("balance") is not None:
                c["prev"] = c["balance"]
            c["balance"] = None
            c.pop("available", None)
        dm = re.search(r"(\d{4}-\d{2}-\d{2}[^·]*)", c["status"])
        c["asof"] = dm.group(1).strip() if dm else None
    return cards


def parse_log(lines):
    out = []
    for ln in lines:
        if ln.startswith("- v") or re.match(r"^- \d{4}-\d{2}-\d{2} v\d+", ln):
            out.append(ln[2:].strip())
    return out


def overlay_amounts(entry, cid):
    """Every amount that belongs to this id, up to the next account id.

    The id keeps its letter suffix, so A6r is not read as A6.
    """
    found = []
    parts = re.split(rf"\b({ID_RE})\b", entry or "")
    idx = 1
    while idx + 1 < len(parts):
        if parts[idx] == cid:
            window = parts[idx + 1]
            for match in re.finditer(MONEY, window):
                label = window[max(0, match.start() - 40):match.start()]
                found.append((classify_label(label), num(match.group(1))))
        idx += 2
    return found


def newest_harvest(log):
    dated = []
    for idx, entry in enumerate(log):
        if "harvest" not in entry.lower():
            continue
        dm = re.search(r"(\d{4}-\d{2}-\d{2})", entry)
        dated.append((dm.group(1) if dm else "", idx, entry))
    if not dated:
        return None, ""
    dated.sort()
    entry = dated[-1][2]
    dm = re.search(r"(\d{4}-\d{2}-\d{2})", entry)
    return entry, (dm.group(1) if dm else "")


def apply_overlay(cards, log):
    """Fill gaps from the newest harvest. Never clobber fresh Plaid or available."""
    overlay_src, odate = newest_harvest(log)
    if not overlay_src:
        return None
    vm = re.search(r"v(\d+)", overlay_src)
    ver = vm.group(1) if vm else "?"
    for c in cards:
        if c.get("section") in ("Cards (detail)", "Loans"):
            # A harvest note must not replace the card's own outstanding balance,
            # and it must not fill one in when the card never stated one.
            mark_stale_from_overlay(c, overlay_src)
            continue
        if c.get("section") not in ("Cash", "Assets beyond cash"):
            mark_stale_from_overlay(c, overlay_src)
            continue
        if is_fresh_plaid(c):
            continue
        pairs = overlay_amounts(overlay_src, c["id"])
        mark_stale_from_overlay(c, overlay_src)
        asof = card_asof(c)
        if asof and odate and asof >= odate and c.get("balance") is not None:
            continue
        if not pairs:
            continue
        avail = [p for p in pairs if p[0] == "avail"]
        plain = [p for p in pairs if p[0] == "plain"]
        chosen = avail[-1][1] if avail else (plain[-1][1] if plain else None)
        if chosen is None:
            continue
        if c.get("balance") is not None and not avail:
            continue
        prev = c.get("balance")
        c["balance"] = chosen
        if avail:
            c["available"] = chosen
        c["source"] = f"log v{ver} {odate}".strip()
        if prev is not None and prev != chosen:
            c["prev"] = prev
    return overlay_src


def mark_stale_from_overlay(card, overlay_src):
    cid = re.escape(card["id"])
    stale = (
        re.search(r"\b%s\b[^·]*STALE\?" % cid, overlay_src)
        or re.search(r"%s/[^·]*STALE\?" % cid, overlay_src)
        or re.search(r"/%s[^·]*STALE\?" % cid, overlay_src)
    )
    if stale and "STALE?" not in card["marks"]:
        card["marks"].append("STALE?")


def _log_chrono(log):
    """Date order, not file order. Undated lines stay in place ahead of dated ones."""
    rows = []
    for idx, entry in enumerate(log or []):
        dated = re.search(r"(\d{4}-\d{2}-\d{2})", entry)
        rows.append((dated.group(1) if dated else "", idx, entry))
    rows.sort(key=lambda row: (row[0], row[1]))
    return rows


def _stress_score(entry):
    """The score after the arrow. Spaces around the arrow are optional."""
    match = re.search(r"stress\s*:?\s*(\d{3})\s*(?:→|->|to)\s*(\d{3})", entry or "", re.I)
    if match:
        return int(match.group(2))
    match = re.search(r"stress\s*:?\s*(\d{3})\b", entry or "", re.I)
    if match:
        return int(match.group(1))
    return None


def _revolving_figures(entry):
    """Posted revolving and a pending-payoff projection are different numbers."""
    posted = None
    projected = None
    text = entry or ""
    for match in re.finditer(
        r"(posted|projected|pending payoff|after pending)?\s*revolving\s*:?\s*\$\s*([\d,]+(?:\.\d+)?)",
        text,
        re.I,
    ):
        kind = (match.group(1) or "").lower()
        value = num(match.group(2))
        if kind in ("projected", "pending payoff", "after pending"):
            projected = value
        else:
            posted = value
    for match in re.finditer(
        r"(?:projected revolving|revolving projected|pending payoff|after pending)\s*:?\s*\$\s*([\d,]+(?:\.\d+)?)",
        text,
        re.I,
    ):
        projected = num(match.group(1))
    if re.search(r"revolving\s*:?\s*\$\s*[\d,]+(?:\.\d+)?\s+projected\b", text, re.I):
        tail = re.search(
            r"revolving\s*:?\s*\$\s*[\d,]+(?:\.\d+)?\s+projected\s*:?\s*\$\s*([\d,]+(?:\.\d+)?)",
            text,
            re.I,
        )
        if tail:
            projected = num(tail.group(1))
    return posted, projected


def parse_headline(md, log):
    head = {
        "stress": None,
        "banked": None,
        "revolving": None,
        "floor": 3000,
        "revolving_basis": "posted",
    }
    logged_banked = None
    stress_asof = ""
    revolving_asof = ""
    for when, _idx, entry in _log_chrono(log):
        match = re.search(r"banked(?:\s+liquid)?\s*:?\s*\$([\d,\.]+)", entry, re.I)
        if match:
            logged_banked = num(match.group(1))
            head["banked"] = logged_banked
        posted, projected = _revolving_figures(entry)
        if projected is not None:
            head["revolving_projected"] = projected
            head["revolving_projected_asof"] = when or None
        if posted is not None:
            head["revolving"] = posted
            head["revolving_source"] = "log"
            revolving_asof = when
        score = _stress_score(entry)
        if score is not None:
            head["stress"] = score
            head["stress_note"] = entry[:160]
            stress_asof = when
    if head["stress"] is None:
        match = re.search(r"\*\*(\d{3})\*\* / 1000", md)
        if match:
            head["stress"] = int(match.group(1))
    match = re.search(r"Floor goal: \*\*" + MONEY, md)
    if match:
        head["floor"] = num(match.group(1))
    if logged_banked is not None:
        head["logged_banked"] = logged_banked
    if stress_asof:
        head["stress_asof"] = stress_asof
    if revolving_asof:
        head["revolving_asof"] = revolving_asof
    return head


def _history_score(entry):
    match = re.search(
        r"^(\d{4}-\d{2}-\d{2}).*?stress\s*:?\s*(\d{3})\s*(?:→|->|to)\s*(\d{3})",
        entry or "",
        re.I,
    )
    if match:
        return match.group(1), int(match.group(3))
    match = re.search(r"^(\d{4}-\d{2}-\d{2}).*?stress\s*:?\s*(\d{3})\b", entry or "", re.I)
    if match:
        return match.group(1), int(match.group(2))
    return None, None


def parse_history(lines, log, stress):
    hist = []
    for ln in lines:
        match = re.match(r"^\|\s*\**([^|*]+?)\**\s*\|\s*\**(\d{3})\**\s*\|", ln)
        if match and match.group(1).strip().lower() not in ("when", "night"):
            hist.append({"when": match.group(1).strip(), "score": int(match.group(2))})
    points = []
    for when, _idx, entry in _log_chrono(log):
        dated, score = _history_score(entry)
        if dated and score is not None:
            points.append((dated, score))
    for dated, score in points:
        if any(h["when"].startswith(dated) for h in hist):
            continue
        day = datetime.date.fromisoformat(dated)
        lab = day.strftime("%b ") + str(day.day)
        if any(h["when"].startswith(lab) and h["score"] == score for h in hist):
            continue
        hist.append({"when": lab + " (log)", "score": score, "date": dated})
    hist = [h for h in hist if h["when"] != "NIGHT HOLD"]
    if hist and stress and hist[-1]["score"] != stress:
        hist.append({"when": "now", "score": stress})
    for point in hist:
        point.pop("date", None)
    return hist


def blank_month(mid, label, stub):
    row = {"id": mid, "label": label, "stub": bool(stub)}
    for key in FLOW_FIELDS:
        row[key] = 0.0
    return row


def month_label(mid):
    year, month = mid.split("-")
    return datetime.date(int(year), int(month), 1).strftime("%b")


def window_year(window):
    m = re.search(r"(\d{4})", window or "")
    return int(m.group(1)) if m else datetime.date.today().year


def month_id_from_key(key, window):
    if re.fullmatch(r"\d{4}-\d{2}", str(key)):
        return str(key), False
    m = re.fullmatch(r"(\d{4})-(\d{2})\b(.*)", str(key))
    if m:
        return f"{m.group(1)}-{m.group(2)}", "stub" in (m.group(3) or "").lower()
    name = re.match(r"([A-Za-z]+)", str(key))
    if not name or name.group(1).lower() not in MONTH_NAMES:
        return None, False
    year = window_year(window)
    mid = f"{year}-{MONTH_NAMES[name.group(1).lower()]:02d}"
    stub = bool(re.search(r"\d", str(key))) or "stub" in str(key).lower()
    return mid, stub


def compute_net(row):
    return r2(
        (row.get("income") or 0)
        + (row.get("other_in") or 0)
        - (row.get("lifestyle") or 0)
        - (row.get("debt") or 0)
        - (row.get("fees") or 0)
        - (row.get("atm") or 0)
    )


def flow_from_bucket(bucket, mid, label, stub):
    row = blank_month(mid, label, stub)
    if not isinstance(bucket, dict):
        return row
    income = bucket.get("income", bucket.get("payroll"))
    if income is not None:
        row["income"] = num(income) or 0.0
    if bucket.get("other_in") is not None:
        row["other_in"] = num(bucket.get("other_in")) or 0.0
    if bucket.get("lifestyle") is not None:
        row["lifestyle"] = num(bucket.get("lifestyle")) or 0.0
    debt = bucket.get("debt_total")
    if debt is None and isinstance(bucket.get("debt"), (int, float)):
        debt = bucket.get("debt")
    if debt is None and isinstance(bucket.get("debt"), dict):
        debt = sum(num(bucket["debt"].get(k)) or 0 for k in ("mortgage", "cards", "student"))
    if debt is not None:
        row["debt"] = num(debt) or 0.0
    if bucket.get("fees") is not None:
        row["fees"] = num(bucket.get("fees")) or 0.0
    atm = bucket.get("atm", bucket.get("cash_atm"))
    if atm is not None:
        row["atm"] = num(atm) or 0.0
    if bucket.get("net") is not None:
        row["net"] = num(bucket.get("net")) or 0.0
    else:
        row["net"] = compute_net(row)
    cats = bucket.get("categories")
    items = []
    if isinstance(cats, dict):
        for key, value in cats.items():
            amount = _stated_amount(value)
            if amount is None:
                continue
            items.append({"name": key, "amount": amount})
        items.sort(key=lambda item: item["amount"], reverse=True)
    elif isinstance(cats, list):
        for cat in cats:
            if not isinstance(cat, dict):
                continue
            amount = _stated_amount(cat.get("amount"))
            if amount is None:
                continue
            item = {"name": cat.get("name") or "", "amount": amount}
            if cat.get("group"):
                item["group"] = cat.get("group")
            items.append(item)
    if items:
        row["categories"] = items
    stated = _stated_amount(bucket.get("categories_total"))
    if stated is None:
        stated = _stated_amount(bucket.get("merchant_spend"))
    cat_sum = r2(sum(item["amount"] for item in items)) if items else None
    if stated is not None and items and stated > cat_sum + 0.001:
        items.append({"name": "Uncategorized", "amount": r2(stated - cat_sum), "group": "remainder"})
        row["categories"] = items
        row["categories_partial"] = True
        row["burn"] = stated
    elif items:
        row["burn"] = stated if stated is not None else cat_sum
    else:
        row["burn"] = row["lifestyle"] or 0
    return row


def _stated_amount(value):
    """Zero is a measured zero. None and blank are no data."""
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return num(value)


def cashflow_from_monthly_categories(doc):
    """Read a midas.monthly_categories.v1 rollup. See docs/BOOK_SCHEMA.md."""
    coverage = doc.get("coverage") if isinstance(doc.get("coverage"), dict) else {}
    cover = {
        "complete": bool(coverage.get("complete")),
        "accounts_linked": list(coverage.get("accounts_linked") or []),
        "accounts_missing": list(coverage.get("accounts_missing") or []),
        "cash_coverage": coverage.get("cash_coverage") or "unknown",
        "note": coverage.get("note") or "",
    }
    months = []
    cat_months = []
    for bucket in doc.get("months") or []:
        if not isinstance(bucket, dict):
            continue
        mid = str(bucket.get("month") or bucket.get("id") or "")
        if not re.fullmatch(r"\d{4}-\d{2}", mid):
            continue
        totals = bucket.get("totals") if isinstance(bucket.get("totals"), dict) else {}
        mtd = bool(bucket.get("mtd"))
        row = {"id": mid, "label": month_label(mid), "stub": mtd}
        if bucket.get("asof"):
            row["asof"] = bucket["asof"]
        no_data = []
        for src, dest in (
            ("income", "income"),
            ("other_in", "other_in"),
            ("merchant_spend", "lifestyle"),
            ("debt_service", "debt"),
            ("fees", "fees"),
            ("atm", "atm"),
        ):
            if src not in totals or totals.get(src) is None:
                row[dest] = None
                no_data.append("merchant_spend" if dest == "lifestyle" else dest)
            else:
                row[dest] = num(totals.get(src))
        excluded = {}
        for key in ("transfers_excluded", "loan_proceeds_excluded"):
            if key in totals and totals.get(key) is not None:
                excluded[key] = num(totals.get(key))
        if excluded:
            row["excluded"] = excluded
        if no_data:
            row["no_data"] = no_data
            row["net"] = None
        else:
            row["net"] = compute_net(row)
        items = []
        for cat in bucket.get("categories") or []:
            if not isinstance(cat, dict):
                continue
            amount = _stated_amount(cat.get("amount"))
            if amount is None:
                continue
            item = {"name": cat.get("name") or "", "amount": amount}
            if cat.get("group"):
                item["group"] = cat["group"]
            items.append(item)
        merchant = row.get("lifestyle")
        cat_sum = r2(sum(item["amount"] for item in items)) if items else None
        if merchant is not None and cat_sum is not None and merchant > cat_sum + 0.001:
            items.append({
                "name": "Uncategorized",
                "amount": r2(merchant - cat_sum),
                "group": "remainder",
            })
            row["categories_partial"] = True
        if items:
            row["categories"] = items
            row["burn"] = merchant if merchant is not None else cat_sum
            cat_months.append({
                "id": mid,
                "label": row["label"],
                "stub": mtd,
                "items": items,
                "burn": row.get("burn"),
                "partial": bool(row.get("categories_partial")),
            })
        elif merchant is not None:
            row["burn"] = merchant
        months.append(row)
    months.sort(key=lambda row: row["id"])
    cat_months.sort(key=lambda row: row["id"])
    return {
        "window": "",
        "source": "midas.monthly_categories.v1",
        "schema": "midas.monthly_categories.v1",
        "coverage": cover,
        "months": months,
        "utilities": {"months": [], "providers": []},
        "categories": {
            "schema": "midas.monthly_categories.v1",
            "coverage": cover,
            "months": cat_months,
        },
        "pending": [],
    }


def utilities_from_rollup(doc, month_meta):
    raw = doc.get("utilities") if isinstance(doc, dict) else None
    if not isinstance(raw, dict):
        return {"months": []}
    provider_keys = [k for k in raw.keys() if k != "total" and isinstance(raw.get(k), dict)]
    months = []
    running = 0.0
    for mid, label, stub, source_key in month_meta:
        providers = {}
        for key in provider_keys:
            block = raw.get(key) or {}
            amount = None
            if source_key in block:
                amount = num(block.get(source_key))
            elif mid in block:
                amount = num(block.get(mid))
            if amount is None and isinstance(block.get("charges"), list):
                total = 0.0
                hit = False
                for charge in block["charges"]:
                    if isinstance(charge, (list, tuple)) and charge and str(charge[0]).startswith(mid):
                        total += num(charge[-1]) or 0
                        hit = True
                if hit:
                    amount = r2(total)
            if amount is not None:
                providers[key] = amount
        total = None
        total_block = raw.get("total") if isinstance(raw.get("total"), dict) else {}
        if source_key in total_block:
            total = num(total_block.get(source_key))
        elif mid in total_block:
            total = num(total_block.get(mid))
        if total is None:
            total = r2(sum(providers.values()))
        running = r2(running + (total or 0))
        stated = None
        if isinstance(raw.get("total"), dict) and "cum" in raw["total"] and source_key == month_meta[-1][3]:
            stated = num(raw["total"].get("cum"))
        months.append({
            "id": mid,
            "label": label,
            "stub": stub,
            "providers": providers,
            "total": total or 0.0,
            "cumulative": stated if stated is not None else running,
        })
    if months and isinstance(raw.get("total"), dict) and raw["total"].get("cum") is not None:
        months[-1]["cumulative"] = num(raw["total"]["cum"])
    return {"months": months, "providers": [
        {"id": key, "name": PROVIDER_LABELS.get(key, key)} for key in provider_keys
    ]}


def cashflow_from_rollup(doc):
    if not isinstance(doc, dict):
        return None
    if doc.get("schema") == "midas.monthly_categories.v1":
        return cashflow_from_monthly_categories(doc)
    window = doc.get("window") or ""
    source = doc.get("source") or ""
    meta = []
    rows = []
    if isinstance(doc.get("months"), list):
        for bucket in doc["months"]:
            if not isinstance(bucket, dict) or not bucket.get("id"):
                continue
            mid = bucket["id"]
            label = bucket.get("label") or month_label(mid)
            stub = bool(bucket.get("stub"))
            meta.append((mid, label, stub, mid))
            rows.append(flow_from_bucket(bucket, mid, label, stub))
    else:
        for key, bucket in doc.items():
            if key in ("window", "source", "utilities") or not isinstance(bucket, dict):
                continue
            if not any(k in bucket for k in ("payroll", "income", "lifestyle", "other_in", "debt", "debt_total")):
                continue
            mid, stub = month_id_from_key(key, window)
            if not mid:
                continue
            if "stub" in key.lower():
                stub = True
            label = month_label(mid)
            meta.append((mid, label, stub, key))
            rows.append(flow_from_bucket(bucket, mid, label, stub))
    rows.sort(key=lambda row: row["id"])
    meta.sort(key=lambda item: item[0])
    utilities = utilities_from_rollup(doc, meta)
    categories = {"months": [
        {
            "id": row["id"],
            "label": row["label"],
            "stub": row["stub"],
            "items": row.get("categories") or [],
            "burn": row.get("burn") or 0,
        }
        for row in rows if row.get("categories")
    ]}
    return {
        "window": window,
        "source": source,
        "months": rows,
        "utilities": utilities,
        "categories": categories,
        "pending": doc.get("nov1_3", {}).get("pending") if isinstance(doc.get("nov1_3"), dict) else doc.get("pending") or [],
    }


def _flow_line_key(label):
    key = re.sub(r"\s+", " ", (label or "").strip().lower())
    return FLOW_LINES.get(key)


def cashflow_from_ledger(md):
    sections = split_sections(md)
    flow = section_by(sections, lambda t: "cash flow" in t)
    if not flow:
        months = []
    else:
        months = _months_from_flow(flow["body"])
    utils = _utilities_from_ledger(section_by(sections, lambda t: "utilit" in t))
    categories = {"months": [
        {
            "id": row["id"],
            "label": row["label"],
            "stub": row["stub"],
            "items": row.get("categories") or [],
            "burn": row.get("burn") or 0,
        }
        for row in months if row.get("categories")
    ]}
    return {
        "window": "",
        "source": "LEDGER",
        "months": months,
        "utilities": utils,
        "categories": categories,
        "pending": [],
    }


def _months_from_flow(body):
    lines = body.splitlines()
    chunks = []
    cur = None
    for ln in lines:
        m = re.match(r"^###\s+(\d{4}-\d{2})\b(.*)$", ln.strip())
        if m:
            if cur:
                chunks.append(cur)
            cur = {"id": m.group(1), "stub": "stub" in m.group(2).lower(), "lines": []}
            continue
        if cur is not None:
            cur["lines"].append(ln)
    if cur:
        chunks.append(cur)
    if not chunks:
        return []
    months = []
    for chunk in chunks:
        row = blank_month(chunk["id"], month_label(chunk["id"]), chunk["stub"])
        tables, buf = [], []
        for ln in chunk["lines"] + [""]:
            if ln.startswith("|"):
                buf.append(ln)
            elif buf:
                tables.append(parse_table(buf))
                buf = []
        explicit_net = False
        for table in tables:
            if not table:
                continue
            keys = {k.lower() for k in table[0].keys()}
            header_line = " ".join(table[0].keys()).lower()
            if "category" in header_line:
                items = []
                name_key = next(k for k in table[0] if "cat" in k.lower())
                amt_key = next(k for k in table[0] if k != name_key)
                stated = None
                for rec in table:
                    name = rec.get(name_key) or ""
                    amount = _stated_amount(rec.get(amt_key))
                    if amount is None:
                        continue
                    if name.strip().lower() in ("total", "merchant spend", "merchant total"):
                        stated = amount
                        continue
                    items.append({"name": name, "amount": amount})
                got = r2(sum(item["amount"] for item in items)) if items else 0.0
                if stated is not None and stated > got + 0.001:
                    items.append({
                        "name": "Uncategorized",
                        "amount": r2(stated - got),
                        "group": "remainder",
                    })
                    row["categories_partial"] = True
                    row["burn"] = stated
                else:
                    row["burn"] = stated if stated is not None else got
                row["categories"] = items
                continue
            name_key = next(iter(table[0].keys()))
            amt_key = [k for k in table[0].keys() if k != name_key]
            amt_key = amt_key[0] if amt_key else name_key
            for rec in table:
                field = _flow_line_key(rec.get(name_key))
                if not field:
                    continue
                amount = num(rec.get(amt_key))
                if amount is None:
                    continue
                row[field] = amount
                if field == "net":
                    explicit_net = True
        if not explicit_net:
            row["net"] = compute_net(row)
        if "burn" not in row:
            row["burn"] = row["lifestyle"]
        months.append(row)
    months.sort(key=lambda row: row["id"])
    return months


def _provider_id(header):
    key = header.strip().lower()
    if key in PROVIDER_IDS:
        return PROVIDER_IDS[key]
    for name, pid in PROVIDER_IDS.items():
        if name in key:
            return pid
    slug = re.sub(r"[^a-z0-9]+", "_", key).strip("_")
    return slug or None


def _utilities_from_ledger(section):
    if not section:
        return {"months": [], "providers": []}
    table = parse_table(section["body"].splitlines())
    if not table:
        return {"months": [], "providers": []}
    month_key = next(k for k in table[0] if "month" in k.lower())
    provider_cols = []
    for key in table[0]:
        if key == month_key:
            continue
        pid = _provider_id(key)
        if pid and pid != "total":
            provider_cols.append((key, pid))
    months = []
    running = 0.0
    providers_seen = []
    for rec in table:
        raw_month = rec.get(month_key) or ""
        m = re.search(r"(\d{4}-\d{2})", raw_month)
        if not m:
            continue
        mid = m.group(1)
        stub = "stub" in raw_month.lower()
        values = {}
        for col, pid in provider_cols:
            amount = num(rec.get(col))
            if amount is None:
                continue
            values[pid] = amount
            if pid not in providers_seen:
                providers_seen.append(pid)
        total = r2(sum(values.values()))
        running = r2(running + total)
        months.append({
            "id": mid,
            "label": month_label(mid),
            "stub": stub,
            "providers": values,
            "total": total,
            "cumulative": running,
        })
    return {
        "months": months,
        "providers": [{"id": pid, "name": PROVIDER_LABELS.get(pid, pid)} for pid in providers_seen],
    }


def merge_month(base, override):
    if base is None:
        return json.loads(json.dumps(override))
    if override is None:
        return base
    merged = json.loads(json.dumps(base))
    for key in FLOW_FIELDS:
        if key in override and override[key] is not None:
            merged[key] = override[key]
    if override.get("categories"):
        merged["categories"] = override["categories"]
    if override.get("burn") is not None:
        merged["burn"] = override["burn"]
    merged["stub"] = bool(override.get("stub"))
    merged["label"] = override.get("label") or merged.get("label")
    return merged


def merge_utilities(base, override):
    by_id = {m["id"]: json.loads(json.dumps(m)) for m in (base or {}).get("months") or []}
    providers = {p["id"]: p for p in (base or {}).get("providers") or []}
    for m in (override or {}).get("months") or []:
        cur = by_id.get(m["id"])
        if not cur:
            by_id[m["id"]] = json.loads(json.dumps(m))
        else:
            prov = dict(cur.get("providers") or {})
            prov.update(m.get("providers") or {})
            cur["providers"] = prov
            cur["total"] = m.get("total") if m.get("total") is not None else cur.get("total")
            cur["stub"] = m.get("stub")
            cur["label"] = m.get("label") or cur.get("label")
            by_id[m["id"]] = cur
    for p in (override or {}).get("providers") or []:
        providers[p["id"]] = p
    months = [by_id[k] for k in sorted(by_id)]
    running = 0.0
    for month in months:
        running = r2(running + (month.get("total") or 0))
        if month.get("cumulative") is None:
            month["cumulative"] = running
    if months and (override or {}).get("months"):
        last_over = (override.get("months") or [])[-1]
        if last_over.get("id") == months[-1]["id"] and last_over.get("cumulative") is not None:
            months[-1]["cumulative"] = last_over["cumulative"]
    return {"months": months, "providers": list(providers.values())}


def merge_cashflow(ledger_cf, rollup_cf):
    ledger_cf = ledger_cf or {"months": [], "utilities": {"months": []}, "categories": {"months": []}, "window": "", "source": ""}
    if not rollup_cf:
        return _finalize_cashflow(ledger_cf)
    by_id = {m["id"]: m for m in ledger_cf.get("months") or []}
    for row in rollup_cf.get("months") or []:
        by_id[row["id"]] = merge_month(by_id.get(row["id"]), row)
    months = [by_id[k] for k in sorted(by_id)]
    utilities = merge_utilities(ledger_cf.get("utilities"), rollup_cf.get("utilities"))
    cat_by = {m["id"]: m for m in (ledger_cf.get("categories") or {}).get("months") or []}
    for row in (rollup_cf.get("categories") or {}).get("months") or []:
        cat_by[row["id"]] = row
    categories = {"months": [cat_by[k] for k in sorted(cat_by)]}
    incoming = rollup_cf.get("categories") if isinstance(rollup_cf.get("categories"), dict) else {}
    if not incoming and isinstance(ledger_cf.get("categories"), dict):
        incoming = ledger_cf.get("categories") or {}
    if incoming.get("schema"):
        categories["schema"] = incoming["schema"]
    if incoming.get("coverage"):
        categories["coverage"] = incoming["coverage"]
    merged = {
        "window": rollup_cf.get("window") or ledger_cf.get("window") or "",
        "source": rollup_cf.get("source") or ledger_cf.get("source") or "",
        "months": months,
        "utilities": utilities,
        "categories": categories,
        "pending": rollup_cf.get("pending") or [],
    }
    if rollup_cf.get("schema"):
        merged["schema"] = rollup_cf["schema"]
    if rollup_cf.get("coverage"):
        merged["coverage"] = rollup_cf["coverage"]
    return _finalize_cashflow(merged)


def _finalize_cashflow(cf):
    months = cf.get("months") or []
    running = 0.0
    utils = cf.get("utilities") or {"months": [], "providers": []}
    for month in utils.get("months") or []:
        running = r2(running + (month.get("total") or 0))
        if month.get("cumulative") is None:
            month["cumulative"] = running
    cf["utilities"] = utils
    cf["months"] = months
    return cf


def _hold_key(acct, amount):
    return (acct or "", r2(abs(amount or 0)))


def liquid_from(cards, pending):
    by_acct = []
    holds = []
    seen = set()
    avail_sum = 0.0
    current_sum = 0.0
    have_avail = False
    have_current = False
    names = {}
    for c in cards:
        if c.get("section") != "Cash":
            continue
        names[c["id"]] = c.get("name") or c["id"]
        avail = c.get("available")
        if avail is None and c.get("balance") is not None and not is_attention(c):
            avail = c.get("balance")
        current = c.get("current")
        entry = {
            "id": c["id"],
            "name": c.get("name") or c["id"],
            "avail": avail if not is_attention(c) else None,
            "current": current,
            "source": c.get("source") or "",
            "plaid": bool(c.get("plaid")),
            "stale": is_attention(c),
        }
        by_acct.append(entry)
        if not is_attention(c) and isinstance(avail, (int, float)):
            avail_sum += avail
            have_avail = True
        if isinstance(current, (int, float)):
            current_sum += current
            have_current = True
        for hold in c.get("holds") or []:
            key = _hold_key(c["id"], hold.get("amount"))
            if key in seen:
                continue
            seen.add(key)
            holds.append({
                "acct": c["id"],
                "name": c.get("name") or c["id"],
                "amount": r2(abs(hold.get("amount") or 0)),
                "memo": hold.get("memo") or "",
            })
    for item in pending or []:
        if not isinstance(item, (list, tuple)) or len(item) < 3:
            continue
        acct, memo, amount = item[0], str(item[1]), num(item[2])
        if amount is None:
            continue
        if not re.search(r"HOLD", memo, re.I):
            continue
        key = _hold_key(str(acct), amount)
        if key in seen:
            continue
        seen.add(key)
        holds.append({
            "acct": str(acct),
            "name": names.get(str(acct), str(acct)),
            "amount": r2(abs(amount)),
            "memo": memo,
        })
    return {
        "avail": r2(avail_sum) if have_avail else None,
        "current": r2(current_sum) if have_current else None,
        "holds": holds,
        "by_acct": by_acct,
    }


def parse_networth_section(section):
    if not section:
        return []
    table = parse_table(section["body"].splitlines())
    snaps = []
    if table:
        keys = list(table[0].keys())
        when_key = next((k for k in keys if "when" in k.lower() or "date" in k.lower()), keys[0])
        asset_key = next((k for k in keys if "asset" in k.lower()), None)
        liab_key = next((k for k in keys if "liab" in k.lower()), None)
        net_key = next((k for k in keys if k.lower() == "net" or "net" in k.lower()), None)
        for rec in table:
            when = rec.get(when_key) or ""
            m = re.search(r"(\d{4}-\d{2}-\d{2})", when)
            if not m:
                continue
            assets = num(rec.get(asset_key)) if asset_key else None
            liab = num(rec.get(liab_key)) if liab_key else None
            net = num(rec.get(net_key)) if net_key else None
            if net is None and assets is not None and liab is not None:
                net = r2(assets - liab)
            complete = assets is not None and liab is not None and net is not None
            snaps.append({
                "when": m.group(1),
                "assets": assets,
                "liabilities": liab,
                "net": net if complete else None,
                "source": "ledger",
                "basis": "posted",
                "complete": complete,
            })
        return snaps
    return snaps


def snapshots_from_log(log):
    snaps = []
    for entry in log:
        dated = re.search(r"(\d{4}-\d{2}-\d{2})", entry)
        when = dated.group(1) if dated else None
        if not when:
            continue
        m = re.search(
            r"assets \$([\d,\.]+).{0,40}liabilit(?:y|ies) \$([\d,\.]+)",
            entry,
            re.I,
        )
        projected = bool(re.search(r"projected|pending payoff|after pending", entry, re.I))
        if m:
            assets, liab = num(m.group(1)), num(m.group(2))
            snaps.append({
                "when": when,
                "assets": assets,
                "liabilities": liab,
                "net": r2((assets or 0) - (liab or 0)),
                "source": "log",
                "basis": "projected" if projected else "posted",
                "complete": not projected,
            })
            continue
        m = re.search(r"(?:net worth|nw) \$([\d,\.]+)", entry, re.I)
        if m:
            snaps.append({
                "when": when,
                "assets": None,
                "liabilities": None,
                "net": num(m.group(1)),
                "source": "log",
                "basis": "projected" if projected else "posted",
                "complete": not projected,
            })
    return snaps


def load_sidecar(path):
    if not path:
        return []
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    rows = data if isinstance(data, list) else (data.get("snapshots") or [])
    out = []
    for row in rows:
        if not isinstance(row, dict) or not row.get("when"):
            continue
        assets, liab = num(row.get("assets")), num(row.get("liabilities"))
        net = num(row.get("net"))
        if net is None and assets is not None and liab is not None:
            net = r2(assets - liab)
        out.append({
            "when": row["when"],
            "assets": assets,
            "liabilities": liab,
            "net": net,
            "source": row.get("source") or "sidecar",
        })
    return out


def merge_snapshots(parts):
    by_when = {}
    for row in parts:
        cur = by_when.get(row["when"])
        if cur is None:
            by_when[row["when"]] = dict(row)
            continue
        for key in ("assets", "liabilities", "net"):
            if cur.get(key) is None and row.get(key) is not None:
                cur[key] = row[key]
        if cur.get("source") == "sidecar" and row.get("source") != "sidecar":
            cur["source"] = row["source"]
    return [by_when[k] for k in sorted(by_when)]


def choose_revolving(head, cards):
    """Posted revolving is not Flex installment debt and not a pending-payoff projection.

    A complete set of newer card balances replaces an older log figure. A partial
    set does not, because a missing card would understate the total.
    """
    head = dict(head)
    flex = [
        c for c in cards
        if c.get("section") == "Cards (detail)" and c.get("kind") == "installment"
        and isinstance(c.get("balance"), (int, float)) and not c.get("unknown")
    ]
    if flex:
        head["installment"] = r2(sum(c["balance"] for c in flex))
    revolving_cards = [c for c in cards if c.get("kind") == "revolving"]
    unknown = [
        c for c in revolving_cards
        if c.get("unknown") or (c.get("balance") is None and not is_attention(c))
    ]
    known = [
        c for c in revolving_cards
        if isinstance(c.get("balance"), (int, float)) and not c.get("unknown")
    ]
    card_sum = None
    card_when = ""
    if known and not unknown:
        card_sum = r2(sum(c["balance"] for c in known))
        card_when = max((card_asof(c) for c in known), default="")
    log_when = head.get("revolving_asof") or ""
    if card_sum is not None and card_when and (not log_when or card_when > log_when):
        head["revolving"] = card_sum
        head["revolving_source"] = "cards"
        head["revolving_asof"] = card_when
    elif head.get("revolving") is None and card_sum is not None:
        head["revolving"] = card_sum
        head["revolving_source"] = "cards"
        if card_when:
            head["revolving_asof"] = card_when
    head["revolving_basis"] = "posted"
    return head


def networth_position(cards, head):
    """Known gross assets and posted liabilities. Unknown parts make the result INCOMPLETE.

    Equity is not added, and it is not substituted for gross. A projected revolving
    figure is not the liability. Flex installment sits with liabilities, not inside
    the revolving total.
    """
    missing = []
    assets = 0.0
    liab = 0.0
    have_a = False
    have_l = False
    for card in cards:
        section = card.get("section")
        attention = is_attention(card)
        amount = card.get("balance")
        known = isinstance(amount, (int, float)) and not card.get("unknown")
        if section == "Cash":
            if attention or not known:
                continue
            assets += amount
            have_a = True
        elif section == "Assets beyond cash":
            if not known:
                if not attention:
                    missing.append(card.get("name") or card["id"])
                continue
            assets += amount
            have_a = True
        elif section == "Loans":
            if not known:
                if not attention:
                    missing.append(card.get("name") or card["id"])
                continue
            if attention:
                continue
            liab += amount
            have_l = True
        elif section == "Cards (detail)" and card.get("kind") == "installment":
            if known:
                liab += amount
                have_l = True
            elif not attention:
                missing.append(card.get("name") or card["id"])
        elif section == "Cards (detail)" and card.get("kind") == "revolving" and card.get("unknown") and not attention:
            missing.append(card.get("name") or card["id"])
    if isinstance(head.get("revolving"), (int, float)):
        liab += head["revolving"]
        have_l = True
    elif head.get("revolving_projected") is not None:
        missing.append("posted revolving")
    status = "INCOMPLETE" if missing else "COMPLETE"
    net = r2(assets - liab) if status == "COMPLETE" and have_a and have_l else None
    return {
        "status": status,
        "assets": r2(assets) if have_a else None,
        "liabilities": r2(liab) if have_l else None,
        "net": net,
        "missing": missing,
        "basis": "posted",
        "projected_revolving": head.get("revolving_projected"),
    }


def stale_rows(cards):
    rows = []
    for c in cards:
        if not is_attention(c):
            continue
        rows.append({
            "id": c["id"],
            "name": c.get("name") or c["id"],
            "section": c.get("section") or "",
            "marks": list(c.get("marks") or []),
            "asof": c.get("asof"),
            "status": c.get("status") or "",
        })
    return rows


def apply_spendable_headline(head, liquid):
    if liquid.get("avail") is not None:
        head["spendable"] = liquid["avail"]
        head["banked"] = liquid["avail"]
    elif head.get("banked") is not None:
        head["spendable"] = head["banked"]
    else:
        head["spendable"] = None
    return head



# ---- Midas v2 (2026-11-05): the terms line and the plan line (docs/BOOK_SCHEMA.md) ----
_AMT = r"\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)"


def parse_terms(line):
    """Split a terms bullet into purchase APR, promo APR, due day and promo end.

    A promo rate is not the purchase APR. A promo end date is not the payment due day.
    min $0 is a real minimum. 'min unknown' stays unknown and is not an autopay amount.
    """
    body = re.sub(r"^\s*terms:\s*", "", line, flags=re.I)
    deferred = bool(re.search(r"deferred[\s-]*interest", body, re.I))
    out = {}
    purchase = None
    bare_apr = None
    for part in [p.strip() for p in re.split(r"·|\|", body) if p.strip()]:
        low = part.lower()
        match = re.match(r"(?:purchase|post-promo|post promo)\s+apr\s*([0-9.]+)\s*%?", low)
        if match:
            purchase = float(match.group(1))
            continue
        match = re.match(
            r"promo(?:\s*apr)?\s*([0-9.]+)\s*%?\s*(?:to|until|through)\s*([0-9]{4}-[0-9]{2}-[0-9]{2})",
            low,
        )
        if match:
            out["promo_apr"] = float(match.group(1))
            out["promo_end"] = match.group(2)
            continue
        match = re.match(r"promo(?:\s*(?:end|expir\w*))\s*([0-9]{4}-[0-9]{2}-[0-9]{2})", low)
        if match:
            out["promo_end"] = match.group(1)
            continue
        match = re.match(
            r"apr\s*([0-9.]+)\s*%?\s*(?:to|until|through)\s*([0-9]{4}-[0-9]{2}-[0-9]{2})",
            low,
        )
        if match:
            out["promo_apr"] = float(match.group(1))
            out["promo_end"] = match.group(2)
            continue
        match = re.match(r"apr\s*([0-9.]+)\s*%?", low)
        if match:
            bare_apr = float(match.group(1))
            continue
        if re.match(r"min(?:imum)?(?:\s+due)?\s*(unknown|\?|n/a)\b", low):
            out["min_unknown"] = True
            continue
        match = re.match(r"min(?:imum)?(?:\s+due)?\s*" + _AMT, low)
        if match:
            out["min_payment"] = num(match.group(1))
            continue
        match = re.match(r"due\s*(?:day\s*)?([0-9]{1,2})\b", low)
        if match and "promo" not in low and 1 <= int(match.group(1)) <= 31:
            out["due_day"] = int(match.group(1))
            continue
        match = re.match(r"limit\s*" + _AMT, low)
        if match:
            out["credit_limit"] = num(match.group(1))
            continue
        match = re.match(r"as of\s*([0-9]{4}-[0-9]{2}-[0-9]{2})", low)
        if match:
            out["asof"] = match.group(1)
            continue
        match = re.match(r"(?:p\s*&\s*i|p&i|pi|principal and interest)\s*" + _AMT, low)
        if match:
            out["pi"] = num(match.group(1))
            continue
        match = re.match(r"escrow\s*" + _AMT, low)
        if match:
            out["escrow"] = num(match.group(1))
            continue
        match = re.match(r"(?:bi-?weekly\s+)?draft\s*" + _AMT, low)
        if match:
            out["draft"] = num(match.group(1))
            continue
        match = re.match(r"frequency\s+(bi-?weekly|monthly|weekly)", low)
        if match:
            freq = match.group(1).replace("-", "")
            out["frequency"] = "biweekly" if "biweekly" in freq else freq
            continue
        match = re.match(r"principal\s*" + _AMT, low)
        if match and "interest" not in low:
            out["principal"] = num(match.group(1))
            continue
        match = re.match(r"extra principal\s+(unknown|none|annual|monthly)", low)
        if match:
            out["extra_principal_policy"] = match.group(1)
            continue
    if purchase is not None:
        out["apr"] = purchase
    elif bare_apr is not None:
        if bare_apr == 0 and out.get("promo_end") and out.get("promo_apr") == 0:
            pass
        elif bare_apr == 0 and out.get("promo_end") and "promo_apr" not in out:
            out["promo_apr"] = 0.0
        else:
            out["apr"] = bare_apr
    if deferred:
        out["deferred_interest"] = True
    if out.get("frequency") == "biweekly":
        out["unapplied"] = "hold_until_full_payment"
        out.setdefault("extra_principal_policy", "unknown")
    return out


def apply_terms(cards):
    for c in cards:
        for ln in c.get("lines") or []:
            if re.match(r"^\s*terms:", ln, re.I):
                t = parse_terms(ln)
                if t:
                    c["terms"] = t
                break
    return cards


def parse_plan(md):
    """'- plan: avalanche' | '- plan: snowball' | '- plan: order L8, L6, N1' and '- plan budget: $900' anywhere in the ledger."""
    plan = {}
    m = re.search(r"^\s*-\s*plan:\s*(.+)$", md or "", re.M | re.I)
    if m:
        v = m.group(1).strip()
        if v.lower().startswith("order"):
            plan["method"] = "custom"
            plan["order"] = [x.strip() for x in re.split(r"[,\s]+", v[5:]) if x.strip()]
        elif v.lower() in ("avalanche", "snowball"):
            plan["method"] = v.lower()
    m = re.search(r"^\s*-\s*plan budget:\s*" + _AMT, md or "", re.M | re.I)
    if m:
        plan["budget"] = num(m.group(1))
    return plan or None

def build_book(md, rollup=None, sidecar=None, now=None):
    md = md or ""
    lines = md.splitlines()
    sections = split_sections(md)
    cards = finish_cards(apply_terms(parse_cards(lines)))
    log = parse_log(lines)
    overlay_src = apply_overlay(cards, log)
    head = choose_revolving(parse_headline(md, log), cards)
    hist = parse_history(lines, log, head.get("stress"))
    ledger_cf = cashflow_from_ledger(md) if md.strip() else {
        "months": [], "utilities": {"months": [], "providers": []},
        "categories": {"months": []}, "window": "", "source": "", "pending": [],
    }
    rollup_cf = cashflow_from_rollup(rollup) if rollup else None
    cashflow = merge_cashflow(ledger_cf, rollup_cf)
    pending = []
    if isinstance(rollup, dict):
        for value in rollup.values():
            if isinstance(value, dict) and isinstance(value.get("pending"), list):
                pending.extend(value["pending"])
        if isinstance(rollup.get("pending"), list):
            pending.extend(rollup["pending"])
    pending.extend(cashflow.get("pending") or [])
    liquid = liquid_from(cards, pending)
    apply_spendable_headline(head, liquid)
    snaps = []
    snaps.extend(parse_networth_section(section_by(sections, lambda t: "net worth" in t)))
    snaps.extend(snapshots_from_log(log))
    snaps.extend(load_sidecar(sidecar) if isinstance(sidecar, str) else (sidecar or []))
    networth = {"snapshots": merge_snapshots(snaps)}
    networth.update(networth_position(cards, head))
    upd = re.search(r"^Update: (.*)$", md, re.M)
    rev = re.search(r"^Revised: (.*)$", md, re.M)
    if now is None:
        now = datetime.datetime.now(datetime.timezone.utc).astimezone()
        built = now.strftime("%Y-%m-%d %H:%M UTC")
    else:
        built = now
    book = {
        "headline": head,
        "cards": cards,
        "history": hist,
        "sections": sections,
        "log": log[-12:],
        "ledger_update": upd.group(1) if upd else None,
        "ledger_revised": rev.group(1) if rev else None,
        "overlay_from": (overlay_src[:40] if overlay_src else None),
        "built_pt": built,
        "liquid": liquid,
        "cashflow": {
            "window": cashflow.get("window") or "",
            "source": cashflow.get("source") or "",
            "months": [
                {
                    k: row[k]
                    for k in (
                        "id", "label", "stub", *FLOW_FIELDS, "burn",
                        "no_data", "excluded", "categories_partial", "asof",
                    )
                    if k in row
                }
                for row in cashflow.get("months") or []
            ],
        },
        "utilities": cashflow.get("utilities") or {"months": [], "providers": []},
        "categories": cashflow.get("categories") or {"months": []},
        "networth": networth,
        "stale": stale_rows(cards),
    }
    plan = parse_plan(md)
    if plan:
        book["plan"] = plan
    return book


def default_cashflow_path():
    env = os.environ.get("CASHFLOW_JSON")
    if env:
        return env
    candidate = "/workspace/cashflow/oct2026-rollup.json"
    if os.path.isfile(candidate):
        return candidate
    return ""


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build Midas book JSON. Does not write plaintext into the repo.")
    parser.add_argument("--ledger", default=os.environ.get("LEDGER_MD", ""), help="Path to LEDGER.md (kept off git)")
    parser.add_argument("--cashflow", default="", help="Plaid rollup JSON. Defaults to $CASHFLOW_JSON or /workspace/cashflow/oct2026-rollup.json when that file is outside the repo.")
    parser.add_argument("--networth", default=os.environ.get("NETWORTH_JSON", ""), help="Sidecar snapshots JSON used when the log is trimmed")
    parser.add_argument("--out", default="", help="Write JSON here. Must be outside the repo.")
    args = parser.parse_args(argv)
    cash_path = args.cashflow or default_cashflow_path()
    md = ""
    if args.ledger:
        if not os.path.isfile(args.ledger):
            print("ledger not found: " + args.ledger, file=sys.stderr)
            return 2
        with open(args.ledger, "r", encoding="utf-8") as handle:
            md = handle.read()
    rollup = None
    if cash_path:
        if not os.path.isfile(cash_path):
            print("cashflow not found: " + cash_path, file=sys.stderr)
            return 2
        with open(cash_path, "r", encoding="utf-8") as handle:
            rollup = json.load(handle)
    if not md and rollup is None:
        print("pass --ledger and/or --cashflow", file=sys.stderr)
        return 2
    book = build_book(md, rollup=rollup, sidecar=args.networth or None)
    payload = json.dumps(book, indent=2)
    if args.out:
        if not outside_repo(args.out):
            print("refusing to write plaintext inside the repo: " + args.out, file=sys.stderr)
            return 2
        parent = os.path.dirname(os.path.abspath(args.out))
        os.makedirs(parent, exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(payload)
            handle.write("\n")
        print("wrote " + args.out + " (plaintext, do not commit)", file=sys.stderr)
    else:
        sys.stdout.write(payload)
        sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
