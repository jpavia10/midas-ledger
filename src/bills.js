/* Bills and subscriptions (2026-11-25, folded in from the hub's Payoff Console: owner, "Replace money at the bottom with midas and just
   incorporate whatever the goal of that was into Midas"). The recurring charges stay where they always lived: this device's hub store
   (localStorage "prom.deck.money", the same origin as Midas), so the hub's Time keeps showing every due date and the hub's backup still
   carries them. They are not in the encrypted book and never leave the device. Dates follow the hub's calendar rule (RFC 5545): a monthly
   charge anchored on the 31st has no date in a 30-day month, the same as Time shows. Pure, so the tests can run it. */

export const HUB_KEY = "prom.deck.money";
export const CYCLE = {
  week: { days: 7, perMonth: 52 / 12, text: "weekly" },
  "2weeks": { days: 14, perMonth: 26 / 12, text: "every 2 weeks" },
  month: { months: 1, perMonth: 1, text: "monthly" },
  quarter: { months: 3, perMonth: 1 / 3, text: "every 3 months" },
  "6months": { months: 6, perMonth: 1 / 6, text: "every 6 months" },
  year: { months: 12, perMonth: 1 / 12, text: "yearly" },
};
export const CYCLES = Object.keys(CYCLE);
const cyc = (b) => CYCLE[b && b.every] || CYCLE.month;
const pad = (n) => String(n).padStart(2, "0");
export const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !isNaN(Date.parse(s + "T00:00:00Z"));
export const todayIso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const utc = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const iso = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const addDays = (s, n) => iso(utc(s) + n * 864e5);
export const diffDays = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);

/** Every date a charge falls on from `from` to `to` (inclusive), at most `max`. */
export function chargeDates(b, from, to, max = 400) {
  if (!b || !isDay(b.anchor) || !isDay(from) || !isDay(to) || to < from) return [];
  const c = cyc(b), out = [];
  if (c.days) {
    let k = b.anchor >= from ? 0 : Math.ceil(diffDays(b.anchor, from) / c.days);
    for (let d = addDays(b.anchor, k * c.days); d <= to && out.length < max; k++, d = addDays(b.anchor, k * c.days)) if (d >= from) out.push(d);
    return out;
  }
  const [y0, m0, d0] = b.anchor.split("-").map(Number);
  for (let i = 0, guard = 0; out.length < max && guard < 2400; i += c.months, guard++) {
    const t = y0 * 12 + (m0 - 1) + i, y = Math.floor(t / 12), m = (t % 12) + 1;
    if (`${y}-${pad(m)}-01` > to) break;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); if (d0 > last) continue;          // no 31st in a 30-day month (RFC 5545)
    const s = `${y}-${pad(m)}-${pad(d0)}`; if (s >= from && s <= to) out.push(s);
  }
  return out;
}
export const nextDue = (b, today) => chargeDates(b, today, addDays(today, 800), 1)[0] || null;
export const monthlyCost = (b) => (Number(b.amount) || 0) * cyc(b).perMonth;
export const cycleText = (every) => (CYCLE[every] || CYCLE.month).text;

/** What the recurring charges cost: a month, a year, the subscriptions alone, and the subscriptions by what each costs in a year. */
export function burn(bills) {
  const list = Array.isArray(bills) ? bills : [];
  const subs = list.filter((b) => b.kind === "sub");
  const monthly = list.reduce((s, b) => s + monthlyCost(b), 0);
  return { monthly, yearly: monthly * 12, subsMonthly: subs.reduce((s, b) => s + monthlyCost(b), 0),
    subs: subs.map((b) => ({ ...b, yearly: monthlyCost(b) * 12 })).sort((a, b) => b.yearly - a.yearly) };
}

/** The charges due from today through `days` days ahead, soonest first: [{ bill, date }]. */
export function upcoming(bills, today, days = 14) {
  const to = addDays(today, days), out = [];
  for (const b of bills || []) for (const date of chargeDates(b, today, to, 8)) out.push({ bill: b, date });
  return out.sort((a, b) => a.date.localeCompare(b.date) || String(a.bill.name).localeCompare(String(b.bill.name)));
}

/* ---- the hub's store slice (schema 1: { plan, events, bills, seen }) ---- */
const blank = () => ({ plan: null, events: [], bills: [], seen: { pct: 0 } });
/** Reads the slice. `writable` is false when the slice is from a newer hub than this page understands: Midas then shows it and never
    writes over it. */
export function readHub(ls) {
  let o = null;
  try { o = JSON.parse((ls && ls.getItem(HUB_KEY)) || "null"); } catch (e) { o = null; }
  if (!o) return { data: blank(), writable: true, found: false };
  if (o.schema !== 1 || !o.data || typeof o.data !== "object") return { data: { ...blank(), ...(o.data || {}) }, writable: false, found: true };
  const d = o.data;
  return { data: { ...d, plan: d.plan || null, events: Array.isArray(d.events) ? d.events : [], bills: Array.isArray(d.bills) ? d.bills : [], seen: d.seen || { pct: 0 } }, writable: true, found: true };
}
/** Writes the slice back in the hub's own envelope, every other field kept as it was. */
export function writeHub(ls, data) {
  const now = new Date().toISOString();
  ls.setItem(HUB_KEY, JSON.stringify({ schema: 1, saved: now, data }));
  return now;
}
/** A charge as the hub stores it; null when a name, an amount or a due date is missing. */
export function cleanBill(raw, id) {
  const name = String(raw.name || "").trim().slice(0, 60), amount = Number(raw.amount);
  if (!name || !(amount >= 0) || !isDay(raw.anchor)) return null;
  const rec = { id: id || "b" + Date.now().toString(36), name, amount: Math.round(amount * 100) / 100, every: CYCLE[raw.every] ? raw.every : "month",
    anchor: raw.anchor, kind: raw.kind === "sub" ? "sub" : "bill", autopay: !!raw.autopay };
  if (isDay(raw.lastUsed)) rec.lastUsed = raw.lastUsed;
  const note = String(raw.note || "").trim().slice(0, 120); if (note) rec.note = note;
  return rec;
}
