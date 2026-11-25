/* Client-side book. AES-256-GCM, key from PBKDF2-SHA256.
   localStorage "midasKey" is { salt, k } where k is the raw AES key (base64).
   A new salt asks for the password again. The password is never stored. */

import { bindConsole, consoleHtml, onTab } from "./console.js";
import { attention, owed, safeToSpend } from "./today.js";
import { publish, read as readShared, setShare, shareOn, summary } from "./share.js";
import { readHub } from "./bills.js";
import { addMonths, wayOut } from "./plan.js";
import { bindPlan, homeHeroHtml, planHtml } from "./wayout.js";
import { bindCharts, compositionHtml, CYAN, flowChartsHtml, networthHtml, positionFromCards, ROSE, sparkHtml, spendableOf } from "./charts.js";
import { configureDesk, normalizeEntry, onDeskChange, readDesk } from "./desk.js";
import { bindDetail, ORDER, setBook } from "./detail.js";
import { applyAccountFilter, bindFilters, filterBarHtml, getFilter, paintFilter } from "./filter.js";

const KEY_NAME = "midasKey";
const WRONG = "That password didn't work. Try again 🙂";

export function b64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function derive(vault, pw) {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pw),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: b64(vault.salt), iterations: vault.iter },
    k,
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt"]
  );
}

export async function dec(vault, key) {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64(vault.iv) },
    key,
    b64(vault.ct)
  );
  return JSON.parse(new TextDecoder().decode(pt));
}

export async function openVault(vault, password) {
  const key = await derive(vault, password);
  const data = await dec(vault, key);
  return { key, data };
}

export async function rememberedRecord(vault, key) {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return { salt: vault.salt, k: btoa(String.fromCharCode(...raw)) };
}

function vaultOk(vault) {
  return !!(vault && typeof vault.salt === "string" && typeof vault.iv === "string" && typeof vault.ct === "string" && Number.isFinite(vault.iter) && vault.iter > 0);
}

function money(n) {
  return n == null ? "—" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}

function opener(key) {
  return `data-open="${escAttr(key)}" tabindex="0" role="button"`;
}

function tags(marks) {
  return (marks || []).map((t) => {
    const cls = t === "STALE?" ? "st" : t === "NEED YOU" || t === "PAST DUE" ? "nd" : t === "HOLD" ? "hold" : t === "VERIFIED" ? "ok" : "";
    return `<span class="tag ${cls}">${esc(t)}</span>`;
  }).join("");
}

function gauge(s) {
  const p = Math.min(1, Math.max(0, (s || 0) / 1000));
  const a = Math.PI * (1 - p);
  const x = 100 + 80 * Math.cos(a);
  const y = 100 - 80 * Math.sin(a);
  const c = s < 400 ? "#9fe6c2" : s < 550 ? "#f0d29a" : ROSE;
  const g = Math.PI * (1 - 0.4);
  const gx = 100 + 80 * Math.cos(g);
  const gy = 100 - 80 * Math.sin(g);
  return `<svg viewBox="0 0 200 115" width="100%" role="img" aria-label="Stress ${s ?? "?"} out of 1000, lower is better">
    <path d="M20 100A80 80 0 0 1 180 100" stroke="rgba(255,255,255,0.16)" stroke-width="14" fill="none" stroke-linecap="round"/>
    <path d="M20 100A80 80 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" stroke="${c}" stroke-width="14" fill="none" stroke-linecap="round"/>
    <circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="3.5" fill="${CYAN}"/>
    <text x="100" y="92" text-anchor="middle" fill="#f4f7fb" font-size="34" font-weight="500" font-family="Outfit, sans-serif">${s ?? "?"}</text>
    <text x="100" y="110" text-anchor="middle" fill="#b7c4d6" font-size="9" font-family="Outfit, sans-serif">/1000 · lower better · goal &lt;400</text>
  </svg>`;
}

