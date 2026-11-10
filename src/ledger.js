/* Client-side book. AES-256-GCM, key from PBKDF2-SHA256.
   localStorage "midasKey" is { salt, k } where k is the raw AES key (base64).
   A new salt asks for the password again. The password is never stored. */

import { bindPlan, homeHeroHtml, planHtml } from "./wayout.js";
import { bindCharts, compositionHtml, CYAN, flowChartsHtml, ROSE, sparkHtml, spendableOf } from "./charts.js";
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
  const figure = c.balance == null ? '<span class="pending">see note</span>' : money(c.balance);
  const from = c.source != "card" ? "· from " + esc(c.source) : "";
  const prev = c.prev != null ? " · card said " + money(c.prev) : "";
  const lines = c.balance == null || bad ? `<p class="note">${(c.lines || []).map(esc).join("<br>")}</p>` : "";
  return `<article class="card glass opener ${cls}" ${opener("card:" + c.id)} ${accountAttrs(c)}>
    <div class="row">
      <h3>${esc(c.name)} <span class="id">${esc(c.id)}</span>${extra}</h3>
      <p class="figure">${figure}<span class="go card-go" aria-hidden="true">→</span></p>
    </div>
    <div class="tags">${tags(c.marks)}</div>
    <p class="meta">${esc(c.asof || "")} ${from}${prev}</p>
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

export function ledgerHtml(d) {
  const h = d.headline || {};
  const cards = d.cards || [];
  const by = (section) => cards.filter((c) => c.section === section);
  const have = spendableOf(d);
  const floor = h.floor || 3000;
  const pct = have == null ? 0 : Math.min(100, (have / floor) * 100);
  const ordered = by("Cards (detail)").sort((a, b) => (ORDER[a.id]?.[0] ?? 9) - (ORDER[b.id]?.[0] ?? 9));
  const attention = cards.filter((c) => (c.marks || []).includes("NEED YOU") || (c.marks || []).includes("STALE?") || (c.marks || []).includes("PAST DUE"));
  const floorNote = have == null ? "" : (pct >= 100 ? "Above floor by " + money(have - floor) : "Short " + money(floor - have));
  const bar = pct >= 100 ? "#9fe6c2" : ROSE;
  const when = esc(d.ledger_update || d.ledger_revised || "");
  const holds = (d.liquid && d.liquid.holds) || [];
  const holdHtml = holds.length ? `<ul class="holds">${holds.map((hold) => `<li><span class="id">${esc(hold.acct || "")}</span> ${esc(hold.memo || hold.name || "Hold")} <b class="num">${money(hold.amount)}</b></li>`).join("")}</ul>` : `<p class="meta">No holds on the spendable accounts.</p>`;

  const overview = `<section class="panel hero hud-home" id="overview" data-tab-panel="home" data-shift="0" data-nav>
    <div class="mast">
      <div class="mast-title">
        <p class="kicker"><span class="sq" aria-hidden="true"></span> The book</p>
        <p class="greet"><span data-greet>Good evening</span></p>
        <h1 id="overview-title" tabindex="-1">Midas</h1>
        <p class="lede">Built ${esc(d.built_pt || "")} · ledger: ${when}</p>
      </div>
      <div class="mast-time">
        <time class="clock num" data-clock datetime="">—</time>
        <p class="day-line" data-day></p>
      </div>
    </div>
    ${homeHeroHtml(d)}
    <article class="card glass lit metric opener" ${opener("metric:banked")}>
      <div class="spend-row">
        ${ring(pct, bar)}
        <div>
          <p class="kicker">Spendable available</p>
          <p class="figure num glow">${money(have)}</p>
          <p class="meta">Floor ${money(h.floor)} · ${floorNote}</p>
        </div>
      </div>
      <div class="chart" data-chart="floor" data-banked="${have ?? ""}" data-floor="${h.floor ?? ""}">
        <div class="bar" role="img" aria-label="${escAttr(floorNote)}"><i style="width:${pct}%;background:${bar}"></i></div>
        <p class="chart-tip" role="status" hidden></p>
      </div>
      <p class="kicker holds-kicker">Holds</p>
      ${holdHtml}
    </article>
  </section>`;

  const metrics = `<section class="overview-metrics" aria-label="Headline" data-tab-panel="home">
    <article class="card glass metric">
      <button type="button" class="metric-hit" data-open="metric:stress" data-chart="gauge" data-score="${h.stress ?? ""}">
        ${gauge(h.stress)}
        <p class="chart-tip gauge-tip" role="status" hidden></p>
      </button>
      ${sparkHtml(d.history || [])}
      <p class="meta">${(d.history || []).length} points · dashed line = goal 400</p>
    </article>
    <article class="card glass metric">
      <button type="button" class="metric-hit" data-open="metric:revolving">
        <p class="kicker">Revolving</p>
        <p class="figure num debt">${money(h.revolving)}</p>
      </button>
      ${compositionHtml(ordered)}
    </article>
  </section>`;

  const attentionHtml = attention.length ? sheet(
    "attention",
    "0.45",
    false,
    "Needs you / stale",
    "Attention",
    attention.map((c) => `<article class="card glass opener ${c.marks.includes("NEED YOU") ? "alert" : "warnb"}" ${opener("card:" + c.id)} ${accountAttrs(c)}>
      <h3>${esc(c.name)}</h3>
      <div class="tags">${tags(c.marks)}</div>
      <p class="meta">${esc((c.lines && c.lines[0]) || c.status || "")}</p>
    </article>`).join("")
  ) : "";

  const cardHtml = sheet(
    "cards",
    "0.62",
    false,
    "Payoff order",
    "Cards",
    ordered.map((c) => cardRow(c, ORDER[c.id] ? ` <span class="phase">${esc(ORDER[c.id][1])}</span>` : "")).join("")
  );

  const cashHtml = sheet(
    "cash",
    "-0.95",
    true,
    "On hand",
    "Cash",
    by("Cash").map((c) => cardRow(c)).join("")
  );

  const assetHtml = sheet(
    "assets",
    "-0.4",
    true,
    "Beyond cash",
    "Assets",
    by("Assets beyond cash").map((c) => cardRow(c, c.id == "A14" ? ` <span class="tag hold">HOLD · never sell</span>` : "")).join("")
  );

  const loanHtml = sheet(
    "loans",
    "0.5",
    false,
    "Owed",
    "Loans",
    by("Loans").map((c) => cardRow(c)).join("")
  );

  const flow = `<section class="sheet" id="flow" data-tab-panel="flow" hidden data-nav>
    <div class="sheet-inner">
      <p class="kicker">Flow</p>
      <h2><button type="button" class="sheet-title" data-open="group:flow">Cash flow</button></h2>
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
      <button type="button" class="quiet-btn" data-lock>Lock &amp; forget device</button>
    </div>
  </section>`;

  return overview + metrics
    + `<div data-tab-panel="accounts" hidden>${filterBarHtml()}${attentionHtml}</div>`
    + `<div data-tab-panel="debt" hidden>${cardHtml}</div>`
    + `<div data-tab-panel="accounts" hidden>${cashHtml}${assetHtml}</div>`
    + `<div data-tab-panel="debt" hidden>${loanHtml}</div>`
    + planHtml(d)
    + flow + book;
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
