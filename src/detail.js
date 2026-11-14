/* Detail views for the decrypted book. Only fields the book already carries.
   Device notes, pins, and reviewed marks are stored beside the book, not inside it. */
import { balanceLabel, bindCharts, compositionHtml, flowChartsHtml, sparkHtml, spendableOf } from "./charts.js";
import { entryFor, formatReviewed, patchEntry } from "./desk.js";
import { focusField, releaseField } from "./particles.js";

export const ORDER = {
  L8: [1, "Phase 1"],
  L6: [1, "Phase 1"],
  L10: [2, "Phase 2"],
  L4: [3, "Phase 3"],
  L5: [3, "Phase 3"],
  L9: [4, "0% autopay"],
  L7: [5, "Cleared"],
  L11: [5, "Cleared"],
  L13: [6, "Hold"]
};

const SECTION_LABEL = {
  "Cards (detail)": "Cards",
  "Cash": "Cash",
  "Assets beyond cash": "Assets",
  "Loans": "Loans"
};

const MARK_HELP = {
  "VERIFIED": "Checked against a source in the book.",
  "STALE?": "The figure may be old.",
  "NEED YOU": "The book is waiting on you.",
  "HOLD": "Leave it. Do not act from this row.",
  "GAP": "A gap is still open.",
  "OK": "Marked ok in the book.",
  "GROK": "Noted from a Grok pass.",
  "APP": "Read from an app.",
  "SMS": "Read from a message.",
  "SCREENSHOT": "Taken from a screenshot."
};

const CARD_KNOWN = new Set(["section", "id", "name", "balance", "marks", "asof", "source", "prev", "lines", "status", "available", "current", "holds", "plaid"]);
const HEAD_KNOWN = new Set(["stress", "banked", "floor", "revolving", "spendable", "logged_banked", "stress_note"]);

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const OPEN_MS = 880;
const CLOSE_MS = 720;

let book = null;
let detailKey = null;
let sourceEl = null;
let closing = false;
let bound = false;
let suppressClick = false;
let closeTimer = 0;
let epoch = 0;

function money(n) {
  return n == null ? "—" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}

function reduceMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function labelFor(section) {
  return SECTION_LABEL[section] || section || "Account";
}