function accountAttrs(c) {
  return `data-account data-section="${escAttr(c.section || "")}" data-id="${escAttr(c.id)}" data-name="${escAttr(c.name || "")}" data-marks="${escAttr((c.marks || []).join("|"))}"`;
}

function cardRow(c, extra = "") {
  const bad = c.marks.includes("NEED YOU");
  const stale = c.marks.includes("STALE?");
  const cls = bad ? "alert" : stale ? "warnb" : "";
  const figure = c.unknown
    ? '<span class="pending">unknown</span>'
    : c.balance == null ? '<span class="pending">see note</span>' : money(c.balance);
  const from = c.source != "card" ? "· from " + esc(c.source) : "";
  const prev = c.prev != null ? " · card said " + money(c.prev) : "";
  const aside = [
    c.equity != null ? "equity " + money(c.equity) : "",
    c.autopay != null ? "autopay " + money(c.autopay) + " is not the balance" : "",
    c.kind === "installment" ? "installment, not revolving" : "",
    c.duplicate ? "duplicate id" : "",
  ].filter(Boolean).join(" · ");
  const lines = c.balance == null || bad ? `<p class="note">${(c.lines || []).map(esc).join("<br>")}</p>` : "";
  return `<article class="card glass opener ${cls}" ${opener("card:" + c.id)} ${accountAttrs(c)}>
    <div class="row">
      <h3>${esc(c.name)} <span class="id">${esc(c.id)}</span>${extra}</h3>
      <p class="figure">${figure}<span class="go card-go" aria-hidden="true">→</span></p>
    </div>
    <div class="tags">${tags(c.marks)}</div>
    <p class="meta">${esc(c.asof || "")} ${from}${prev}${aside ? " · " + aside : ""}</p>
    ${lines}
  </article>`;
}

function sheet(id, shift, side, kicker, title, body) {
  return `<section class="sheet${side ? " side-right" : ""}" id="${id}" data-shift="${shift}" data-nav>
    <div class="sheet-inner">
      <p class="kicker">${kicker}</p>
      <h2><button type="button" class="sheet-title" data-open="${escAttr(id === "cards" ? "group:cards" : id === "cash" ? "group:cash" : id === "assets" ? "group:assets" : id === "loans" ? "group:loans" : "group:attention")}">${title}</button></h2>
      <div class="stack">${body}</div>
    </div>
  </section>`;
}

function ring(pct, color) {
  const radius = 46;
  const circ = 2 * Math.PI * radius;
  const dash = Math.max(0, Math.min(1, (pct || 0) / 100)) * circ;
  return `<svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="60" r="${radius}" fill="none" stroke="rgba(159, 212, 230,0.16)" stroke-width="8"/>
    <circle cx="60" cy="60" r="${radius}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${(circ - dash).toFixed(1)}" transform="rotate(-90 60 60)"/>
  </svg>`;
}

export function showTab(name) {
  const app = document.getElementById("app");
  if (!app) return;
  app.querySelectorAll("[data-tab-panel]").forEach((el) => {
    const on = el.getAttribute("data-tab-panel") === name;
    el.hidden = !on;
    el.classList.toggle("is-live", on);
  });
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    const on = btn.getAttribute("data-tab") === name;
    if (on) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  const scroller = document.scrollingElement;
  if (scroller) scroller.scrollTop = 0;
  onTab(name);
}

function bindTabs() {
  if (document.body.dataset.tabs === "1") return;
  document.body.dataset.tabs = "1";
  document.body.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]");
    if (!tab || !document.body.classList.contains("is-open")) return;
    event.preventDefault();
    showTab(tab.getAttribute("data-tab") || "home");
  });
}

