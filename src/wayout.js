/* Midas v2 screens (Claude, 2026-11-05): the Home hero that leads with the way out, and the Plan tab. */
import { addMonths, wayOut } from "./plan.js";

const money = (n, d = 2) => (n == null || isNaN(n) ? "—" : (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const NAMES = { avalanche: "Avalanche", snowball: "Snowball", custom: "Your order", minimums: "Minimums only" };
const WHY = { avalanche: "highest interest first: the least interest paid", snowball: "smallest balance first: a card gone soonest",
  custom: "the order in your book", minimums: "what happens if nothing extra goes in" };

/* the starting line: the first total owed this device saw, so progress is measured from a real day */
const BASE_KEY = "midasDesk:baseline";
export function baseline(total) {
  let b = null;
  try { b = JSON.parse(localStorage.getItem(BASE_KEY) || "null"); } catch (_) { b = null; }
  if ((!b || !(b.total > 0)) && total > 0) { b = { total, at: new Date().toISOString().slice(0, 10) }; try { localStorage.setItem(BASE_KEY, JSON.stringify(b)); } catch (_) {} }
  if (b && total > b.total) { b = { total, at: new Date().toISOString().slice(0, 10) }; try { localStorage.setItem(BASE_KEY, JSON.stringify(b)); } catch (_) {} }
  return b;
}

export function homeHeroHtml(book) {
  const w = wayOut(book), plan = w.methods[w.chosen], base = baseline(w.total);
  const paid = base ? Math.max(0, base.total - w.total) : 0, pct = base && base.total > 0 ? (paid / base.total) * 100 : 0;
  const dated = plan && plan.ok && w.known.length && !w.missing.length;
  const head = !w.debts.length ? `<p class="wo-big">No debt in the book.</p>`
    : dated ? `<p class="wo-kicker">Debt-free by</p><p class="wo-big">${addMonths(plan.months.length)}</p>`
    : `<p class="wo-kicker">Owed today</p><p class="wo-big num">${money(w.total, 0)}</p>`;
  const sub = !w.debts.length ? "" : dated
    ? `${plan.months.length} months at ${money(w.budget, 0)} a month · ${money(plan.total_interest, 0)} of interest still to pay · ${money(w.total, 0)} owed today`
    : w.missing.length ? `${w.missing.length} of ${w.debts.length} debts still need their APR and minimum in the book before Midas can date the way out.` : "";
  return `<section class="wayout" aria-label="The way out">
    <p class="kicker">The way out</p>
    ${head}
    <p class="wo-sub">${sub}</p>
    ${w.debts.length ? `<div class="wo-progress" role="img" aria-label="${esc(`Paid down ${money(paid, 0)} since ${base?.at || "today"}`)}">
      <div class="wo-track"><i style="width:${Math.min(100, pct).toFixed(1)}%"></i></div>
      <p class="meta">${paid > 0 ? `Paid down <b>${money(paid, 0)}</b> since ${esc(base.at)} · ${pct.toFixed(1)} % of the way` : `Starting line: ${money(base?.total ?? w.total, 0)} on ${esc(base?.at || "today")}. Every payment moves this bar.`}</p>
    </div>` : ""}
    ${w.debts.length ? `<button type="button" class="pill wo-go" data-tab="plan">See the plan <span aria-hidden="true">→</span></button>` : ""}
  </section>`;
}

function methodCard(key, sim, w, chosen) {
  if (!sim) return "";
  const ok = sim.ok, n = sim.months.length, save = w.methods.minimums && w.methods.minimums.ok ? w.methods.minimums.total_interest - sim.total_interest : null;
  return `<button type="button" class="method${key === chosen ? " on" : ""}" data-method="${key}" aria-pressed="${key === chosen}">
    <span class="m-name">${NAMES[key]}</span><span class="m-why">${WHY[key]}</span>
    <span class="m-date">${ok ? addMonths(n) : "Never at this budget"}</span>
    <span class="m-facts">${ok ? `${n} months · ${money(sim.total_interest, 0)} interest${key !== "minimums" && save > 0.5 ? ` · saves ${money(save, 0)}` : ""}` : esc(sim.reason)}</span>
  </button>`;
}

export function planHtml(book, budget, method) {
  const w = wayOut(book, budget), chosen = method && w.methods[method] ? method : w.chosen, sim = w.methods[chosen];
  const rows = w.debts.map((d) => {
    const m = sim && sim.payoff_month ? sim.payoff_month[d.id] : null;
    return { d, m };
  }).sort((a, b) => (a.m ?? 9999) - (b.m ?? 9999));
  const span = sim && sim.ok ? sim.months.length : 1;
  const faster = (() => { if (!sim || !sim.ok) return ""; const w2 = wayOut(book, w.budget + 100), s2 = w2.methods[chosen];
    if (!s2 || !s2.ok) return ""; const dm = sim.months.length - s2.months.length, di = sim.total_interest - s2.total_interest;
    return dm > 0 ? `<p class="wo-tip">${money(100, 0)} more a month: debt-free <b>${dm} month${dm === 1 ? "" : "s"} sooner</b> and <b>${money(di, 0)}</b> less interest.</p>` : ""; })();
  return `<section class="sheet plan" id="plan" data-tab-panel="plan" hidden data-nav>
    <div class="sheet-inner">
      <p class="kicker">The plan</p>
      <h2>Every debt, in the order it goes</h2>
      ${!w.debts.length ? `<p class="meta">No debt in the book.</p>` : `
      <label class="budget"><span>Every month, for all debts together</span>
        <input type="range" min="${Math.ceil(w.minSum)}" max="${Math.max(Math.ceil(w.minSum * 3), Math.ceil(w.minSum) + 500)}" step="10" value="${Math.round(w.budget)}" data-budget aria-label="Monthly budget for debt">
        <b class="num" data-budget-out>${money(w.budget, 0)}</b><small>minimums ${money(w.minSum, 0)}</small></label>
      ${faster}
      <div class="methods">${["avalanche", "snowball", "custom", "minimums"].map((k) => methodCard(k, w.methods[k], w, chosen)).join("")}</div>
      <ol class="timeline">${rows.map(({ d, m }) => `<li class="${d.missing ? "missing" : ""}">
        <div class="tl-head"><b>${esc(d.name)}</b> <span class="id">${esc(d.id)}</span><span class="tl-when">${d.missing ? "terms missing" : m ? `gone ${addMonths(m)}` : "—"}</span></div>
        <div class="tl-bar"><i style="width:${m ? Math.max(3, (m / span) * 100).toFixed(1) : 0}%"></i></div>
        <p class="meta">${money(d.balance)}${d.apr != null ? ` · ${d.apr} % APR` : ""}${d.min != null ? ` · minimum ${money(d.min, 0)}` : ""}${d.promo_end ? ` · promo ${d.promo_apr ?? 0} % to ${esc(d.promo_end)}` : ""}${d.missing ? " · add `- terms: APR … · min … · as of …` under this card in the book" : ""}</p>
      </li>`).join("")}</ol>
      <p class="meta">Interest each month = balance × APR ÷ 12, rounded to the cent. Promo rates are shown, not yet modelled. The plan uses only what the book says.</p>`}
    </div>
  </section>`;
}

export function bindPlan(root, book) {
  let budget = null, method = null;
  const repaint = () => {
    const old = root.querySelector("#plan"); if (!old) return;
    const wasHidden = old.hidden; const tmp = document.createElement("div"); tmp.innerHTML = planHtml(book, budget, method);
    const fresh = tmp.firstElementChild; fresh.hidden = wasHidden; old.replaceWith(fresh); wire();
  };
  const wire = () => {
    const r = root.querySelector("[data-budget]");
    if (r) r.addEventListener("change", () => { budget = +r.value; repaint(); });
    if (r) r.addEventListener("input", () => { const o = root.querySelector("[data-budget-out]"); if (o) o.textContent = money(+r.value, 0); });
    root.querySelectorAll("[data-method]").forEach((b) => b.addEventListener("click", () => { method = b.getAttribute("data-method"); repaint(); }));
  };
  wire();
}