function fact(label, value) {
  if (value == null || value === "") return "";
  return `<div class="fact"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

function extraFacts(obj, known) {
  if (!obj || typeof obj !== "object") return "";
  return Object.keys(obj).map((key) => {
    if (known.has(key)) return "";
    const value = obj[key];
    if (value == null || typeof value === "object") return "";
    return fact(key, String(value));
  }).join("");
}

function tags(marks) {
  if (!marks || !marks.length) return "";
  return `<div class="tags">${marks.map((t) => {
    const cls = t === "STALE?" ? "st" : t === "NEED YOU" || t === "PAST DUE" ? "nd" : t === "HOLD" ? "hold" : t === "VERIFIED" ? "ok" : "";
    return `<span class="tag ${cls}">${esc(t)}</span>`;
  }).join("")}</div>`;
}

function markHelp(marks) {
  if (!marks || !marks.length) return "";
  const lines = marks.map((mark) => MARK_HELP[mark] ? `<li><b>${esc(mark)}</b> ${esc(MARK_HELP[mark])}</li>` : "").join("");
  return lines ? `<ul class="mark-help">${lines}</ul>` : "";
}

export function deviceHtml(card, entry) {
  const note = entry && entry.note ? entry.note : "";
  const pin = !!(entry && entry.pin);
  const reviewed = entry && entry.reviewed ? entry.reviewed : "";
  const copy = typeof card.balance === "number" && Number.isFinite(card.balance) ? money(card.balance) : "";
  const when = formatReviewed(reviewed);
  const copyBtn = copy
    ? `<button type="button" class="quiet-btn" data-act="copy" data-copy="${escAttr(copy)}">Copy balance</button>`
    : `<button type="button" class="quiet-btn" data-act="copy" disabled>Copy balance</button>`;
  return `<div class="device" data-device="${escAttr(card.id)}">
    <p class="kicker">On this device</p>
    <p class="meta">Saved in this browser only. It does not change the encrypted book.</p>
    <label class="device-note"><span>Device note</span>
      <textarea data-note rows="3" maxlength="2000" placeholder="A note for this device">${esc(note)}</textarea>
    </label>
    <div class="device-actions">
      <button type="button" class="quiet-btn" data-act="save-note">Save note</button>
      <button type="button" class="quiet-btn" data-act="pin" aria-pressed="${pin ? "true" : "false"}">${pin ? "Pinned" : "Pin"}</button>
      ${copyBtn}
      <button type="button" class="quiet-btn" data-act="reviewed" aria-pressed="${reviewed ? "true" : "false"}">${reviewed ? "Clear reviewed" : "Mark reviewed"}</button>
    </div>
    <p class="device-status" data-device-status>${when ? "Reviewed on this device · " + esc(when) : "Not reviewed on this device"}</p>
  </div>`;
}

function notes(lines) {
  if (!lines || !lines.length) return "";
  return `<div class="notes"><p class="kicker">Notes</p>${lines.map((line) => `<p>${esc(line)}</p>`).join("")}</div>`;
}

function cardRoster(c) {
  const phase = ORDER[c.id] ? ORDER[c.id][1] : "";
  const figure = balanceLabel(c);
  return `<button type="button" class="roster" data-open="card:${escAttr(c.id)}">
    <span><b>${esc(c.name)}</b> <span class="id">${esc(c.id)}</span>${phase ? ` <span class="phase">${esc(phase)}</span>` : ""}</span>
    <span class="figure">${figure}</span>
  </button>`;
}

function sortCards(list) {
  return list.slice().sort((a, b) => (ORDER[a.id]?.[0] ?? 9) - (ORDER[b.id]?.[0] ?? 9));
}

function cardsIn(bookData, section) {
  return (bookData.cards || []).filter((c) => c.section === section);
}

function floorNote(amount, floor) {
  const have = amount || 0;
  const goal = floor || 3000;
  const pct = Math.min(100, (have / goal) * 100);
  return pct >= 100 ? "Above floor by " + money(have - goal) : "Short " + money(goal - have);
}

function termsFacts(card) {
  const terms = card.terms;
  if (!terms) return "";
  const caveat = terms.promo_end || terms.deferred_interest
    ? fact("Promo caveat", "Deferred interest can apply if the balance is unpaid by the promo end. That date is not the payment due day.")
    : "";
  return [
    fact("Purchase APR", terms.apr != null ? terms.apr + "%" : ""),
    fact("Promo APR", terms.promo_apr != null ? terms.promo_apr + "%" : ""),
    fact("Promo end", terms.promo_end || ""),
    fact("Due day", terms.due_day != null ? String(terms.due_day) : ""),
    fact("Minimum", terms.min_unknown ? "unknown" : terms.min_payment != null ? money(terms.min_payment) : ""),
    fact("P&I", terms.pi != null ? money(terms.pi) : ""),
    fact("Escrow", terms.escrow != null ? money(terms.escrow) : ""),
    fact("Frequency", terms.frequency || ""),
    fact("Unapplied drafts", terms.unapplied || ""),
    caveat,
  ].join("");
}

function cardDetail(bookData, id) {
  const matches = (bookData.cards || []).filter((c) => c.id === id);
  const card = matches[0];
  if (!card) return "";
  const phase = ORDER[card.id] ? ORDER[card.id][1] : "";
  const siblings = cardsIn(bookData, card.section).filter((c) => c.id !== card.id);
  const siblingLabel = "Also in " + labelFor(card.section);
  return `<p class="kicker">${esc(labelFor(card.section))}</p>
    <h2 id="detail-title">${esc(card.name)}</h2>
    <p class="figure${card.section === "Loans" ? " debt" : ""}">${card.unknown ? '<span class="pending">unknown</span>' : card.balance == null ? '<span class="pending">see note</span>' : money(card.balance)}</p>
    ${matches.length > 1 ? `<p class="meta">Duplicate id ${esc(card.id)} is on ${matches.length} cards.</p>` : ""}
    ${tags(card.marks)}
    ${markHelp(card.marks)}
    <div class="facts">
      ${fact("Id", card.id)}
      ${fact("Section", card.section)}
      ${fact("Available", typeof card.available === "number" ? money(card.available) : "")}
      ${fact("Current", typeof card.current === "number" ? money(card.current) : "")}
      ${fact("As of", card.asof)}
      ${fact("Source", card.source)}
      ${card.prev != null ? fact("Card said", money(card.prev)) : ""}
      ${fact("Status", card.status)}
      ${fact("Payoff", phase)}
      ${fact("Gross", typeof card.gross === "number" ? money(card.gross) : "")}
      ${fact("Equity", typeof card.equity === "number" ? money(card.equity) : "")}
      ${card.unknown ? fact("Value", "unknown") : ""}
      ${card.autopay != null ? fact("Autopay", money(card.autopay) + " · not the balance") : ""}
      ${card.minimum_due != null ? fact("Minimum due", money(card.minimum_due)) : ""}
      ${card.projected != null ? fact("Pending payoff", money(card.projected) + " · not posted") : ""}
      ${card.draft != null ? fact("Draft", money(card.draft) + " · not principal") : ""}
      ${termsFacts(card)}
      ${extraFacts(card, new Set([...CARD_KNOWN, "gross", "equity", "unknown", "kind", "autopay", "draft", "projected", "minimum_due", "prior_balance", "statement_balance", "amount_due", "cost", "duplicate", "parts"]))}
    </div>
    ${(card.holds || []).length ? `<div class="notes"><p class="kicker">Holds</p>${card.holds.map((hold) => `<p>${esc(hold.memo || "Hold")} · ${money(hold.amount)}</p>`).join("")}</div>` : ""}
    ${notes(card.lines)}
    ${siblings.length ? `<div class="related"><p class="kicker">${esc(siblingLabel)}</p><div class="roster-list">${siblings.map(cardRoster).join("")}</div></div>` : ""}`;
}

function metricDetail(bookData, which) {
  const h = bookData.headline || {};
  if (which === "stress") {
    const history = bookData.history || [];
    return `<p class="kicker">Stress</p>
      <h2 id="detail-title">${h.stress ?? "?"}</h2>
      <p class="meta">/1000 · lower better · goal &lt;400</p>
      ${sparkHtml(history)}
      <div class="facts">
        ${fact("Score", h.stress == null ? "" : String(h.stress))}
        ${fact("Goal", "<400")}
        ${fact("Points", String(history.length))}
        ${fact("Built", bookData.built_pt)}
        ${fact("Ledger", bookData.ledger_update || bookData.ledger_revised || "")}
        ${extraFacts(h, HEAD_KNOWN)}
      </div>
      ${history.length ? `<div class="related"><p class="kicker">History</p><div class="roster-list">${history.map((point, i) => `<button type="button" class="roster" data-open="history:${i}">
        <span>${esc(point.when)}</span><span class="figure">${esc(point.score)}</span>
      </button>`).join("")}</div></div>` : ""}`;
  }
  if (which === "banked" || which === "spendable") {
    const have = spendableOf(bookData);
    const note = floorNote(have, h.floor);
    const holds = (bookData.liquid && bookData.liquid.holds) || [];
    return `<p class="kicker">Spendable available</p>
      <h2 id="detail-title">${money(have)}</h2>
      <p class="meta">${esc(note)}</p>
      <div class="facts">
        ${fact("Spendable", money(have))}
        ${fact("Current", bookData.liquid && typeof bookData.liquid.current === "number" ? money(bookData.liquid.current) : "")}
        ${fact("Floor", money(h.floor))}
        ${fact("Gap", note)}
        ${fact("Built", bookData.built_pt)}
        ${fact("Ledger", bookData.ledger_update || bookData.ledger_revised || "")}
        ${extraFacts(h, HEAD_KNOWN)}
      </div>
      ${holds.length ? `<div class="notes"><p class="kicker">Holds</p>${holds.map((hold) => `<p>${esc(hold.acct || "")} ${esc(hold.memo || "")} · ${money(hold.amount)}</p>`).join("")}</div>` : ""}`;
  }
  if (which === "revolving") {
    return `<p class="kicker">Revolving total</p>
      <h2 id="detail-title" class="debt">${money(h.revolving)}</h2>
      ${compositionHtml(bookData.cards || [])}
      <div class="facts">
        ${fact("Revolving", money(h.revolving))}
        ${fact("Built", bookData.built_pt)}
        ${fact("Ledger", bookData.ledger_update || bookData.ledger_revised || "")}
        ${extraFacts(h, HEAD_KNOWN)}
      </div>
      ${sortCards(cardsIn(bookData, "Cards (detail)")).length ? `<div class="related"><p class="kicker">Card accounts</p><div class="roster-list">${sortCards(cardsIn(bookData, "Cards (detail)")).map(cardRoster).join("")}</div></div>` : ""}`;
  }
  return "";
}

function historyDetail(bookData, index) {
  const point = (bookData.history || [])[index];
  if (!point) return "";
  const known = new Set(["when", "score"]);
  return `<p class="kicker">Stress history</p>
    <h2 id="detail-title">${esc(point.when)}</h2>
    <p class="figure">${esc(point.score)}</p>
    <div class="facts">
      ${fact("When", point.when)}
      ${fact("Score", point.score == null ? "" : String(point.score))}
      ${fact("Goal", "<400")}
      ${extraFacts(point, known)}
    </div>`;
}

function sectionDetail(bookData, index) {
  const section = (bookData.sections || [])[index];
  if (!section) return "";
  const others = (bookData.sections || []).map((s, i) => i === index ? "" : `<button type="button" class="roster" data-open="section:${i}"><span>${esc(s.title)}</span><span class="go" aria-hidden="true">→</span></button>`).join("");
  return `<p class="kicker">Full ledger</p>
    <h2 id="detail-title">${esc(section.title)}</h2>
    <pre class="detail-pre">${esc(section.body || "")}</pre>
    ${extraFacts(section, new Set(["title", "body"]))}
    ${others ? `<div class="related"><p class="kicker">Other pages</p><div class="roster-list">${others}</div></div>` : ""}`;
}

function logDetail(bookData, index) {
  const log = bookData.log || [];
  const line = log[index];
  if (line == null) return "";
  const others = log.map((entry, i) => i === index ? "" : `<button type="button" class="roster" data-open="log:${i}"><span>${esc(entry)}</span></button>`).join("");
  return `<p class="kicker">Recent log</p>
    <h2 id="detail-title">Entry ${index + 1}</h2>
    <pre class="detail-pre">${esc(line)}</pre>
    ${others ? `<div class="related"><p class="kicker">Other entries</p><div class="roster-list">${others}</div></div>` : ""}`;
}

function groupDetail(bookData, name) {
  if (name === "overview") {
    const h = bookData.headline || {};
    return `<p class="kicker">The book</p>
      <h2 id="detail-title">Overview</h2>
      <p class="meta">Built ${esc(bookData.built_pt || "")} · ledger: ${esc(bookData.ledger_update || bookData.ledger_revised || "")}</p>
      <div class="roster-list">
        <button type="button" class="roster" data-open="metric:stress"><span>Stress</span><span class="figure">${esc(h.stress ?? "—")}</span></button>
        <button type="button" class="roster" data-open="metric:banked"><span>Spendable</span><span class="figure">${money(spendableOf(bookData))}</span></button>
        <button type="button" class="roster" data-open="metric:revolving"><span>Revolving total</span><span class="figure debt">${money(h.revolving)}</span></button>
      </div>`;
  }
  if (name === "cards") {
    const list = sortCards(cardsIn(bookData, "Cards (detail)"));
    return `<p class="kicker">Payoff order</p><h2 id="detail-title">Cards</h2><div class="roster-list">${list.map(cardRoster).join("")}</div>`;
  }
  if (name === "cash") {
    return `<p class="kicker">On hand</p><h2 id="detail-title">Cash</h2><div class="roster-list">${cardsIn(bookData, "Cash").map(cardRoster).join("")}</div>`;
  }
  if (name === "assets") {
    return `<p class="kicker">Beyond cash</p><h2 id="detail-title">Assets</h2><div class="roster-list">${cardsIn(bookData, "Assets beyond cash").map(cardRoster).join("")}</div>`;
  }
  if (name === "loans") {
    return `<p class="kicker">Owed</p><h2 id="detail-title">Loans</h2><div class="roster-list">${cardsIn(bookData, "Loans").map(cardRoster).join("")}</div>`;
  }
  if (name === "attention") {
    const list = (bookData.cards || []).filter((c) => (c.marks || []).includes("NEED YOU") || (c.marks || []).includes("STALE?"));
    return `<p class="kicker">Needs you / stale</p><h2 id="detail-title">Attention</h2><div class="roster-list">${list.map(cardRoster).join("")}</div>`;
  }
  if (name === "flow") {
    return `<p class="kicker">Flow</p><h2 id="detail-title">Cash flow</h2>${flowChartsHtml(bookData)}`;
  }
  if (name === "book") {
    const pages = (bookData.sections || []).map((s, i) => `<button type="button" class="roster" data-open="section:${i}"><span>${esc(s.title)}</span><span class="go" aria-hidden="true">→</span></button>`).join("");
    const logs = (bookData.log || []).map((entry, i) => `<button type="button" class="roster" data-open="log:${i}"><span>${esc(entry)}</span></button>`).join("");
    return `<p class="kicker">Written pages</p><h2 id="detail-title">Full ledger</h2>
      ${pages ? `<div class="roster-list">${pages}</div>` : ""}
      ${logs ? `<div class="related"><p class="kicker">Recent log</p><div class="roster-list">${logs}</div></div>` : ""}`;
  }
  if (name === "log") {
    const logs = (bookData.log || []).map((entry, i) => `<button type="button" class="roster" data-open="log:${i}"><span>${esc(entry)}</span></button>`).join("");
    return `<p class="kicker">Recent log</p><h2 id="detail-title">Log</h2><div class="roster-list">${logs}</div>`;
  }
  return "";
}

export function detailHtml(bookData, key) {
  if (!bookData || !key) return "";
  if (key.startsWith("card:")) return cardDetail(bookData, key.slice(5));
  if (key.startsWith("metric:")) return metricDetail(bookData, key.slice(7));
  if (key.startsWith("history:")) return historyDetail(bookData, Number(key.slice(8)));
  if (key.startsWith("section:")) return sectionDetail(bookData, Number(key.slice(8)));
  if (key.startsWith("log:")) return logDetail(bookData, Number(key.slice(4)));
  if (key.startsWith("group:")) return groupDetail(bookData, key.slice(6));
  return "";
}

export function focusSpec(bookData, key) {
  const base = { shift: 0, pull: 0.16, scale: 1.18, z: 3.25 };
  if (!key) return { ...base, scroll: 0.04 };
  if (key.startsWith("card:")) {
    const card = (bookData?.cards || []).find((c) => c.id === key.slice(5));
    const section = card && card.section;
    if (section === "Cash") return { ...base, scroll: 0.36, scale: 1.22 };
    if (section === "Loans") return { ...base, scroll: 0.98, scale: 1.2 };
    if (section === "Assets beyond cash") return { ...base, scroll: 0.52, scale: 1.16 };
    if (section === "Cards (detail)") return { ...base, scroll: 0.66, scale: 1.16 };
    return { ...base, scroll: 0.22 };
  }
  if (key === "metric:banked" || key === "group:cash") return { ...base, scroll: 0.36, scale: 1.22 };
  if (key === "metric:revolving" || key === "group:loans") return { ...base, scroll: 0.98, scale: 1.2 };
  if (key === "metric:stress" || key === "group:overview") return { ...base, scroll: 0.04, scale: 1.14 };
  if (key === "group:assets") return { ...base, scroll: 0.52 };
  if (key.startsWith("section:") || key.startsWith("log:") || key === "group:book" || key === "group:log") return { ...base, scroll: 0.74 };
  if (key === "group:cards" || key === "group:attention") return { ...base, scroll: 0.66 };
  if (key.startsWith("history:")) return { ...base, scroll: 0.08 };
  return { ...base, scroll: 0.2 };
}

export function setBook(data) {
  book = data;
}

function compose(key) {
  const inner = detailHtml(book, key);
  if (!inner || !key.startsWith("card:")) return inner;
  const card = (book.cards || []).find((c) => c.id === key.slice(5));
  if (!card) return inner;
  return inner + deviceHtml(card, entryFor(card.id));
}

function flash(box, message) {
  const status = box.querySelector("[data-device-status]");
  if (!status) return;
  if (!status.dataset.restore) status.dataset.restore = status.textContent;
  status.textContent = message;
  clearTimeout(box._flash);
  box._flash = setTimeout(() => {
    status.textContent = status.dataset.restore || "";
  }, 1600);
}

function paintDevice(box, entry) {
  const pin = box.querySelector("[data-act='pin']");
  if (pin) {
    pin.setAttribute("aria-pressed", entry.pin ? "true" : "false");
    pin.textContent = entry.pin ? "Pinned" : "Pin";
  }
  const reviewed = box.querySelector("[data-act='reviewed']");
  if (reviewed) {
    reviewed.setAttribute("aria-pressed", entry.reviewed ? "true" : "false");
    reviewed.textContent = entry.reviewed ? "Clear reviewed" : "Mark reviewed";
  }
  const status = box.querySelector("[data-device-status]");
  if (!status) return;
  const when = formatReviewed(entry.reviewed);
  const text = when ? "Reviewed on this device · " + when : "Not reviewed on this device";
  status.textContent = text;
  status.dataset.restore = text;
}

function saveNote(box, announce) {
  if (!box) return;
  const area = box.querySelector("[data-note]");
  if (!area) return;
  const id = box.getAttribute("data-device");
  const text = area.value.slice(0, 2000);
  const prev = entryFor(id);
  if (prev.note === text) {
    if (announce) flash(box, "Note saved on this device");
    return;
  }
  patchEntry(id, { note: text });
  flash(box, "Note saved on this device");
}

async function copyBalance(box) {
  const button = box.querySelector("[data-act='copy']");
  const text = button ? button.getAttribute("data-copy") || "" : "";
  if (!text) return;
  let ok = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      ok = true;
    }
  } catch (e) {
    ok = false;
  }
  if (!ok) {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      ok = document.execCommand("copy");
      area.remove();
    } catch (e) {
      ok = false;
    }
  }
  flash(box, ok ? "Copied " + text : "Couldn’t copy from this browser");
}

function runDeviceAct(act) {
  const box = act.closest("[data-device]");
  if (!box) return;
  const id = box.getAttribute("data-device");
  const kind = act.getAttribute("data-act");
  if (kind === "save-note") {
    saveNote(box, true);
    return;
  }
  if (kind === "pin") {
    const entry = entryFor(id);
    paintDevice(box, patchEntry(id, { pin: !entry.pin }));
    return;
  }
  if (kind === "reviewed") {
    const entry = entryFor(id);
    paintDevice(box, patchEntry(id, { reviewed: entry.reviewed ? "" : new Date().toISOString() }));
    return;
  }
  if (kind === "copy") copyBalance(box);
}

function shell(inner) {
  return `<div class="detail-scrim" data-close></div>
    <div class="detail-panel glass" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <button type="button" class="detail-back" data-close><span aria-hidden="true">←</span> Back</button>
      <div class="detail-body">${inner}</div>
    </div>`;
}

function layer() {
  return document.getElementById("detail");
}

function finishClose(gen) {
  if (gen !== epoch) return;
  epoch += 1;
  clearTimeout(closeTimer);
  const root = layer();
  if (root) {
    root.hidden = true;
    root.innerHTML = "";
  }
  document.body.classList.remove("is-detail");
  detailKey = null;
  sourceEl = null;
  closing = false;
  releaseField();
}

function playOpen(panel, from) {
  if (reduceMotion()) return;
  const last = panel.getBoundingClientRect();
  const dx = (from.left + from.width / 2) - (last.left + last.width / 2);
  const dy = (from.top + from.height / 2) - (last.top + last.height / 2);
  const sx = from.width / Math.max(1, last.width);
  const sy = from.height / Math.max(1, last.height);
  const s = Math.max(0.42, Math.min(sx, sy));
  panel.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${s})`, transformOrigin: "center" },
    { transform: "translate(0, 0) scale(1)", transformOrigin: "center" }
  ], { duration: OPEN_MS, easing: EASE, fill: "both" });
  const scrim = layer().querySelector(".detail-scrim");
  if (scrim) scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 460, easing: "ease-out", fill: "both" });
  const body = panel.querySelector(".detail-body");
  if (body) {
    body.animate([
      { opacity: 0, transform: "translateY(18px)" },
      { opacity: 1, transform: "translateY(0)" }
    ], { duration: 520, easing: EASE, delay: 160, fill: "both" });
  }
}

