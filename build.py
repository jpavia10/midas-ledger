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
MARK_KEYS = [
    "VERIFIED", "GROK", "APP", "SMS", "STALE?", "NEED YOU", "HOLD",
    "SCREENSHOT", "GAP", "OK", "PAST DUE", "PLAID",
]
CARD_RE = re.compile(r"^### ((?:[A-Z]\d+b?))\s*(?:·)?\s*(.*?)\s+[—–-]\s+(.*)$")
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
    """Prefer available. Never treat current or a harvest figure as spendable."""
    avail = [a for a in amounts if a[0] == "avail"]
    plain = [a for a in amounts if a[0] == "plain"]
    current = [a for a in amounts if a[0] == "current"]
    balance = avail[-1][1] if avail else (plain[-1][1] if plain else None)
    cur = current[-1][1] if current else None
    av = avail[-1][1] if avail else None
    return balance, av, cur


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
            sec = m.group(1).strip()
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
        if c["id"] == "A16":
            m = re.search(r"current value \*\*" + MONEY, body, re.I)
            if m:
                c["balance"] = num(m.group(1))
        elif c["id"] != "A8":
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
        if c["id"] == "A7":
            c["name"] = "401(k)/ESOP"
    return cards


def parse_log(lines):
    out = []
    for ln in lines:
        if ln.startswith("- v") or re.match(r"^- \d{4}-\d{2}-\d{2} v\d+", ln):
            out.append(ln[2:].strip())
    return out


def overlay_amounts(entry, cid):
    """Every amount that belongs to this id, up to the next account id."""
    found = []
    parts = re.split(r"\b([A-Z]\d+b?)\b", entry or "")
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
        if c.get("section") not in ("Cash", "Cards (detail)", "Assets beyond cash"):
            mark_stale_from_overlay(c, overlay_src)
            continue
        if c["id"] == "A6" and "Roth" in (c.get("name") or ""):
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


def parse_headline(md, log):
    head = {"stress": None, "banked": None, "revolving": None, "floor": 3000}
    logged_banked = None
    for entry in log:
        m = re.search(r"banked(?: liquid)? \$([\d,\.]+)", entry, re.I)
        if m:
            logged_banked = num(m.group(1))
            head["banked"] = logged_banked
        m = re.search(r"revolving \$([\d,\.]+)", entry, re.I)
        if m:
            head["revolving"] = num(m.group(1))
        m = re.search(r"stress (?:\d+ → )?(\d{3})", entry, re.I)
        if m:
            head["stress"] = int(m.group(1))
            head["stress_note"] = entry[:160]
    if head["stress"] is None:
        m = re.search(r"\*\*(\d{3})\*\* / 1000", md)
        if m:
            head["stress"] = int(m.group(1))
    m = re.search(r"Floor goal: \*\*" + MONEY, md)
    if m:
        head["floor"] = num(m.group(1))
    if logged_banked is not None:
        head["logged_banked"] = logged_banked
    return head


def parse_history(lines, log, stress):
    hist = []
    for ln in lines:
        m = re.match(r"^\|\s*\**([^|*]+?)\**\s*\|\s*\**(\d{3})\**\s*\|", ln)
        if m and m.group(1).strip().lower() not in ("when", "night"):
            hist.append({"when": m.group(1).strip(), "score": int(m.group(2))})
    for entry in log:
        m = re.search(r"^(\d{4}-\d{2}-\d{2}) v\d+.*?stress (\d{3}) → (\d{3})", entry)
        if m and not any(h["when"].startswith(m.group(1)) for h in hist):
            d = datetime.date.fromisoformat(m.group(1))
            lab = d.strftime("%b ") + str(d.day)
            if not any(h["when"].startswith(lab) and h["score"] == int(m.group(3)) for h in hist):
                hist.append({"when": lab + " (log)", "score": int(m.group(3))})
    hist = [h for h in hist if h["when"] != "NIGHT HOLD"]
    if hist and stress and hist[-1]["score"] != stress:
        hist.append({"when": "now", "score": stress})
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
    if isinstance(cats, dict):
        row["categories"] = sorted(
            ({"name": k, "amount": num(v) or 0.0} for k, v in cats.items()),
            key=lambda item: item["amount"],
            reverse=True,
        )
    elif isinstance(cats, list):
        row["categories"] = [
            {"name": c.get("name"), "amount": num(c.get("amount")) or 0.0}
            for c in cats if isinstance(c, dict)
        ]
    lifestyle = row["lifestyle"] or 0
    cat_sum = r2(sum(c["amount"] for c in row.get("categories") or []))
    row["burn"] = cat_sum if row.get("categories") else lifestyle
    return row


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
                for rec in table:
                    amount = num(rec.get(amt_key))
                    if amount is None:
                        continue
                    items.append({"name": rec.get(name_key) or "", "amount": amount})
                row["categories"] = items
                row["burn"] = r2(sum(i["amount"] for i in items))
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
    return _finalize_cashflow({
        "window": rollup_cf.get("window") or ledger_cf.get("window") or "",
        "source": rollup_cf.get("source") or ledger_cf.get("source") or "",
        "months": months,
        "utilities": utilities,
        "categories": {"months": [cat_by[k] for k in sorted(cat_by)]},
        "pending": rollup_cf.get("pending") or [],
    })


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
            snaps.append({
                "when": m.group(1), "assets": assets, "liabilities": liab, "net": net, "source": "ledger",
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
        if m:
            assets, liab = num(m.group(1)), num(m.group(2))
            snaps.append({
                "when": when,
                "assets": assets,
                "liabilities": liab,
                "net": r2((assets or 0) - (liab or 0)),
                "source": "log",
            })
            continue
        m = re.search(r"(?:net worth|nw) \$([\d,\.]+)", entry, re.I)
        if m:
            snaps.append({
                "when": when, "assets": None, "liabilities": None, "net": num(m.group(1)), "source": "log",
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


def build_book(md, rollup=None, sidecar=None, now=None):
    md = md or ""
    lines = md.splitlines()
    sections = split_sections(md)
    cards = parse_cards(lines)
    log = parse_log(lines)
    overlay_src = apply_overlay(cards, log)
    head = parse_headline(md, log)
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
                {k: row[k] for k in ("id", "label", "stub", *FLOW_FIELDS, "burn") if k in row}
                for row in cashflow.get("months") or []
            ],
        },
        "utilities": cashflow.get("utilities") or {"months": [], "providers": []},
        "categories": cashflow.get("categories") or {"months": []},
        "networth": networth,
        "stale": stale_rows(cards),
    }
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
