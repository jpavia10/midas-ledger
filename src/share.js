/* What Midas shares with the other pillars, and what it reads from them (Midas v4, 2026-11-25; owner: "this is a pillar that will share
   data to other pillars"). Everything stays in this browser (the same origin as the hub and its pillars); nothing goes to a server.

   Midas writes, after the book opens, unless sharing is turned off on the Book tab:
     localStorage "prometheus.midas.summary" = { v: 1, at, asof, spendable, floor, safe, short, owed: { cards, loans, mortgage, plan },
       utilization, debtFree: { month, months, interest }, netWorth: { net, assets, liabilities, complete }, dues: [{ date, name, amount, kind }] }
   Totals and dates only: no account numbers, no notes, no ledger text. The hub's Time shows the dues; the Midas place in the town reads
   the debt-free month; Hearth and Aegis read net worth and the floor.

   Midas reads:
     "prometheus.hearth.summary"  { contentsValue, items, rooms }  what is in the house, room by room (Hearth)
     "prometheus.atlas.summary"   { nextPay: { date, net }, ... }  the next payday (Atlas)
     "prom.deck.money"            the recurring charges (bills.js) */
import { addMonths } from "./plan.js";
export const SUMMARY_KEY = "prometheus.midas.summary";
export const SHARE_PREF = "midasDesk:share";
const ls = () => { try { return window.localStorage; } catch (e) { return null; } };
export const read = (k) => { const s = ls(); if (!s) return null; try { return JSON.parse(s.getItem(k) || "null"); } catch (e) { return null; } };
export const shareOn = () => { const s = ls(); try { return !s || s.getItem(SHARE_PREF) !== "0"; } catch (e) { return true; } };
export function setShare(on) { const s = ls(); if (!s) return; try { s.setItem(SHARE_PREF, on ? "1" : "0"); if (!on) s.removeItem(SUMMARY_KEY); } catch (e) { /* private mode */ } }

/** The summary object (pure: the caller hands in everything it was computed from). */
export function summary({ book, safe, owe, way, worth, now = new Date() }) {
  const r = (n) => (n == null ? null : Math.round(n * 100) / 100);
  const plan = way && way.methods && way.methods[way.chosen];
  return {
    v: 1, at: now.toISOString(), asof: (book && (book.ledger_update || book.built_pt)) || null,
    spendable: r(safe && safe.spendable), floor: r(safe && safe.floor), safe: r(safe && safe.safe), short: r(safe && safe.short),
    owed: owe ? { cards: owe.cards, loans: owe.loans, mortgage: owe.mortgage, plan: owe.plan } : null,
    utilization: owe && owe.utilization != null ? Math.round(owe.utilization * 1000) / 1000 : null,
    debtFree: plan && plan.ok ? { month: addMonths(plan.months.length, now), months: plan.months.length, interest: r(plan.total_interest) } : null,
    netWorth: worth ? { net: r(worth.assets != null && worth.liabilities != null ? worth.assets - worth.liabilities : null), assets: r(worth.assets), liabilities: r(worth.liabilities), complete: worth.status === "COMPLETE" } : null,
    dues: ((safe && safe.dues) || []).filter((d) => d.kind !== "bill" && d.kind !== "subscription").map((d) => ({ date: d.date, name: d.name, amount: d.amount, kind: d.kind })),
  };
}
export function publish(obj) { if (!shareOn()) return false; const s = ls(); if (!s) return false; try { s.setItem(SUMMARY_KEY, JSON.stringify(obj)); return true; } catch (e) { return false; } }