function bindDrag(panel) {
  let startY = 0;
  let startX = 0;
  let tracking = false;
  let dragging = false;
  panel.addEventListener("pointerdown", (event) => {
    if (panel.scrollTop > 4) return;
    if (event.button != null && event.button !== 0) return;
    if (event.target.closest("textarea, input, button, a, [data-chart]")) return;
    startY = event.clientY;
    startX = event.clientX;
    tracking = true;
    dragging = false;
  });
  panel.addEventListener("pointermove", (event) => {
    if (!tracking) return;
    const dy = event.clientY - startY;
    const dx = event.clientX - startX;
    if (dy > 12 && dy > Math.abs(dx) * 1.2) {
      dragging = true;
      panel.style.transform = `translateY(${Math.min(dy * 0.65, 160)}px)`;
    }
  });
  const end = (event) => {
    if (!tracking) return;
    const dy = event.clientY - startY;
    tracking = false;
    if (dragging && dy > 96) {
      suppressClick = true;
      panel.style.transform = "";
      closeDetail();
    } else {
      panel.style.transform = "";
    }
    dragging = false;
  };
  panel.addEventListener("pointerup", end);
  panel.addEventListener("pointercancel", end);
}

export function openDetail(key, fromEl) {
  if (!book) return;
  const inner = compose(key);
  if (!inner) return;
  const root = layer();
  if (!root) return;
  epoch += 1;
  clearTimeout(closeTimer);
  closing = false;
  if (detailKey && fromEl && fromEl.closest("#detail")) {
    swapDetail(key, inner);
    return;
  }
  if (detailKey && !closing) finishClose();
  const from = fromEl ? fromEl.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 48, height: 48 };
  root.hidden = false;
  root.innerHTML = shell(inner);
  const panel = root.querySelector(".detail-panel");
  document.body.classList.add("is-detail");
  focusField(focusSpec(book, key));
  detailKey = key;
  sourceEl = fromEl || null;
  bindDrag(panel);
  bindCharts(root);
  requestAnimationFrame(() => requestAnimationFrame(() => playOpen(panel, from)));
  const back = root.querySelector(".detail-back");
  if (back) back.focus({ preventScroll: true });
}

