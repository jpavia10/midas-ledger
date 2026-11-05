/* The way out (Claude, 2026-11-05; owner: "not inspiring me to get out of debt"). A payoff engine with the rules every AI checks
   against (homework MID-GEM-01): each month interest = balance x APR / 12 / 100 rounded to the cent (half up) and added; every
   minimum is paid (or the whole balance if smaller); the rest of the budget goes to the target (avalanche = highest APR, snowball =
   lowest balance, custom = the listed order); a paid-off debt's minimum joins the rest from the next month. */

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** debts: [{name, balance, apr, min}], budget: dollars a month for all debts together. Returns the month-by-month schedule. */
export function simulate(debts, budget, method = "avalanche", order = [], maxMonths = 600) {
  const live = debts.map((d, i) => ({ name: d.name, id: d.id ?? d.name, balance: r2(+d.balance || 0), apr: +d.apr || 0, min: +d.min || 0, i }));
  const minSum = live.reduce((a, d) => a + d.min, 0);
  if (!live.length) return { ok: true, months: [], payoff_month: {}, total_interest: 0, minSum, budget };
  if (budget < minSum - 0.004) return { ok: false, reason: "budget below the minimums", minSum, budget };
  const rank = (d) => {
    if (method === "snowball") return [d.balance, -d.apr, d.i];
    if (method === "custom") { const k = order.indexOf(d.id); return [k < 0 ? 999 : k, d.i, 0]; }
    return [-d.apr, d.balance, d.i];
  };
  const cmp = (a, b) => { const x = rank(a), y = rank(b); for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return x[k] - y[k]; return 0; };
  const months = [], payoff = {}; let totalInterest = 0;
  for (let m = 1; m <= maxMonths && live.some((d) => d.balance > 0); m++) {
    const row = { m, interest: {}, paid: {}, balance: {} };
    for (const d of live) if (d.balance > 0) { const i = r2(d.balance * d.apr / 12 / 100); d.balance = r2(d.balance + i); row.interest[d.id] = i; totalInterest = r2(totalInterest + i); }
    let left = budget;
    for (const d of live) if (d.balance > 0) { const p = Math.min(d.min, d.balance); d.balance = r2(d.balance - p); row.paid[d.id] = r2(p); left = r2(left - p); }
    // the rest to the target, then the next target if the first is paid off this month
    const targets = live.filter((d) => d.balance > 0).sort(cmp);
    for (const d of targets) { if (left <= 0) break; const p = Math.min(left, d.balance); d.balance = r2(d.balance - p); row.paid[d.id] = r2((row.paid[d.id] || 0) + p); left = r2(left - p); }
    for (const d of live) { row.balance[d.id] = d.balance; if (d.balance <= 0 && payoff[d.id] == null && (row.paid[d.id] || row.interest[d.id] != null)) payoff[d.id] = m; }
    months.push(row);
  }
  const done = live.every((d) => d.balance <= 0);
  return { ok: done, reason: done ? "" : "does not finish in 50 years at this budget", months, payoff_month: payoff, total_interest: totalInterest, minSum, budget };
}

/** The debts in the book: cards and loans with a balance. Terms come from the book's terms line (docs/BOOK_SCHEMA.md). */
export function debtsOf(book) {
  return (book.cards || []).filter((c) => (c.section === "Cards (detail)" || c.section === "Loans") && c.balance != null && +c.balance > 0)
    .map((c) => ({ id: c.id, name: c.name || c.id, balance: +c.balance, apr: c.terms?.apr, min: c.terms?.min_payment, due_day: c.terms?.due_day,
      limit: c.terms?.credit_limit, promo_apr: c.terms?.promo_apr, promo_end: c.terms?.promo_end, asof: c.terms?.asof, section: c.section,
      missing: c.terms?.apr == null || c.terms?.min_payment == null }));
}

export function addMonths(n, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth() + n, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Everything the Home hero and the Plan tab show, for one budget. */
export function wayOut(book, budgetOverride) {
  const debts = debtsOf(book), known = debts.filter((d) => !d.missing), missing = debts.filter((d) => d.missing);
  const total = r2(debts.reduce((a, d) => a + d.balance, 0)), minSum = r2(known.reduce((a, d) => a + d.min, 0));
  const plan = book.plan || {};
  const budget = budgetOverride ?? (plan.budget ? +plan.budget : r2(Math.max(minSum, minSum * 1.15)));
  const methods = {};
  if (known.length && budget >= minSum) {
    methods.avalanche = simulate(known, budget, "avalanche");
    methods.snowball = simulate(known, budget, "snowball");
    if (plan.order && plan.order.length) methods.custom = simulate(known, budget, "custom", plan.order);
    methods.minimums = simulate(known, minSum, "avalanche");
  }
  const chosen = plan.method && methods[plan.method] ? plan.method : (methods.custom ? "custom" : "avalanche");
  return { debts, known, missing, total, minSum, budget, methods, chosen };
}
