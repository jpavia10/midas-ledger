/* The hub's Payoff Console, folded into Midas (owner, 2026-11-25: "Replace money at the bottom with midas and just incorporate whatever
   the goal of that was into Midas"). The console had four rooms: the payoff plan, what-if, bills and subscriptions, and the library.
   In Midas the plan is the book's own (Plan tab) and what-if sits under it (wayout.js); this file adds the rest:
   - Flow: the recurring charges (bills.js), kept in the hub's device store so the hub's Time still shows each due date;
   - Today: the recurring charges join the due list and safe to spend (today.js);
   - Plan: the typed plan from the old console, if this device still has one (it stays in Time until removed);
   - Debt: the library (what the minimum really costs on each issuer's formula, the 25 issuers, promo traps, hardship programs, and the
     12 worked cases re-run on Midas's own engine, figure by figure);
   - #plan #whatif #bills #library (and every tab name) open that room, so the hub's old links land in the right place. */
import { burn, chargeDates, cleanBill, CYCLES, cycleText, diffDays, isDay, nextDue, readHub, todayIso, writeHub } from "./bills.js";
import { deferredExample, minimumTrap } from "./library.js";
import { addMonths, simulate } from "./plan.js";

const money = (n, d = 2) => (n == null || isNaN(n) ? "—" : (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const moneyC = (c, d = 2) => money(c / 100, d);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^https:\/\//i.test(String(u || "")) ? esc(u) : "");
const day = (s, opts = { month: "short", day: "numeric" }) => (isDay(s) ? new Date(s + "T12:00:00").toLocaleDateString("en-US", opts) : "—");
const rel = (s, t) => { const n = diffDays(t, s); return n === 0 ? "today" : n === 1 ? "tomorrow" : n < 0 ? `${-n} days ago` : `in ${n} days`; };
const store = () => { try { return window.localStorage; } catch (e) { return null; } };
const DATA = {};
const data = (name) => DATA[name] || (DATA[name] = fetch(`./data/${name}.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(name + " " + r.status)))).catch((e) => { delete DATA[name]; throw e; }));

/* ------------------------------------------------------------------ the shells ledgerHtml places ------------------------------------------------------------------ */
export function consoleHtml() {
  return `<section class="sheet typed" id="typed" data-tab-panel="debt" hidden data-typed></section>
  <section class="sheet" id="bills" data-tab-panel="flow" hidden data-nav>
    <div class="sheet-inner">
      <p class="kicker">Bills and subscriptions</p>
      <h2>Recurring charges</h2>
      <div data-bills></div>
    </div>
  </section>
  <section class="sheet" id="library" data-tab-panel="debt" hidden data-nav>
    <div class="sheet-inner">
      <p class="kicker">The library</p>
      <h2>What debt really costs</h2>
      <div class="segs" role="tablist" aria-label="Library">${LIB.map(([id, name], i) => `<button type="button" role="tab" class="seg" data-lib="${id}" aria-selected="${i === 0}">${name}</button>`).join("")}</div>
      <div class="lib" data-lib-box><p class="meta">Opens with the Debt tab.</p></div>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ bills ------------------------------------------------------------------ */
function billsView(root) {
  const box = root.querySelector("[data-bills]"); if (!box) return;
  const ls = store(), hub = ls ? readHub(ls) : { data: { bills: [] }, writable: false }, t = todayIso();
  const bills = hub.data.bills, b = burn(bills);
  const rows = bills.map((x) => ({ x, n: nextDue(x, t) })).sort((a, c) => (a.n || "9").localeCompare(c.n || "9"));
  const add = hub.writable ? `<button type="button" class="btn small" data-bill-add>+ Add a charge</button>` : "";
  box.innerHTML = (bills.length ? `
    <div class="stats3"><div><small>Every month</small><b class="num">${money(b.monthly)}</b></div>
      <div><small>Every year</small><b class="num">${money(b.yearly, 0)}</b></div>
      <div><small>Subscriptions</small><b class="num">${money(b.subsMonthly)}</b><small>a month</small></div></div>
    <ul class="bills">${rows.map(({ x, n }) => `<li><button type="button" class="bill glass${x.kind === "sub" ? " sub" : ""}" data-bill="${esc(x.id)}">
      <span class="bill-main"><b>${esc(x.name)}</b><small>${esc(cycleText(x.every))}${x.autopay ? " · autopay" : ""}${x.kind === "sub" ? " · subscription" : ""}${x.note ? " · " + esc(x.note) : ""}</small></span>
      <span class="bill-side"><b class="num">${money(x.amount)}</b><small>${n ? `${day(n)} · ${rel(n, t)}` : "no date"}</small></span></button></li>`).join("")}</ul>`
    : `<p class="meta">No recurring charges yet. Add the bills and subscriptions you pay: Midas totals them, the next two weeks show on Home, and every due date shows in the hub's Time.</p>`)
    + `<div class="row-end">${add}</div>`
    + (b.subs.length ? `<h3 class="sub-h">Subscription audit · ${money(b.subsMonthly * 12, 0)} a year</h3>
      <p class="meta">Recurring charges are quiet debt. Sorted by what each costs in a year.</p>
      <ul class="audit">${b.subs.map((x) => { const idle = isDay(x.lastUsed) ? diffDays(x.lastUsed, t) : null;
        return `<li><span>${esc(x.name)}</span><b class="num">${money(x.yearly, 0)}</b><small>${idle == null ? "last use not noted" : idle > 60 ? `<em>not used for ${idle} days</em>` : `used ${idle} days ago`}</small></li>`; }).join("")}</ul>` : "")
    + `<p class="meta fine">Kept on this device with the hub's own data, so the hub's Time shows each due date and its backup carries them. Not in the encrypted book; nothing is sent anywhere.${hub.writable ? "" : " This device's list is from a newer hub, so Midas shows it and leaves it as it is."}</p>`;
}

function billDialog(root, id) {
  const ls = store(); if (!ls) return; const hub = readHub(ls); if (!hub.writable) return;
  const b = id ? hub.data.bills.find((x) => x.id === id) : null, t = todayIso();
  let dlg = document.getElementById("bill-dialog");
  if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "bill-dialog"; dlg.className = "mx-dialog glass"; document.body.appendChild(dlg); }
  dlg.innerHTML = `<form method="dialog" class="mx-form">
    <h3>${b ? "Edit the charge" : "Add a recurring charge"}</h3>
    <div class="segs" role="radiogroup" aria-label="Kind">${[["bill", "Bill"], ["sub", "Subscription"]].map(([k, n]) => `<label class="seg"><input type="radio" name="kind" value="${k}"${(b ? b.kind : "bill") === k ? " checked" : ""}> ${n}</label>`).join("")}</div>
    <label>Name<input name="name" maxlength="60" required value="${esc(b ? b.name : "")}"></label>
    <div class="two"><label>Amount ($)<input name="amount" type="number" min="0" step="0.01" inputmode="decimal" required value="${b ? esc(b.amount) : ""}"></label>
      <label>How often<select name="every">${CYCLES.map((c) => `<option value="${c}"${(b ? b.every : "month") === c ? " selected" : ""}>${esc(cycleText(c))}</option>`).join("")}</select></label></div>
    <label>Next due<input name="anchor" type="date" required value="${esc(b ? b.anchor : t)}"></label>
    <label class="check"><input name="autopay" type="checkbox"${b && b.autopay ? " checked" : ""}> On autopay</label>
    <label>Last used (subscriptions)<input name="lastUsed" type="date" value="${esc(b && b.lastUsed ? b.lastUsed : "")}"></label>
    <label>Note<input name="note" maxlength="120" value="${esc(b && b.note ? b.note : "")}"></label>
    <p class="meta" data-bill-err role="alert"></p>
    <div class="row-end">${b ? `<button type="button" class="btn small quiet danger" data-bill-del>Remove</button>` : ""}<button type="button" class="btn small quiet" data-bill-cancel>Cancel</button><button type="submit" class="btn small">Save</button></div>
  </form>`;
  const f = dlg.querySelector("form");
  f.addEventListener("submit", (e) => {
    e.preventDefault(); const fd = new FormData(f);
    const rec = cleanBill({ name: fd.get("name"), amount: fd.get("amount"), every: fd.get("every"), anchor: fd.get("anchor"), kind: fd.get("kind"), autopay: fd.get("autopay") === "on", lastUsed: fd.get("lastUsed"), note: fd.get("note") }, b ? b.id : null);
    if (!rec) { dlg.querySelector("[data-bill-err]").textContent = "A name, an amount and a due date are needed."; return; }
    const cur = readHub(ls); if (!cur.writable) { dlg.close(); return; }
    cur.data.bills = b ? cur.data.bills.map((x) => (x.id === b.id ? { ...x, ...rec } : x)) : [...cur.data.bills, rec];
    try { writeHub(ls, cur.data); } catch (err) { dlg.querySelector("[data-bill-err]").textContent = "This browser would not save it (storage full or blocked)."; return; }
    dlg.close(); refresh(root);
  });
  dlg.querySelector("[data-bill-cancel]").addEventListener("click", () => dlg.close());
  const del = dlg.querySelector("[data-bill-del]");
  if (del) del.addEventListener("click", () => { const cur = readHub(ls); if (!cur.writable) return; cur.data.bills = cur.data.bills.filter((x) => x.id !== b.id); writeHub(ls, cur.data); dlg.close(); refresh(root); });
  if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  const first = dlg.querySelector("input[name=name]"); if (first && !b) first.focus();
}

/* ------------------------------------------------------------------ plan: the old console's typed plan ------------------------------------------------------------------ */
function typedView(root) {
  const el = root.querySelector("[data-typed]"); if (!el) return;
  const ls = store(), hub = ls ? readHub(ls) : null, p = hub && hub.data.plan;
  if (!p || !Array.isArray(p.debts) || !p.debts.length) { el.innerHTML = ""; el.dataset.empty = "1"; el.hidden = true; return; }
  delete el.dataset.empty; if (document.querySelector('[data-tab="plan"][aria-current="page"]')) el.hidden = false;
  const debts = p.debts.map((d) => ({ id: d.id || d.name, name: d.name, balance: +d.balance || 0, apr: +d.apr || 0, min: +d.min || 0 }));
  const mins = debts.reduce((a, d) => a + d.min, 0), budget = Math.max(mins, (p.budget != null ? +p.budget : mins) + (+p.extra || 0));
  const how = p.strategy === "snowball" ? "snowball" : p.strategy === "custom" ? "custom" : "avalanche";
  const sim = simulate(debts, budget, how, p.order || []);
  el.innerHTML = `<div class="sheet-inner"><article class="card glass">
    <p class="kicker">From the hub's old Payoff Console</p>
    <h3>${esc(p.label || "The typed plan")}${p.sample ? ' <span class="tag">sample</span>' : ""}</h3>
    <p class="meta">${debts.length} debt${debts.length === 1 ? "" : "s"} typed in by hand, ${money(debts.reduce((a, d) => a + d.balance, 0), 0)} at the start · ${money(budget, 0)} a month · ${sim.ok ? `free ${addMonths(sim.months.length)} counted from today (${sim.months.length} months, ${money(sim.total_interest, 0)} interest)` : esc(sim.reason)}</p>
    <p class="meta">The plan above runs on the book itself. This typed one stays on this device and its payments still show in the hub's Time until you remove it.</p>
    ${hub.writable ? `<div class="row-end"><button type="button" class="btn small quiet" data-typed-del>Remove the typed plan</button></div>` : ""}
  </article></div>`;
  const del = el.querySelector("[data-typed-del]");
  if (del) del.addEventListener("click", () => {
    if (!window.confirm("Remove the typed plan and the extra payments logged against it from this device? Bills stay.")) return;
    const cur = readHub(ls); if (!cur.writable) return; cur.data.plan = null; cur.data.events = []; writeHub(ls, cur.data); typedView(root);
  });
}

/* ------------------------------------------------------------------ library ------------------------------------------------------------------ */
const LIB = [["trap", "Minimum trap"], ["issuers", "Issuers"], ["promos", "Promo traps"], ["hardship", "Hardship"], ["cases", "Worked cases"]];
let libTab = "trap", libDrawn = false, libReady = Promise.resolve();
const spark = (vals, label) => {
  const w = 320, h = 64, max = Math.max(...vals, 1), n = Math.max(1, vals.length - 1);
  const pts = vals.map((v, i) => `${((i / n) * w).toFixed(1)},${(h - 4 - (v / max) * (h - 8)).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
};
const months = (n) => (n === Infinity ? "never" : n >= 24 ? `${Math.floor(n / 12)} years${n % 12 ? ` ${n % 12} mo` : ""}` : `${n} month${n === 1 ? "" : "s"}`);

async function libTrap(box) {
  const iss = await data("issuers"); const flat = iss.flatMap((i) => (i.minimums || []).map((m) => ({ issuer: i.issuer, method: i.method, ...m })));
  box.innerHTML = `<article class="card glass">
    <h3>What paying only the minimum costs</h3>
    <label>Issuer's formula<select data-t="pick">${flat.map((f, i) => `<option value="${i}">${esc(f.issuer)} · ${esc(f.product)}</option>`).join("")}</select></label>
    <div class="two"><label>Balance ($)<input data-t="bal" type="number" min="1" step="1" inputmode="decimal" value="5000"></label><label>APR (%)<input data-t="apr" type="number" min="0" max="99" step="0.01" inputmode="decimal" value="24.99"></label></div>
    <div data-t="out" aria-live="polite"></div>
    <p class="meta fine">Each formula is the issuer's published rule for one named product, read from its cardholder agreement (research MID-GEM-04, November 2026). No new charges, no fees.</p></article>`;
  const q = (k) => box.querySelector(`[data-t="${k}"]`);
  const calc = () => {
    const f = flat[+q("pick").value], bal = +q("bal").value, apr = +q("apr").value, out = q("out"); if (!f || !(bal > 0)) { out.innerHTML = ""; return; }
    let r; try { r = minimumTrap({ balance: bal, apr, formula: f.formula }); } catch (e) { out.innerHTML = `<p class="meta">This formula could not be read: ${esc(e.message)}</p>`; return; }
    const fixed = r.first[0] ? simulate([{ id: "x", name: "x", balance: bal, apr, min: r.first[0] / 100 }], r.first[0] / 100, "avalanche") : null;
    out.innerHTML = `<p class="formula"><code>minimum = ${esc(f.formula)}</code><small>B balance · I interest · F fees · interest: ${esc(f.method || "")}</small></p>
      <div class="stats3"><div><small>Minimum only</small><b class="num">${r.stalled ? "never ends" : months(r.months)}</b></div><div><small>Interest paid</small><b class="num">${moneyC(r.interestC, 0)}</b></div><div><small>First payment</small><b class="num">${r.first[0] ? moneyC(r.first[0]) : "—"}</b></div></div>
      <div class="spark-box bad">${spark(r.curve, "Balance while paying only the minimum")}</div>
      ${fixed && fixed.ok ? `<p class="wo-tip">Keep paying the first minimum (${moneyC(r.first[0])}) every month instead of letting it shrink: done in <b>${months(fixed.months.length)}</b> with <b>${money(fixed.total_interest, 0)}</b> of interest${r.stalled ? "" : `, ${moneyC(r.interestC - Math.round(fixed.total_interest * 100), 0)} less`}.</p>` : ""}`;
  };
  ["pick", "bal", "apr"].forEach((k) => q(k).addEventListener("input", calc)); calc();
}
async function libIssuers(box) {
  const iss = await data("issuers");
  box.innerHTML = `<article class="card glass"><h3>${iss.length} issuers: minimums and interest</h3><ul class="lib-list">${iss.map((i) => `<li><details><summary><b>${esc(i.issuer)}</b><small>${esc(i.method || "")}${i.grace != null ? ` · grace ${esc(i.grace)} days` : ""}</small></summary>
    ${(i.minimums || []).map((m) => `<p class="formula"><small>${esc(m.product)}</small><code>${esc(m.formula)}</code>${m.floor != null ? `<small>floor ${money(m.floor, 0)}</small>` : ""}</p>`).join("")}
    ${i.daily ? `<p class="meta">${esc(i.daily)}</p>` : ""}</details></li>`).join("")}</ul></article>`;
}
async function libPromos(box) {
  const o = await data("offers"); const LBL = { zero_intro_bt: "0% intro on transfers", zero_intro_purchase_bt: "0% intro, purchases and transfers", low_intro_bt: "low intro on transfers", low_intro_purchase_bt: "low intro, purchases and transfers" };
  box.innerHTML = `<article class="card glass"><h3>Deferred interest against a true 0 %</h3>
    <div class="two"><label>Purchase ($)<input data-p="amt" type="number" min="1" value="2400" inputmode="decimal"></label><label>Promo months<input data-p="mo" type="number" min="1" max="60" value="12" inputmode="numeric"></label></div>
    <div class="two"><label>APR after the promo (%)<input data-p="apr" type="number" min="0" max="99" step="0.01" value="29.99" inputmode="decimal"></label><label>Paying a month ($)<input data-p="pay" type="number" min="0" value="150" inputmode="decimal"></label></div>
    <div data-p="out" aria-live="polite"></div></article>
    <article class="card glass"><h3>${o.promos.length} intro-rate card offers <span class="tag">read ${esc(o.as_of)}</span></h3>
    <p class="meta">Card intro APRs like these are true 0 % or low-rate promos: interest is not charged back. "No interest if paid in full" store financing is the deferred kind above.</p>
    <ul class="lib-list">${o.promos.map((p) => `<li><b>${esc(p.issuer)} · ${esc(p.product)}</b><small>${esc(LBL[p.type] || p.type)} · ${esc(p.months)} ${esc(p.months_unit || "months")}${p.go_to_apr_range ? ` · then ${esc(p.go_to_apr_range)} %` : ""}${p.fee ? ` · fee ${esc(p.fee)}` : ""}</small>${safeUrl(p.url) ? `<a href="${safeUrl(p.url)}" target="_blank" rel="noopener noreferrer">issuer page</a>` : ""}</li>`).join("")}</ul></article>`;
  const q = (k) => box.querySelector(`[data-p="${k}"]`);
  const calc = () => { const r = deferredExample({ amount: +q("amt").value, apr: +q("apr").value, months: +q("mo").value, payment: +q("pay").value });
    q("out").innerHTML = `<div class="stats3"><div><small>Deferred interest</small><b class="num${r.deferredChargeC ? " bad" : ""}">${moneyC(r.deferredChargeC)}</b><small>${r.deferredChargeC ? "billed the day the promo ends" : "nothing: paid in time"}</small></div>
      <div><small>True 0 %</small><b class="num">$0.00</b><small>for the promo months</small></div><div><small>Pay in full with</small><b class="num">${money(r.payInFullEvery)}</b><small>a month</small></div></div>
      <p class="${r.deferredChargeC ? "wo-tip warn" : "meta"}">${r.deferredChargeC ? `Leave ${moneyC(r.leftC)} unpaid when the promo ends and a deferred-interest plan bills all ${moneyC(r.deferredChargeC)} of interest back to day one. Paying ${money(r.payInFullEvery)} a month clears it in time.` : "Paid in full before the promo ends: deferred interest never lands."}</p>`; };
  ["amt", "mo", "apr", "pay"].forEach((k) => q(k).addEventListener("input", calc)); calc();
}
async function libHardship(box) {
  const o = await data("offers");
  box.innerHTML = `<article class="card glass"><h3>Hardship programs <span class="tag">read ${esc(o.as_of)}</span></h3>
    <input type="search" data-h="q" placeholder="Search ${o.hardship.length} lenders" aria-label="Search hardship programs">
    <ul class="lib-list" data-h="list"></ul>
    ${o.hardship_missing && o.hardship_missing.length ? `<p class="meta">Not found on the lender's own pages: ${o.hardship_missing.map((x) => esc(typeof x === "string" ? x : x.lender || "")).join(", ")}.</p>` : ""}</article>`;
  const q = box.querySelector('[data-h="q"]'), list = box.querySelector('[data-h="list"]');
  const draw = () => { const s = q.value.trim().toLowerCase(); const rows = o.hardship.filter((r) => !s || `${r.lender} ${r.program} ${r.offers}`.toLowerCase().includes(s));
    list.innerHTML = rows.length ? rows.map((r) => `<li><details><summary><b>${esc(r.lender)}</b><small>${esc(r.program)}</small></summary>
      <p><b>Offers:</b> ${esc(r.offers)}</p>${r.qualifies ? `<p><b>Who qualifies:</b> ${esc(r.qualifies)}</p>` : ""}${r.how_to_ask ? `<p><b>How to ask:</b> ${esc(r.how_to_ask)}</p>` : ""}${r.account_effect ? `<p><b>What it does to the account:</b> ${esc(r.account_effect)}</p>` : ""}
      ${safeUrl(r.url) ? `<p><a href="${safeUrl(r.url)}" target="_blank" rel="noopener noreferrer">The lender's page</a></p>` : ""}</details></li>`).join("") : `<li class="meta">No lender matches.</li>`; };
  q.addEventListener("input", draw); draw();
}
/** The 12 payoff plans worked by hand in the research (MID-GEM-01), re-run on Midas's engine (plan.js) and compared figure by figure. */
export function checkCase(c) {
  const debts = c.debts.map((d) => ({ ...d, id: d.name })), r = simulate(debts, c.budget, c.method, c.order || c.debts.map((d) => d.name));
  let n = 0, bad = 0;
  c.months.forEach((mo, mi) => mo.forEach((row, di) => { const id = c.debts[di].name, m = r.months[mi];
    [m ? m.interest[id] || 0 : null, m ? m.paid[id] || 0 : null, m ? m.balance[id] ?? 0 : null].forEach((v, k) => { n++; if (v == null || Math.abs(v - row[k]) > 0.001) bad++; }); }));
  const same = bad === 0 && r.months.length === c.months.length && Math.abs(r.total_interest - c.total_interest) < 0.001;
  return { same, n, bad, r };
}
async function libCases(box) {
  const cs = await data("payoff-cases"); let all = 0; const okc = cs.filter((c) => { const k = checkCase(c); all += k.n; return k.same; }).length;
  box.innerHTML = `<article class="card glass"><h3>${cs.length} worked cases</h3>
    <p class="meta">The engine's proof: twelve payoff plans worked by hand in the research (MID-GEM-01), re-run here on the same engine as your plan and compared figure by figure.</p>
    <p class="${okc === cs.length ? "wo-tip" : "wo-tip warn"}"><b>${okc} of ${cs.length}</b> match to the cent · ${all.toLocaleString("en-US")} figures compared</p>
    <label>Case<select data-c="pick">${cs.map((c, i) => `<option value="${i}">Case ${esc(c.case)}: ${esc(c.method)}, ${c.debts.length} debts, ${money(c.budget, 0)} a month</option>`).join("")}</select></label>
    <div data-c="out" aria-live="polite"></div></article>`;
  const pick = box.querySelector('[data-c="pick"]'), out = box.querySelector('[data-c="out"]');
  const calc = () => { const c = cs[+pick.value], k = checkCase(c);
    out.innerHTML = `<p class="${k.same ? "meta ok" : "meta bad"}">${k.same ? "Matches the worked answer to the cent" : `${k.bad} figures differ`} · ${k.n} figures</p>
      <div class="stats3"><div><small>Months</small><b class="num">${k.r.months.length}</b><small>worked: ${c.months.length}</small></div><div><small>Total interest</small><b class="num">${money(k.r.total_interest)}</b><small>worked: ${money(c.total_interest)}</small></div><div><small>Budget</small><b class="num">${money(c.budget, 0)}</b><small>${esc(c.method)}</small></div></div>
      <ul class="lib-list">${c.debts.map((d) => `<li><b>${esc(d.name)}</b><small>${money(d.balance)} at ${esc(d.apr)} % · minimum ${money(d.min)} · paid off in month ${esc(k.r.payoff_month[d.name] ?? "—")}</small></li>`).join("")}</ul>`; };
  pick.addEventListener("change", calc); calc();
}
function drawLib(root) { libReady = drawLib1(root); return libReady; }
async function drawLib1(root) {
  const box = root.querySelector("[data-lib-box]"); if (!box) return; libDrawn = true;
  root.querySelectorAll("[data-lib]").forEach((b) => b.setAttribute("aria-selected", String(b.getAttribute("data-lib") === libTab)));
  box.innerHTML = `<p class="meta">Loading…</p>`;
  try { await ({ trap: libTrap, issuers: libIssuers, promos: libPromos, hardship: libHardship, cases: libCases })[libTab](box); }
  catch (e) { box.innerHTML = `<p class="meta">The library could not be loaded on this connection. It opens once the page is back online.</p>`; }
}

/* ------------------------------------------------------------------ wiring and rooms ------------------------------------------------------------------ */
const ROOMS = { home: ["home"], today: ["home"], flow: ["flow"], spend: ["flow"], accounts: ["worth"], worth: ["worth"], plan: ["debt", "plan"], debt: ["debt"], book: ["book"],
  whatif: ["debt", "whatif"], bills: ["flow", "bills"], library: ["debt", "library"], payoff: ["debt", "plan"], money: ["debt", "plan"] };
let shown = "home", rootEl = null;
function refresh(root) { billsView(root); typedView(root); try { window.dispatchEvent(new CustomEvent("midas:bills")); } catch (e) { /* old browser */ } }   // Today repaints its due list and safe-to-spend

/** Called after every tab switch (ledger.js showTab): the console's shells follow their tab, and the library loads the first time Debt opens. */
export function onTab(name) {
  shown = name; if (!rootEl) return;
  for (const el of rootEl.querySelectorAll("[data-typed]")) if (el.dataset.empty === "1") el.hidden = true;
  if (name === "debt" && !libDrawn) drawLib(rootEl);
}
/** Opens the room a hash names (#whatif, #bills, #library or any tab). Returns true when it did. */
export function openRoom(hash, showTab) {
  const key = String(hash || "").replace(/^#\/?/, "").split(/[/?]/)[0].toLowerCase(); const room = ROOMS[key]; if (!room) return false;
  showTab(room[0]);
  const go = () => { const el = room[1] && document.getElementById(room[1]); if (el) el.scrollIntoView({ block: "start", behavior: "auto" }); };
  if (room[1]) requestAnimationFrame(go);
  if (room[1] === "library") libReady.then(() => requestAnimationFrame(go));   // the page grows once the library has loaded
  if (room[1] === "whatif") { const inp = document.querySelector("[data-wf]"); if (inp) inp.focus({ preventScroll: true }); }
  return true;
}
export function bindConsole(root, showTab) {
  rootEl = root; libDrawn = false; refresh(root);
  root.addEventListener("click", (e) => {
    const add = e.target.closest("[data-bill-add]"); if (add) { billDialog(root, null); return; }
    const b = e.target.closest("[data-bill]"); if (b) { billDialog(root, b.getAttribute("data-bill")); return; }
    const seg = e.target.closest("[data-lib]"); if (seg) { libTab = seg.getAttribute("data-lib"); drawLib(root); return; }
    const jump = e.target.closest("[data-jump]"); if (jump) { const id = jump.getAttribute("data-jump"); setTimeout(() => { const el = document.getElementById(id); if (el) el.scrollIntoView({ block: "start" }); }, 0); }
  });
  /* the hub writes the same slice from another tab: follow it */
  addEventListener("storage", (e) => { if (e.key === "prom.deck.money" && rootEl) refresh(rootEl); });
  addEventListener("hashchange", () => openRoom(location.hash, showTab));
  if (!openRoom(location.hash, showTab)) onTab(shown);
}
export { chargeDates };