function swapDetail(key, inner) {
  const root = layer();
  const body = root.querySelector(".detail-body");
  if (!body) return;
  detailKey = key;
  focusField(focusSpec(book, key));
  if (reduceMotion()) {
    body.innerHTML = inner;
    bindCharts(body);
    return;
  }
  const out = body.animate([
    { opacity: 1, transform: "translate3d(0, 0, 0)" },
    { opacity: 0, transform: "translate3d(0, 14px, 0) scale(0.985)" }
  ], { duration: 180, easing: "ease-in", fill: "forwards" });
  out.onfinish = () => {
    body.innerHTML = inner;
    bindCharts(body);
    body.animate([
      { opacity: 0, transform: "translate3d(0, 22px, 0)" },
      { opacity: 1, transform: "translate3d(0, 0, 0)" }
    ], { duration: 420, easing: EASE, fill: "both" });
  };
}

export function closeDetail() {
  if (!detailKey || closing) return;
  const root = layer();
  const panel = root && root.querySelector(".detail-panel");
  const gen = epoch;
  releaseField();
  if (!panel || reduceMotion() || !sourceEl || !sourceEl.isConnected) {
    finishClose(gen);
    return;
  }
  closing = true;
  panel.getAnimations().forEach((anim) => anim.cancel());
  panel.style.transform = "";
  const origin = panel.getBoundingClientRect();
  const back = sourceEl.getBoundingClientRect();
  const dx = (back.left + back.width / 2) - (origin.left + origin.width / 2);
  const dy = (back.top + back.height / 2) - (origin.top + origin.height / 2);
  const sx = back.width / Math.max(1, origin.width);
  const sy = back.height / Math.max(1, origin.height);
  const s = Math.max(0.42, Math.min(sx, sy));
  const anim = panel.animate([
    { transform: "translate(0, 0) scale(1)", transformOrigin: "center" },
    { transform: `translate(${dx}px, ${dy}px) scale(${s})`, transformOrigin: "center" }
  ], { duration: CLOSE_MS, easing: EASE, fill: "both" });
  const scrim = root.querySelector(".detail-scrim");
  if (scrim) scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: "ease-in", fill: "both" });
  const done = () => finishClose(gen);
  closeTimer = setTimeout(done, CLOSE_MS + 80);
  anim.onfinish = done;
}

