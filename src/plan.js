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

function numOrNull(value) {
  if (value == null || value === "") return null;
  const n = +value;
  return Number.isFinite(n) ? n : null;
}

function isMortgageCard(card) {
  const terms = card.terms || {};
  if (card.kind === "mortgage" || /mortgage/i.test(card.name || "")) return true;
  return terms.frequency === "biweekly" && (terms.pi != null || terms.escrow != null);
}

/** Posted balances only. A zero minimum is real. Unknown debts stay in the list with a null balance. */
export function debtsOf(book) {
  return (book.cards || []).filter((c) => {
    if (c.section !== "Cards (detail)" && c.section !== "Loans") return false;
    if (c.balance != null && +c.balance > 0) return true;
    return !!c.unknown;
  }).map((c) => {
    const mortgage = isMortgageCard(c);
    const installment = !mortgage && (c.kind === "installment" || /\bflex\b/i.test(c.name || ""));
    const min = c.terms?.min_payment;
    const balance = numOrNull(c.balance);
    const missing = mortgage
      ? (c.terms?.apr == null || c.terms?.pi == null || c.terms?.escrow == null || balance == null)
      : (c.terms?.apr == null || min == null || balance == null);
    return {
      id: c.id, name: c.name || c.id, balance, apr: c.terms?.apr, min, due_day: c.terms?.due_day,
      limit: c.terms?.credit_limit, promo_apr: c.terms?.promo_apr, promo_end: c.terms?.promo_end, asof: c.terms?.asof,
      section: c.section, missing, mortgage, installment, deferred_interest: !!c.terms?.deferred_interest,
      pi: c.terms?.pi, escrow: c.terms?.escrow, frequency: c.terms?.frequency,
      draft: c.terms?.draft ?? c.draft, unapplied: c.terms?.unapplied,
      extra_principal_policy: c.terms?.extra_principal_policy || (mortgage ? "unknown" : undefined),
      terms: c.terms || {},
    };
  });
}

/**
 * Mortgage cash is the full draft. Principal falls by P&I minus one month of interest
 * (balance × APR / 12), and only after a held half-draft is paired into a full payment.
 * Escrow leaves cash inside that payment and is not principal, and it is not a second
 * expense when the servicer pays taxes or insurance. A 26-draft year is not applied
 * to principal unless the book names that extra-principal policy.
 */
export function forecastMortgage(debt, opts = {}) {
  const terms = debt.terms || debt;
  const principal0 = numOrNull(debt.balance != null ? debt.balance : terms.principal);
  const apr = numOrNull(terms.apr);
  const pi = numOrNull(terms.pi);
  const escrowAmt = numOrNull(terms.escrow);
  const frequency = String(terms.frequency || debt.frequency || (terms.draft != null ? "biweekly" : "monthly")).toLowerCase();
  const policy = terms.extra_principal_policy || debt.extra_principal_policy || "unknown";
  const missing = [];
  if (principal0 == null) missing.push("principal");
  if (apr == null) missing.push("apr");
  if (pi == null) missing.push("pi");
  if (escrowAmt == null) missing.push("escrow");
  const base = {
    estimate: true,
    posted: false,
    frequency,
    unapplied: terms.unapplied || (frequency === "biweekly" ? "hold_until_full_payment" : "none"),
    extra_principal_policy: policy,
    accelerated_payoff: policy === "annual" || policy === "monthly" ? policy : "conditional",
    asof: terms.asof || debt.asof || null,
    missing,
    pi,
    escrow: escrowAmt,
  };
  if (missing.length) {
    return { ...base, ok: false, payoff_month: null, rows: [], principal: principal0, full_payment: null, draft: null };
  }
  const full = r2(pi + escrowAmt);
  const namedDraft = numOrNull(terms.draft != null ? terms.draft : debt.draft);
  const draft = namedDraft != null ? namedDraft : (frequency === "biweekly" ? r2(full / 2) : full);
  const drafts = opts.drafts != null ? opts.drafts : 2;
  const applyExtra = policy === "annual" || policy === "monthly";
  let principal = principal0;
  let unapplied = 0;
  const rows = [];
  for (let i = 1; i <= drafts; i++) {
    const conditional = frequency === "biweekly" && !applyExtra && ((i - 1) % 26) >= 24;
    if (conditional) {
      rows.push({
        n: i, cash_out: draft, conditional: true, applied: false, unapplied,
        interest: 0, principal_paid: 0, escrow: 0, principal,
        estimate: true, posted: false, statement_due_extra: 0,
      });
      continue;
    }
    unapplied = r2(unapplied + draft);
    let interest = 0;
    let principalPaid = 0;
    let escrowApplied = 0;
    let applied = false;
    if (unapplied + 0.001 >= full) {
      interest = r2(principal * apr / 12 / 100);
      principalPaid = r2(pi - interest);
      principal = r2(principal - principalPaid);
      escrowApplied = escrowAmt;
      unapplied = r2(unapplied - full);
      applied = true;
    }
    rows.push({
      n: i, cash_out: draft, conditional: false, applied, unapplied,
      interest, principal_paid: principalPaid, escrow: escrowApplied, principal,
      estimate: true, posted: false, statement_due_extra: 0,
    });
  }
  return { ...base, ok: true, payoff_month: null, rows, principal, draft, full_payment: full };
}

