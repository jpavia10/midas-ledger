/* Today (Midas v4, 2026-11-25; owner: "I feel like it used to be a lot better ... fucked up trash no logic poor effort ... this is a pillar
   that will share data to other pillars"). The first screen answers one question with real arithmetic: how much can be spent today
   without breaking the floor, once what is due before the next pay has been set aside.

     safe to spend = spendable available (Plaid "available", stale rows left out) − everything due before the next payday − the floor

   "Everything due" is one dated list built from three places: each card's and loan's minimum on its due day (the book's terms line),
   the recurring charges kept on this device (bills.js), and nothing twice. The next payday comes from Atlas (Work & Pay) when it has one;
   without it the window is the next 14 days. Pure functions, so the tests can check the arithmetic. */
import { addDays, diffDays, isDay, upcoming } from "./bills.js";

const finite = (n) => (typeof n === "number" && Number.isFinite(n) ? n : n != null && n !== "" && Number.isFinite(+n) ? +n : null);
const pad = (n) => String(n).padStart(2, "0");

/** Every date in [from, to] that falls on the given day of the month (a 31st in a 30-day month is that month's last day: card issuers
    move the due date to the last day, unlike a calendar repeat). */
export function monthDays(day, from, to) {
  const d = Math.max(1, Math.min(31, Math.round(+day || 0))); if (!d || !isDay(from) || !isDay(to)) return [];
  const out = []; let [y, m] = from.split("-").map(Number);
  for (let i = 0; i < 26; i++) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate(), s = `${y}-${pad(m)}-${pad(Math.min(d, last))}`;
    if (s > to) break; if (s >= from) out.push(s);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

const isDebt = (c) => c && (c.section === "Cards (detail)" || c.section === "Loans");
const marked = (c, m) => (c.marks || []).includes(m);

/** The book's own payments due from `from` to `to`: each card's and loan's minimum (never more than the balance) on its due day. */
export function bookDues(book, from, to) {
  const out = [];
  for (const c of (book && book.cards) || []) {
    if (!isDebt(c)) continue;
    const t = c.terms || {}, bal = finite(c.balance), min = finite(t.min_payment ?? t.min);
    const mortgage = c.kind === "mortgage" || /mortgage/i.test(c.name || "");
    let amount = mortgage ? (finite(t.pi) != null ? finite(t.pi) + (finite(t.escrow) || 0) : min) : min;
    if (amount == null || !(t.due_day > 0)) continue;
    if (bal != null && bal <= 0) continue;
    if (bal != null && !mortgage) amount = Math.min(amount, bal);
    if (!(amount > 0)) continue;
    for (const date of monthDays(t.due_day, from, to)) out.push({ date, name: c.name || c.id, id: c.id, amount: Math.round(amount * 100) / 100, kind: mortgage ? "mortgage" : c.section === "Loans" ? "loan" : "card", autopay: !!(t.autopay || c.autopay), pastDue: marked(c, "PAST DUE") });
  }
  return out;
}

/** The recurring charges on this device (hub slice), due from `from` to `to`. */
export function billDues(bills, from, to) {
  const days = Math.max(0, diffDays(from, to));
  return upcoming(bills || [], from, days).map(({ bill, date }) => ({ date, name: bill.name, id: bill.id, amount: Number(bill.amount) || 0, kind: bill.kind === "sub" ? "subscription" : "bill", autopay: !!bill.autopay }));
}

/** The next pay from Atlas's summary ({ nextPay: { date, net } }), if it is within a month. */
export function nextPay(atlas, today) {
  const p = atlas && atlas.nextPay; if (!p || !isDay(p.date)) return null;
  const n = diffDays(today, p.date); return n >= 0 && n <= 31 ? { date: p.date, net: finite(p.net), days: n } : null;
}

/** The whole answer: { spendable, floor, until, payday, dues, dueSum, free, safe, short }. */
export function safeToSpend(book, { today, bills = [], atlas = null } = {}) {
  const h = (book && book.headline) || {}, liquid = book && book.liquid;
  const spendable = finite(liquid && liquid.avail) ?? finite(h.spendable) ?? finite(h.banked);
  const floor = finite(h.floor) ?? 3000;
  const pay = nextPay(atlas, today);
  const until = pay ? addDays(pay.date, -1) : addDays(today, 14);
  const dues = [...bookDues(book, today, until), ...billDues(bills, today, until)].sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  const dueSum = Math.round(dues.reduce((s, x) => s + x.amount, 0) * 100) / 100;
  if (spendable == null) return { spendable: null, floor, until, payday: pay, dues, dueSum, free: null, safe: null, short: null };
  const free = Math.round((spendable - dueSum) * 100) / 100, over = Math.round((free - floor) * 100) / 100;
  return { spendable, floor, until, payday: pay, dues, dueSum, free, safe: Math.max(0, over), short: over < 0 ? -over : 0 };
}

/** What needs a hand, with what to do about it. */
export function attention(book, today = new Date().toISOString().slice(0, 10)) {
  const out = [];
  for (const c of (book && book.cards) || []) {
    const m = c.marks || [];
    if (m.includes("PAST DUE")) out.push({ id: c.id, name: c.name, level: 3, mark: "PAST DUE", what: `Past due${c.asof ? " since " + c.asof : ""}. Pay it or call the lender today: a 30-day late mark reaches the credit report.` });
    else if (m.includes("NEED YOU")) out.push({ id: c.id, name: c.name, level: 2, mark: "NEED YOU", what: (c.lines && c.lines[0] ? c.lines[0][0].toUpperCase() + c.lines[0].slice(1) + ". " : "") + "The book needs the latest statement or balance to count it." });
    else if (m.includes("STALE?")) out.push({ id: c.id, name: c.name, level: 1, mark: "STALE?", what: `Last seen ${c.asof || "a while ago"}. Check the balance; it is left out of every total until then.` });
  }
  /* promos ending inside 90 days with a balance still on them */
  for (const c of (book && book.cards) || []) {
    const t = c.terms || {}, bal = finite(c.balance);
    if (!isDebt(c) || !t.promo_end || !(bal > 0)) continue;
    const end = String(t.promo_end).slice(0, 10); if (!isDay(end)) continue;
    const days = diffDays(today, end);
    if (days < 0 || days > 90) continue;
    out.push({ id: c.id, name: c.name, level: t.deferred ? 3 : 2, mark: "PROMO", what: `The ${t.promo_apr ?? 0}% promo ends ${end} (${days} days) with ${money(bal)} still on it${t.deferred ? ": deferred interest bills every month's interest back if a cent is left" : `; after that it is ${t.apr ?? "the purchase"}%`}.` });
  }
  return out.sort((a, b) => b.level - a.level);
}

/** Owed, split the way the plan splits it: cards and loans in the plan, the mortgage on its own schedule, credit used on the cards. */
export function owed(book) {
  let cards = 0, loans = 0, mortgage = 0, unknown = 0, used = 0, limit = 0;
  for (const c of (book && book.cards) || []) {
    if (!isDebt(c)) continue; const bal = finite(c.balance);
    if (bal == null || c.unknown) { unknown++; continue; }
    if (bal <= 0) continue;
    const isMort = c.kind === "mortgage" || /mortgage/i.test(c.name || "");
    if (isMort) mortgage += bal; else if (c.section === "Loans" || c.kind === "installment") loans += bal; else cards += bal;
    const lim = finite((c.terms || {}).credit_limit);
    if (c.section === "Cards (detail)" && c.kind !== "installment" && lim > 0) { used += bal; limit += lim; }
  }
  const r = (n) => Math.round(n * 100) / 100;
  return { cards: r(cards), loans: r(loans), mortgage: r(mortgage), plan: r(cards + loans), all: r(cards + loans + mortgage), unknown, utilization: limit > 0 ? used / limit : null, used: r(used), limit: r(limit) };
}

function money(n, d = 2) { return n == null ? "—" : (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
export { money as fmt };