/* ---------------------------------------------------------------------------------------------------------------------------------------
   Midas v4 (2026-11-25). The owner opened Midas after a while and called it "trash, no logic, poor effort", and it was: the first screen
   was a clock, the tab bar sat on top of the money, the debt list ran in a hard-coded phase order that disagreed with the plan, the
   paid-down bar mixed the mortgage into one number and not the other, and net worth lived under Flow. Five tabs now, each one job:
     Today  what can be spent today (safe to spend), what is due before payday, what needs a hand, the way out
     Spend  where the money went: in and out by month, categories, utilities, the recurring charges
     Debt   what is owed (cards and loans, the mortgage apart), credit used, the plan in its real order, what if, the library
     Worth  net worth from the book, its trend and make-up, what the other pillars know (the house's contents), every account
     Book   the written pages, the log, what Midas shares with the other pillars, lock
   --------------------------------------------------------------------------------------------------------------------------------------- */
function money0(n) { return n == null ? "—" : (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
const dayLabel = (s) => { try { return new Date(s + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); } catch (e) { return s; } };
const todayIsoLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** The safe-to-spend card. `st` is today.js safeToSpend(). */
export function safeHtml(d, st) {
  const holds = (d.liquid && d.liquid.holds) || [];
  const have = st.spendable, floor = st.floor, pct = have == null ? 0 : Math.min(100, Math.max(0, (have / floor) * 100));
  const bar = have != null && have >= floor ? "#9fe6c2" : ROSE;
  const floorNote = have == null ? "" : (have >= floor ? "Above floor by " + money(have - floor) : "Short " + money(floor - have));
  const until = st.payday ? `before payday ${esc(dayLabel(st.payday.date))}` : `in the next 14 days`;
  const head = have == null ? `<p class="safe-big pending">unknown</p><p class="safe-sub">The book has no spendable balance yet.</p>`
    : st.short > 0 ? `<p class="safe-kicker">Short of your floor</p><p class="safe-big num short">${money0(st.short)}</p>
        <p class="safe-sub">${money0(have)} available, ${money0(st.dueSum)} due ${until}, and the floor is ${money0(floor)}. Nothing is safe to spend until the gap closes.</p>`
    : `<p class="safe-kicker">Safe to spend</p><p class="safe-big num">${money0(st.safe)}</p>
        <p class="safe-sub">${money0(have)} available − ${money0(st.dueSum)} due ${until} − your ${money0(floor)} floor.</p>`;
  return `<article class="card glass lit safe opener" id="safe" ${opener("metric:banked")}>
      ${head}
      <div class="safe-math" aria-hidden="true">
        <span><small>Available</small><b class="num">${money(have)}</b></span>
        <span><small>Due ${st.payday ? "before payday" : "in 14 days"}</small><b class="num">${money(st.dueSum)}</b></span>
        <span><small>Floor</small><b class="num">${money(floor)}</b></span>
      </div>
      <p class="kicker">Spendable available</p>
      <div class="chart" data-chart="floor" data-banked="${have ?? ""}" data-floor="${d.headline && d.headline.floor != null ? d.headline.floor : ""}">
        <div class="bar" role="img" aria-label="${escAttr(floorNote)}"><i style="width:${pct}%;background:${bar}"></i></div>
        <p class="chart-tip" role="status" hidden></p>
      </div>
      <p class="meta">${have == null ? "" : have >= floor ? `Before anything due: ${money(have - floor)} above the floor` : `Before anything due: ${money(floor - have)} under the floor`}${st.payday && st.payday.net != null ? ` · next pay ${esc(dayLabel(st.payday.date))}, about ${money0(st.payday.net)}` : ""}</p>
      ${holds.length ? `<p class="kicker holds-kicker">Holds already taken out of available</p><ul class="holds">${holds.map((hold) => `<li><span class="id">${esc(hold.acct || "")}</span> ${esc(hold.memo || hold.name || "Hold")} <b class="num">${money(hold.amount)}</b></li>`).join("")}</ul>` : ""}
    </article>`;
}

/** What is due, one dated list (the book's minimums and the recurring charges). */
export function comingHtml(st) {
  const rows = st.dues.slice(0, 12);
  const kind = { card: "card minimum", loan: "loan payment", mortgage: "mortgage", bill: "bill", subscription: "subscription" };
  return `<section class="card glass coming" id="coming" data-coming-list aria-label="Due ${st.payday ? "before payday" : "in the next 14 days"}">
      <div class="row"><p class="kicker">Due ${st.payday ? "before payday" : "in the next 14 days"}</p><b class="num">${money(st.dueSum)}</b></div>
      ${rows.length ? `<ul class="due-list">${rows.map((x) => `<li class="due ${x.pastDue ? "late" : ""}"><span class="due-when">${esc(dayLabel(x.date))}</span><span class="due-name">${esc(x.name)}<small>${esc(kind[x.kind] || x.kind)}${x.autopay ? " · autopay" : ""}${x.pastDue ? " · past due" : ""}</small></span><b class="num">${money(x.amount)}</b></li>`).join("")}</ul>`
        : `<p class="meta">Nothing due in the window. Card due days come from each card's terms line; bills from the recurring charges on Spend.</p>`}
      ${st.dues.length > rows.length ? `<p class="meta">${st.dues.length - rows.length} more after these.</p>` : ""}
      <button type="button" class="textbtn" data-tab="flow" data-jump="bills">Recurring charges →</button>
    </section>`;
}

export function ledgerHtml(d, ctx = {}) {
  const h = d.headline || {};
  const cards = d.cards || [];
  const by = (section) => cards.filter((c) => c.section === section);
  const today = ctx.today || todayIsoLocal();
  const st = safeToSpend(d, { today, bills: ctx.bills || [], atlas: ctx.atlas || null });
  const owe = owed(d), w = wayOut(d), plan = w.methods[w.chosen];
  const order = {}; if (plan && plan.payoff_month) for (const [id, m] of Object.entries(plan.payoff_month)) order[id] = m;
  const worth = positionFromCards(d);
  const net = worth.assets != null && worth.liabilities != null ? worth.assets - worth.liabilities : null;
  const att = attention(d, today);
  const when = esc(d.ledger_update || d.ledger_revised || "");
  const util = owe.utilization;

  /* ---------------------------------------------------------------- Today ---------------------------------------------------------------- */
  const masthead = `<section class="mast4" id="overview" data-tab-panel="home" data-shift="0" data-nav>
      <div><p class="kicker"><span class="sq" aria-hidden="true"></span> Midas Ledger</p>
        <h1 id="overview-title" tabindex="-1">Today</h1>
        <p class="lede">Built ${esc(d.built_pt || "")} · ledger: ${when}</p></div>
      <button type="button" class="stress-chip" ${opener("metric:stress")} aria-label="Stress score ${escAttr(h.stress ?? "unknown")} of 1000, lower is better"><small>Stress</small><b class="num">${esc(h.stress ?? "?")}</b></button>
    </section>`;
  const attentionHtml = `<section class="sheet" id="attention" data-tab-panel="home" data-nav>
      <div class="sheet-inner">
        ${att.length ? `<p class="kicker">Needs you</p><div class="stack">${att.map((a) => `<article class="card glass opener att lv${a.level}" ${opener("card:" + a.id)}>
          <div class="row"><h3>${esc(a.name || a.id)} <span class="id">${esc(a.id)}</span></h3>${tags([a.mark === "PROMO" ? "PROMO" : a.mark])}</div><p class="meta">${esc(a.what)}</p></article>`).join("")}</div>`
        : `<p class="kicker">Needs you</p><p class="meta calm">Nothing is past due, stale or waiting on you.</p>`}
      </div></section>`;
  const tiles = `<section class="tiles" data-tab-panel="home" aria-label="The whole picture">
      <button type="button" class="tile glass" data-tab="debt"><small>Owed on cards and loans</small><b class="num">${money0(owe.plan)}</b><span>${owe.mortgage ? `mortgage ${money0(owe.mortgage)} apart` : "no mortgage in the book"}${owe.unknown ? ` · ${owe.unknown} unknown` : ""}</span></button>
      <button type="button" class="tile glass" data-tab="debt"><small>Credit used</small><b class="num">${util == null ? "—" : Math.round(util * 100) + "%"}</b><span>${util == null ? "no card limits in the book" : util <= 0.1 ? "excellent (under 10%)" : util <= 0.3 ? "good (under 30%)" : "high: over 30% weighs on the score"}</span></button>
      <button type="button" class="tile glass" data-tab="worth"><small>Net worth</small><b class="num">${money0(net)}</b><span>${worth.status === "COMPLETE" ? "from the book" : "incomplete" + (worth.missing.length ? ": " + esc(worth.missing.slice(0, 2).join(", ")) : "")}</span></button>
    </section>`;
  const stress = `<section class="overview-metrics" aria-label="Stress" data-tab-panel="home">
    <article class="card glass metric">
      <button type="button" class="metric-hit" data-open="metric:stress" data-chart="gauge" data-score="${h.stress ?? ""}">
        ${gauge(h.stress)}
        <p class="chart-tip gauge-tip" role="status" hidden></p>
      </button>
      ${sparkHtml(d.history || [])}
      <p class="meta">${(d.history || []).length} points · dashed line = goal 400</p>
    </article></section>`;
  const todayHtml = masthead + `<div data-tab-panel="home" data-today>${safeHtml(d, st)}${comingHtml(st)}</div>` + attentionHtml
    + `<section data-tab-panel="home">${homeHeroHtml(d)}</section>` + tiles + stress;

  /* ---------------------------------------------------------------- Debt ---------------------------------------------------------------- */
  const debtRows = (list) => list.slice().sort((a, b) => (order[a.id] ?? 9e3) - (order[b.id] ?? 9e3) || ((b.terms || {}).apr || 0) - ((a.terms || {}).apr || 0))
    .map((c) => cardRow(c, order[c.id] ? ` <span class="phase">gone ${esc(addMonths(order[c.id]))}</span>` : c.kind === "mortgage" ? ` <span class="phase">own schedule</span>` : (c.marks || []).includes("HOLD") ? ` <span class="phase">hold</span>` : "")).join("");
  const debtTop = `<section class="sheet" id="owed" data-tab-panel="debt" data-nav><div class="sheet-inner">
      <p class="kicker">What is owed</p>
      <h2>${money(owe.plan)} <small class="h-sub">on cards and loans</small></h2>
      <div class="split">
        <span><small>Cards</small><b class="num">${money0(owe.cards)}</b></span>
        <span><small>Loans and plans</small><b class="num">${money0(owe.loans)}</b></span>
        <span><small>Mortgage (apart)</small><b class="num">${money0(owe.mortgage)}</b></span>
      </div>
      ${util != null ? `<div class="util"><div class="row"><small>Credit used on the cards</small><b class="num">${Math.round(util * 100)}% · ${money0(owe.used)} of ${money0(owe.limit)}</b></div>
        <div class="meter"><i style="width:${Math.min(100, util * 100).toFixed(1)}%;background:${util <= 0.3 ? "#9fe6c2" : ROSE}"></i><em style="left:30%"></em><em style="left:10%"></em></div>
        <p class="meta">Under 30% helps the credit score; under 10% is best. Each card's own share counts too.</p></div>` : ""}
      ${owe.unknown ? `<p class="meta">${owe.unknown === 1 ? "1 debt has" : owe.unknown + " debts have"} no balance in the book, so ${owe.unknown === 1 ? "it is" : "they are"} not counted.</p>` : ""}
    </div></section>`;
  const revolving = `<section data-tab-panel="debt"><article class="card glass metric">
      <button type="button" class="metric-hit" data-open="metric:revolving">
        <p class="kicker">Revolving${h.revolving_asof ? " · " + esc(h.revolving_asof) : ""}</p>
        <p class="figure num debt">${h.revolving == null ? '<span class="pending">unknown</span>' : money(h.revolving)}</p>
        ${h.revolving_projected != null ? `<p class="meta">A payment of ${money(h.revolving_projected)} is pending and not posted yet.</p>` : ""}
      </button>
      ${compositionHtml(by("Cards (detail)").sort((a, b) => (order[a.id] ?? 9e3) - (order[b.id] ?? 9e3)))}
    </article></section>`;
  const cardHtml = `<div data-tab-panel="debt" hidden>${sheet("cards", "0.62", false, "In the order the plan pays them", "Cards", debtRows(by("Cards (detail)")))}${sheet("loans", "0.5", false, "Owed", "Loans", debtRows(by("Loans")))}</div>`;

  /* ---------------------------------------------------------------- Worth ---------------------------------------------------------------- */
  const worthHtml = `<section class="sheet" id="worth" data-tab-panel="worth" hidden data-nav><div class="sheet-inner">
      <p class="kicker">Net worth</p>
      <h2>${money(net)} <small class="h-sub">${worth.status === "COMPLETE" ? "from the book" : "incomplete"}</small></h2>
      ${networthHtml(d)}
      <div data-from-pillars></div>
    </div></section>`;
  const accounts = `<div data-tab-panel="worth" hidden>${filterBarHtml()}${sheet("cash", "-0.95", true, "On hand", "Cash", by("Cash").map((c) => cardRow(c)).join(""))}${sheet("assets", "-0.4", true, "Beyond cash", "Assets", by("Assets beyond cash").map((c) => cardRow(c, c.id == "A14" ? ` <span class="tag hold">HOLD · never sell</span>` : "")).join(""))}</div>`;

  /* ---------------------------------------------------------------- Spend and Book ---------------------------------------------------------------- */
  const flow = `<section class="sheet" id="flow" data-tab-panel="flow" hidden data-nav>
    <div class="sheet-inner">
      <p class="kicker">Spend</p>
      <h2><button type="button" class="sheet-title" data-open="group:flow">Where the money went</button></h2>
      ${flowChartsHtml(d)}
    </div>
  </section>`;
  const book = `<section class="sheet" id="book" data-tab-panel="book" hidden data-shift="1.05" data-nav>
    <div class="sheet-inner">
      <p class="kicker">Written pages</p>
      <h2 id="book-title" tabindex="-1"><button type="button" class="sheet-title" data-open="group:book">Full ledger</button></h2>
      ${(d.sections || []).map((s, i) => {
        const excerpt = String(s.body || "").split("\n")[0];
        return `<button type="button" class="fold fold-btn" data-open="section:${i}"><span class="fold-title">${esc(s.title)}</span>${excerpt ? `<span class="fold-excerpt">${esc(excerpt)}</span>` : ""}<span class="go" aria-hidden="true">→</span></button>`;
      }).join("")}
      <button type="button" class="fold fold-btn" data-open="group:log"><span class="fold-title">Recent log</span><span class="go" aria-hidden="true">→</span></button>
      <article class="card glass share-card" data-share-card>
        <p class="kicker">Shared with your other pillars</p>
        <p class="meta">After the book opens, Midas leaves a summary on this device for the hub and the other pillars: safe to spend, the floor, what is owed (cards, loans, mortgage), credit used, the debt-free month, net worth and the payments due. Totals and dates only: no account numbers, no notes, nothing sent anywhere. The hub's Time lists the payments; Hearth and Aegis read net worth.</p>
        <label class="check"><input type="checkbox" data-share-toggle checked> <span>Share the summary on this device</span></label>
      </article>
      <button type="button" class="quiet-btn" data-lock>Lock &amp; forget device</button>
    </div>
  </section>`;

  return todayHtml
    + debtTop + revolving + planHtml(d) + cardHtml
    + flow + worthHtml + accounts + consoleHtml() + book;
}

let navObserver = null;

export function bindNav() {
  if (typeof IntersectionObserver === "undefined") return;
  if (navObserver) navObserver.disconnect();
  const panels = [...document.querySelectorAll("[data-nav]")].filter((el) => !el.closest("[hidden]"));
  if (!panels.length) return;
  navObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    const id = "#" + visible.target.id;
    document.querySelectorAll(".topnav a[href^='#']").forEach((link) => {
      if (link.getAttribute("href") === id) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }, { threshold: [0.2, 0.45, 0.7] });
  panels.forEach((panel) => navObserver.observe(panel));
}

function applyDeskBadges(root, desk) {
  const pinned = new Set();
  root.querySelectorAll("[data-account]").forEach((el) => {
    const id = el.getAttribute("data-id");
    const entry = normalizeEntry(desk.cards[id]);
    el.querySelectorAll(".device-tag").forEach((node) => node.remove());
    const tags = el.querySelector(".tags");
    if (!tags) return;
    if (entry.pin) {
      pinned.add(id);
      tags.insertAdjacentHTML("beforeend", `<span class="tag device-tag pin">Pinned</span>`);
    }
    if (entry.note) tags.insertAdjacentHTML("beforeend", `<span class="tag device-tag">Note</span>`);
    if (entry.reviewed) tags.insertAdjacentHTML("beforeend", `<span class="tag device-tag ok">Reviewed</span>`);
  });
  return pinned;
}

function refreshBook(root) {
  const pinned = applyDeskBadges(root, readDesk());
  const counts = applyAccountFilter(root, getFilter(), pinned);
  paintFilter(root, getFilter(), counts);
}

function bindBook(root) {
  bindDetail();
  bindCharts(root);
  bindFilters(root, () => refreshBook(root));
  onDeskChange(() => refreshBook(root));
  refreshBook(root);
}

function paintHtml(html, data) {
  setBook(data);
  const lock = document.getElementById("lock");
  const app = document.getElementById("app");
  app.innerHTML = html;
  lock.hidden = true;
  app.hidden = false;
  document.body.classList.add("is-open");
  document.documentElement.classList.remove("restoring");
  const brand = document.getElementById("brand");
  if (brand) brand.setAttribute("href", "#overview");
  bindNav();
  bindTabs();
  bindBook(app);
  bindPlan(app, data);
  showTab("home");
  window.scrollTo(0, 0);
  const head = document.getElementById("overview-title");
  if (head) head.focus({ preventScroll: true });
  bindConsole(app, showTab);   // the hub's Payoff Console, folded in (2026-11-25): bills, the library, #whatif #bills #library
  bindDevice(app, data);       // v4: what this device knows (bills, payday, the house) joins Today and Worth; the summary goes out
}

/* ---------------------------------------------------------------- the device side (v4) ---------------------------------------------------------------- */
function deviceCtx() {
  let bills = []; try { bills = readHub(window.localStorage).data.bills || []; } catch (e) { bills = []; }
  return { today: todayIsoLocal(), bills, atlas: readShared("prometheus.atlas.summary"), hearth: readShared("prometheus.hearth.summary"), aegis: readShared("prometheus.aegis.summary") };
}
function paintDevice(app, data) {
  const ctx = deviceCtx(), st = safeToSpend(data, ctx), box = app.querySelector("[data-today]");
  if (box) box.innerHTML = safeHtml(data, st) + comingHtml(st);
  const owe = owed(data), w = wayOut(data), worth = positionFromCards(data);
  const from = app.querySelector("[data-from-pillars]");
  if (from) {
    const hs = ctx.hearth, net = worth.assets != null && worth.liabilities != null ? worth.assets - worth.liabilities : null;
    const rows = [];
    if (hs && hs.contentsValue > 0) rows.push(`<li><span>Home contents <small>Hearth: ${esc(hs.items ?? 0)} items in ${esc(hs.rooms ?? 0)} rooms</small></span><b class="num">${money(hs.contentsValue)}</b></li>`);
    if (ctx.aegis && ctx.aegis.contentsCoverage > 0) rows.push(`<li><span>Contents insured for <small>Aegis${ctx.aegis.renewal ? ", renews " + esc(ctx.aegis.renewal) : ""}</small></span><b class="num">${money(ctx.aegis.contentsCoverage)}</b></li>`);
    from.innerHTML = `<article class="card glass from-pillars"><p class="kicker">What the other pillars know</p>
      ${rows.length ? `<ul class="pillar-rows">${rows.join("")}</ul>${hs && hs.contentsValue > 0 && net != null ? `<p class="meta">Net worth with the home's contents: <b class="num">${money(net + hs.contentsValue)}</b>. The book leaves contents out (they sell for far less than they cost); this line is for insurance and the full picture.</p>` : ""}`
        : `<p class="meta">Nothing yet. As Hearth records what is in each room (appliances, furniture, their value), the total shows here beside net worth.</p>`}
    </article>`;
  }
  publish(summary({ book: data, safe: st, owe, way: w, worth }));
  const tog = app.querySelector("[data-share-toggle]");
  if (tog && !tog.dataset.bound) { tog.dataset.bound = "1"; tog.checked = shareOn(); tog.addEventListener("change", () => { setShare(tog.checked); if (tog.checked) paintDevice(app, data); }); }
}
function bindDevice(app, data) {
  paintDevice(app, data);
  const again = () => paintDevice(app, data);
  window.addEventListener("midas:bills", again);
  window.addEventListener("storage", (e) => { if (!e.key || /^prom(etheus)?\.(deck\.money|atlas\.summary|hearth\.summary|aegis\.summary)$/.test(e.key)) again(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) again(); });
}

export function presentBook(data, options = {}) {
  if (options && options.salt) configureDesk(options.salt);
  paintHtml(ledgerHtml(data), data);
}

export function mountLedger(vault) {
  configureDesk(vault && vault.salt);
  const form = document.getElementById("f");
  const err = document.getElementById("err");
  const button = form.querySelector("button");
  const input = document.getElementById("pw");
  const remember = document.getElementById("rem");

  bindDetail();

  document.body.addEventListener("click", (event) => {
    const hit = event.target.closest("[data-lock]");
    if (!hit) return;
    try { localStorage.removeItem(KEY_NAME); } catch (e) { /* private mode */ }
    location.reload();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!vaultOk(vault)) {
      err.textContent = "This copy of the book has no encrypted pages.";
      return;
    }
    button.disabled = true;
    err.textContent = "Unlocking…";
    let opened;
    try {
      opened = await openVault(vault, input.value);
    } catch (e) {
      err.textContent = WRONG;
      button.disabled = false;
      document.documentElement.classList.remove("restoring");
      return;
    }
    let html;
    try {
      html = ledgerHtml(opened.data);
    } catch (e) {
      err.textContent = "The book opened, but this page couldn't draw it.";
      button.disabled = false;
      document.documentElement.classList.remove("restoring");
      return;
    }
    if (remember.checked) {
      try {
        const record = await rememberedRecord(vault, opened.key);
        localStorage.setItem(KEY_NAME, JSON.stringify(record));
      } catch (e) { /* still open the book */ }
    }
    paintHtml(html, opened.data);
  });

  if (!vaultOk(vault)) {
    err.textContent = "This copy of the book has no encrypted pages.";
    document.documentElement.classList.remove("restoring");
    return;
  }
  restore(vault, err);
}

async function restore(vault, err) {
  let record = null;
  try {
    record = JSON.parse(localStorage.getItem(KEY_NAME) || "null");
  } catch (e) {
    document.documentElement.classList.remove("restoring");
    return;
  }
  if (!record || record.salt !== vault.salt || typeof record.k !== "string") {
    document.documentElement.classList.remove("restoring");
    return;
  }
  let data;
  try {
    const key = await crypto.subtle.importKey("raw", b64(record.k), "AES-GCM", false, ["decrypt"]);
    data = await dec(vault, key);
  } catch (e) {
    try { localStorage.removeItem(KEY_NAME); } catch (err2) { /* ignore */ }
    document.documentElement.classList.remove("restoring");
    return;
  }
  try {
    paintHtml(ledgerHtml(data), data);
  } catch (e) {
    document.documentElement.classList.remove("restoring");
    err.textContent = "The book opened, but this page couldn't draw it.";
  }
}