/** An estimate from the last statement. Predicted principal is never posted, and a missing input has no payoff date. */
export function mortgagePayoff(debt) {
  const frequency = String((debt.terms && debt.terms.frequency) || debt.frequency || "biweekly");
  const perMonth = frequency === "monthly" ? 1 : 2;
  const preview = forecastMortgage(debt, { drafts: perMonth });
  if (!preview.ok) return preview;
  const maxDrafts = frequency === "monthly" ? 600 : 1200;
  const run = forecastMortgage(debt, { drafts: maxDrafts });
  let payoff = null;
  for (const row of run.rows) {
    if (row.applied && row.principal <= 0) {
      payoff = Math.ceil(row.n / perMonth);
      break;
    }
  }
  return {
    ...run,
    rows: run.rows.slice(0, perMonth),
    payoff_month: payoff,
    ok: payoff != null,
    reason: payoff == null ? "does not finish in 50 years on the verified payment" : "",
    estimate: true,
    posted: false,
    note: "Estimate from the last statement. Not a lender payoff quote. Extra principal from a 26-draft year stays conditional until the book names that policy.",
  };
}

export function addMonths(n, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth() + n, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Everything the Home hero and the Plan tab show, for one budget. */
export function wayOut(book, budgetOverride) {
  const debts = debtsOf(book);
  const mortgages = debts.filter((d) => d.mortgage);
  const rest = debts.filter((d) => !d.mortgage);
  const known = rest.filter((d) => !d.missing);
  const missing = rest.filter((d) => d.missing);
  const mortgageForecasts = mortgages.map((d) => ({ debt: d, forecast: mortgagePayoff(d) }));
  const total = debts.every((d) => d.balance != null) ? r2(debts.reduce((a, d) => a + d.balance, 0)) : null;
  const scheduleTotal = r2(rest.filter((d) => d.balance != null).reduce((a, d) => a + d.balance, 0));
  const minSum = r2(known.reduce((a, d) => a + (d.min || 0), 0));
  const plan = book.plan || {};
  const budget = budgetOverride ?? (plan.budget ? +plan.budget : r2(Math.max(minSum, minSum * 1.15)));
  const methods = {};
  if (known.length && budget >= minSum - 0.004) {
    methods.avalanche = simulate(known, budget, "avalanche");
    methods.snowball = simulate(known, budget, "snowball");
    if (plan.order && plan.order.length) methods.custom = simulate(known, budget, "custom", plan.order);
    methods.minimums = simulate(known, minSum, "avalanche");
  }
  const chosen = plan.method && methods[plan.method] ? plan.method : (methods.custom ? "custom" : "avalanche");
  return {
    debts, known, missing, mortgages, mortgageForecasts, total, scheduleTotal, minSum, budget, methods, chosen,
  };
}
