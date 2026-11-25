/* The library's math (2026-11-25, folded in from the hub's Payoff Console; the same rules as its engine, deck/models/money.js):
   what paying only an issuer's published minimum costs, and deferred interest against a true 0 % promo. Whole cents throughout;
   one month's interest is apr / 12 on the balance, rounded half up. Pure, so the tests can check it. */

const toCents = (n) => Math.round(Number(n) * 100);
const monthInterestC = (balC, apr) => Math.floor((balC * Math.round(Number(apr) * 1000) + 600000) / 1200000);

/** A tiny, safe reader for the issuers' minimum formulas: numbers, B (balance) I (interest) F (fees), + - * /, < <= > >=, ?:, min(), max().
    Never eval. */
export function evalFormula(src, vars) {
  const s = String(src); let i = 0;
  const ws = () => { while (s[i] === " ") i++; };
  const num = () => { ws(); const m = /^\d*\.?\d+/.exec(s.slice(i)); if (!m) throw new Error("number expected at " + i); i += m[0].length; return Number(m[0]); };
  const prim = () => {
    ws();
    if (s[i] === "(") { i++; const v = tern(); ws(); if (s[i] !== ")") throw new Error(") expected"); i++; return v; }
    if (s[i] === "-") { i++; return -prim(); }
    const id = /^[A-Za-z]+/.exec(s.slice(i));
    if (id) {
      i += id[0].length; ws();
      if (s[i] === "(") {
        i++; const args = [tern()]; ws(); while (s[i] === ",") { i++; args.push(tern()); ws(); }
        if (s[i] !== ")") throw new Error(") expected"); i++;
        if (id[0] === "min") return Math.min(...args); if (id[0] === "max") return Math.max(...args); throw new Error("unknown function " + id[0]);
      }
      if (!Object.prototype.hasOwnProperty.call(vars, id[0])) throw new Error("unknown name " + id[0]); return vars[id[0]];
    }
    return num();
  };
  const mul = () => { let v = prim(); for (;;) { ws(); if (s[i] === "*") { i++; v *= prim(); } else if (s[i] === "/") { i++; v /= prim(); } else return v; } };
  const add = () => { let v = mul(); for (;;) { ws(); if (s[i] === "+") { i++; v += mul(); } else if (s[i] === "-") { i++; v -= mul(); } else return v; } };
  const cmp = () => { const a = add(); ws(); const m = /^(<=|>=|<|>)/.exec(s.slice(i)); if (!m) return a; i += m[0].length; const b = add(); return m[0] === "<" ? a < b : m[0] === "<=" ? a <= b : m[0] === ">" ? a > b : a >= b; };
  const tern = () => { const c = cmp(); ws(); if (s[i] !== "?") return c; i++; const a = tern(); ws(); if (s[i] !== ":") throw new Error(": expected"); i++; const b = tern(); return c ? a : b; };
  const v = tern(); ws(); if (i < s.length) throw new Error("unexpected " + s[i]); return v;
}

/** Paying exactly the issuer's formula minimum every month (no new charges, no fees): months, interest (cents), the first three payments
    (cents) and the balance curve (cents). Stalled when the minimum never beats the interest. */
export function minimumTrap({ balance, apr, formula, cap = 1200 }) {
  let bal = toCents(balance), interestC = 0, m = 0; const first = [], curve = [bal];
  while (bal > 0 && m < cap) {
    m++; const it = monthInterestC(bal, apr); const B = (bal + it) / 100;
    let pay = toCents(evalFormula(formula, { B, I: it / 100, F: 0 })); pay = Math.max(0, Math.min(pay, bal + it));
    if (pay <= it && bal + it - pay >= bal) return { months: Infinity, interestC, first, curve, stalled: true };
    bal = bal + it - pay; interestC += it; if (first.length < 3) first.push(pay); curve.push(bal);
  }
  return { months: m, interestC, first, curve, stalled: bal > 0 };
}

/** A promo purchase: `amount` at `apr` after `months` of promo, paying `payment` a month. Deferred interest bills every month's interest
    back to day one if a cent is left when the promo ends; a true 0 % promo charges nothing for the promo months. */
export function deferredExample({ amount, apr, months, payment }) {
  let bal = toCents(amount), pot = 0; const n = Math.max(1, Math.round(+months || 1));
  for (let m = 1; m <= n; m++) { pot += monthInterestC(bal, apr); bal = Math.max(0, bal - toCents(payment)); }
  return { leftC: bal, deferredChargeC: bal > 0 ? pot : 0, trueZeroChargeC: 0, payInFullEvery: Math.ceil(toCents(amount) / n) / 100 };
}