export function bindDetail() {
  if (bound || typeof document === "undefined") return;
  bound = true;
  document.addEventListener("click", (event) => {
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const act = event.target.closest("[data-act]");
    if (act && act.closest("#detail")) {
      event.preventDefault();
      runDeviceAct(act);
      return;
    }
    const closer = event.target.closest("[data-close]");
    if (closer && closer.closest("#detail")) {
      event.preventDefault();
      closeDetail();
      return;
    }
    const opener = event.target.closest("[data-open]");
    if (opener && book) {
      event.preventDefault();
      openDetail(opener.getAttribute("data-open"), opener);
      return;
    }
    const tile = event.target.closest("[data-detail]");
    if (tile && book && document.body.classList.contains("is-open")) {
      event.preventDefault();
      openDetail(tile.getAttribute("data-detail"), tile);
    }
  });
  document.addEventListener("focusout", (event) => {
    const area = event.target.closest && event.target.closest("[data-note]");
    if (!area || !area.closest("#detail")) return;
    saveNote(area.closest("[data-device]"), false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && detailKey) {
      event.preventDefault();
      closeDetail();
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    const opener = event.target.closest("[data-open]");
    if (!opener || !book || opener.closest("button, a")) return;
    event.preventDefault();
    openDetail(opener.getAttribute("data-open"), opener);
  });
}
