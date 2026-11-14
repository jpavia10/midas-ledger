/* Charts drawn from decrypted numbers only. */

export const CYAN = "#9fd4e6";
export const MAGENTA = "#e9d7a8";   // v2: Midas gold (it was neon magenta)
export const ROSE = "#f2b8a0";      // v2: money going out / short of the floor, soft, never alarm red
export const LIME = "#9fe6c2";
const VIOLET = "#c9b8ea";
const AMBER = "#f0d29a";
const SERIES = [CYAN, MAGENTA, LIME, VIOLET, AMBER];

function money(n) {
  return n == null || !Number.isFinite(n) ? "—" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}

function finite(n) {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  return null;
}

export function balanceLabel(card) {
  if (!card) return "unknown";
  if (card.unknown) return "unknown";
  if (typeof card.balance === "number" && Number.isFinite(card.balance)) return money(card.balance);
  return "see note";
}

function revolvingCard(card) {
  if (!card || card.section !== "Cards (detail)") return false;
  if (card.kind === "installment" || card.kind === "mortgage") return false;
  if (/\bflex\b/i.test(card.name || "") || /\binstallment\b/i.test(card.name || "")) return false;
  return true;
}

export function spendableOf(book) {
  const liquid = book && book.liquid;
  const fromLiquid = liquid ? finite(liquid.avail) : null;
  if (fromLiquid != null) return fromLiquid;
  const head = (book && book.headline) || {};
  const named = finite(head.spendable);
  if (named != null) return named;
  return finite(head.banked);
}

export function floorTip(banked, floor) {
  const have = finite(banked);
  const goal = finite(floor);
  if (have == null || goal == null) return "";
  const gap = have - goal;
  const rel = gap >= 0 ? "Above floor by " + money(gap) : "Short " + money(goal - have);
  return "Spendable " + money(have) + " · Floor " + money(goal) + " · " + rel;
}

export function sparkHtml(history) {
  const h = history || [];
  if (h.length < 2) return "";
  const W = 320;
  const H = 70;
  const inset = 8;
  const mn = Math.min(...h.map((x) => x.score), 400) - 10;
  const mx = Math.max(...h.map((x) => x.score)) + 10;
  const span = mx - mn || 1;
  const pt = (v, i) => [inset + (i / (h.length - 1)) * (W - inset * 2), H - ((v - mn) / span) * H];
  const d = h.map((x, i) => pt(x.score, i).map((n) => n.toFixed(1)).join(",")).join(" ");
  const gy = pt(400, 0)[1];
  const last = h.at(-1);
  return `<div class="chart" data-chart="stress">
    <p class="chart-tip" role="status" hidden></p>
    <div class="scrub" hidden></div>
    <svg viewBox="0 0 ${W} ${H + 14}" width="100%" role="img" aria-label="Stress history">
      <line x1="${inset}" x2="${W - inset}" y1="${gy}" y2="${gy}" stroke="${CYAN}" stroke-dasharray="4 4"/>
      <polyline points="${d}" fill="none" stroke="${LIME}" stroke-width="2"/>
      ${h.map((x, i) => {
        const [px, py] = pt(x.score, i);
        const label = escAttr(x.when) + ": " + x.score;
        return `<circle class="spark-hit" cx="${px}" cy="${py}" r="12" fill="transparent" tabindex="0" role="button" data-open="history:${i}" data-score="${escAttr(x.score)}" data-when="${escAttr(x.when)}" aria-label="${label}"></circle><circle class="spark-dot" cx="${px}" cy="${py}" r="2.5" fill="#f4fbff" pointer-events="none"><title>${label}</title></circle>`;
      }).join("")}
      <text x="0" y="${H + 12}" fill="#b7c4d6" font-size="9" font-family="ui-monospace, monospace">${esc(h[0].when)} ${h[0].score}</text>
      <text x="${W}" y="${H + 12}" fill="#b7c4d6" font-size="9" font-family="ui-monospace, monospace" text-anchor="end">${esc(last.when)} ${last.score}</text>
    </svg>
  </div>`;
}

export function compositionHtml(cards) {
  const list = (cards || []).filter(revolvingCard);
  if (!list.length) return "";
  const nums = list.map((c) => (typeof c.balance === "number" && Number.isFinite(c.balance) && !c.unknown ? c.balance : 0));
  const max = Math.max(...nums, 0);
  const rows = list.map((c) => {
    const known = !c.unknown && typeof c.balance === "number" && Number.isFinite(c.balance);
    const pct = !known || max <= 0 ? 0 : Math.max(2, (c.balance / max) * 100);
    const figure = balanceLabel(c);
    const width = known ? pct.toFixed(1) : "0";
    const fig = c.unknown
      ? '<span class="pending">unknown</span>'
      : known ? esc(figure) : '<span class="pending">see note</span>';
    return `<button type="button" class="comp-row" data-open="card:${escAttr(c.id)}" data-balance="${known ? escAttr(c.balance) : ""}" aria-label="${escAttr(c.name)} ${escAttr(figure)}">
      <span class="comp-name">${esc(c.name)} <span class="id">${esc(c.id)}</span></span>
      <span class="comp-track" aria-hidden="true"><i style="width:${width}%"></i></span>
      <span class="comp-fig">${fig}</span>
    </button>`;
  }).join("");
  return `<div class="chart" data-chart="revolving"><p class="kicker">Posted balances</p><div class="comp">${rows}</div></div>`;
}

function flowRows(book) {
  const months = (book && book.cashflow && book.cashflow.months) || [];
  return months.map((m) => {
    const income = (finite(m.income) || 0) + (finite(m.other_in) || 0);
    const spend = (finite(m.lifestyle) || 0) + (finite(m.debt) || 0) + (finite(m.fees) || 0) + (finite(m.atm) || 0);
    return {
      id: m.id || "",
      label: m.label || m.id || "",
      stub: !!m.stub,
      income,
      spend,
      net: finite(m.net)
    };
  });
}

function flowSvg(rows) {
  if (!rows.length) return "";
  const W = 360;
  const H = 168;
  const pad = 28;
  const base = H - 36;
  const maxBar = Math.max(...rows.map((r) => Math.max(r.income, r.spend)), 1);
  const nets = rows.map((r) => r.net).filter((n) => n != null);
  const netMin = Math.min(0, ...(nets.length ? nets : [0]));
  const netMax = Math.max(0, ...(nets.length ? nets : [0]));
  const netSpan = netMax - netMin || 1;
  const slot = (W - pad * 2) / rows.length;
  const netY = (n) => 18 + (1 - (n - netMin) / netSpan) * (base - 22);
  const points = [];
  const bars = rows.map((row, i) => {
    const cx = pad + slot * i + slot / 2;
    const hIn = (row.income / maxBar) * (base - 28);
    const hOut = (row.spend / maxBar) * (base - 28);
    const x0 = cx - 14;
    if (row.net != null) points.push(cx.toFixed(1) + "," + netY(row.net).toFixed(1));
    return `<rect x="${x0.toFixed(1)}" y="${(base - hIn).toFixed(1)}" width="12" height="${hIn.toFixed(1)}" fill="${CYAN}" rx="2"><title>${esc(row.label)} in ${money(row.income)}</title></rect>
      <rect x="${(x0 + 14).toFixed(1)}" y="${(base - hOut).toFixed(1)}" width="12" height="${hOut.toFixed(1)}" fill="${ROSE}" rx="2"><title>${esc(row.label)} out ${money(row.spend)}</title></rect>
      <text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="#b7c4d6" font-size="10" font-family="ui-monospace, monospace">${esc(row.label)}${row.stub ? "*" : ""}</text>`;
  }).join("");
  const zero = netY(0);
  const line = points.length > 1 ? `<polyline points="${points.join(" ")}" fill="none" stroke="${LIME}" stroke-width="2"/>` : "";
  const dots = rows.map((row, i) => {
    if (row.net == null) return "";
    const cx = pad + slot * i + slot / 2;
    return `<circle cx="${cx.toFixed(1)}" cy="${netY(row.net).toFixed(1)}" r="3" fill="${LIME}"><title>${esc(row.label)} net ${money(row.net)}</title></circle>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Income versus spend, net line">
    <line x1="${pad}" x2="${W - 8}" y1="${zero.toFixed(1)}" y2="${zero.toFixed(1)}" stroke="rgba(159, 230, 194,0.35)" stroke-dasharray="3 3"/>
    ${bars}${line}${dots}
  </svg>`;
}

function categoryBlock(book) {
  const months = (book && book.categories && book.categories.months) || [];
  const picked = [...months].reverse().find((m) => !m.stub && (m.items || []).length)
    || [...months].reverse().find((m) => (m.items || []).length);
  if (!picked) return "";
  const items = picked.items || [];
  const max = Math.max(...items.map((item) => finite(item.amount) || 0), 1);
  const rows = items.map((item) => {
    const amount = finite(item.amount) || 0;
    const width = Math.max(2, (amount / max) * 100).toFixed(1);
    return `<div class="comp-row cat-row" data-cat="${escAttr(item.name)}" data-group="${escAttr(item.group || "")}" data-amount="${escAttr(amount)}">
      <span class="comp-name">${esc(item.name)}</span>
      <span class="comp-track" aria-hidden="true"><i style="width:${width}%"></i></span>
      <span class="comp-fig num">${esc(money(amount))}</span>
    </div>`;
  }).join("");
  const burn = finite(picked.burn);
  return `<article class="card glass metric">
    <p class="kicker">Categories · ${esc(picked.label || picked.id || "")}${picked.stub ? " · stub" : ""}</p>
    <p class="meta">${burn == null ? "" : "Burn " + money(burn)}${picked.partial ? " · selected categories do not cover this total" : ""}</p>
    <div class="chart comp">${rows}</div>
  </article>`;
}

function utilitySvg(book) {
  const util = (book && book.utilities) || {};
  const months = util.months || [];
  if (!months.length) return "";
  const ids = [];
  months.forEach((month) => {
    Object.keys(month.providers || {}).forEach((id) => {
      if (!ids.includes(id)) ids.push(id);
    });
  });
  const names = {};
  (util.providers || []).forEach((p) => { names[p.id] = p.name || p.id; });
  const W = 360;
  const H = 180;
  const pad = 28;
  const base = H - 36;
  const max = Math.max(...months.map((m) => Math.max(finite(m.cumulative) || 0, finite(m.total) || 0)), 1);
  const slot = (W - pad * 2) / months.length;
  const yOf = (v) => base - (v / max) * (base - 20);
  const bars = months.map((month, i) => {
    const cx = pad + slot * i + slot / 2;
    let y = base;
    const segs = ids.map((id, n) => {
      const amount = finite((month.providers || {})[id]) || 0;
      const h = (amount / max) * (base - 20);
      y -= h;
      return `<rect x="${(cx - 10).toFixed(1)}" y="${y.toFixed(1)}" width="20" height="${h.toFixed(1)}" fill="${SERIES[n % SERIES.length]}"><title>${esc(names[id] || id)} ${money(amount)}</title></rect>`;
    }).join("");
    return segs + `<text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="#b7c4d6" font-size="10" font-family="ui-monospace, monospace">${esc(month.label || month.id || "")}</text>`;
  }).join("");
  const line = months.map((month, i) => {
    const cx = pad + slot * i + slot / 2;
    return cx.toFixed(1) + "," + yOf(finite(month.cumulative) || 0).toFixed(1);
  }).join(" ");
  const legend = ids.map((id, n) => `<span class="legend"><i style="background:${SERIES[n % SERIES.length]}"></i>${esc(names[id] || id)}</span>`).join("");
  const rows = months.map((month) => `<li data-util-month="${escAttr(month.id || "")}" data-util-total="${escAttr(month.total ?? "")}" data-util-cum="${escAttr(month.cumulative ?? "")}">${esc(month.label || month.id || "")} <b class="num">${esc(money(finite(month.total)))}</b> <span class="meta">cum ${esc(money(finite(month.cumulative)))}</span></li>`).join("");
  return `<article class="card glass metric">
    <p class="kicker">Utilities</p>
    <div class="legend-row">${legend}<span class="legend"><i style="background:${LIME}"></i>Cumulative</span></div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Utilities by month and cumulative">
      ${bars}
      <polyline points="${line}" fill="none" stroke="${LIME}" stroke-width="2"/>
    </svg>
    <ul class="mini">${rows}</ul>
  </article>`;
}

export function positionFromCards(book) {
  const cards = (book && book.cards) || [];
  const markedOff = (card) => {
    const marks = card.marks || [];
    return marks.includes("STALE?") || marks.includes("NEED YOU") || marks.includes("PAST DUE");
  };
  let assets = 0;
  let liabilities = 0;
  let haveAssets = false;
  let haveLiabilities = false;
  const missing = [];
  cards.forEach((card) => {
    const amount = finite(card.balance);
    const usable = !card.unknown && amount != null && !markedOff(card);
    if (card.section === "Cash" || card.section === "Assets beyond cash") {
      if (card.section === "Assets beyond cash" && !usable && !markedOff(card)) missing.push(card.name || card.id);
      if (!usable) return;
      assets += amount;
      haveAssets = true;
      return;
    }
    const installment = card.section === "Cards (detail)" && (card.kind === "installment" || /\bflex\b/i.test(card.name || ""));
    if (card.section === "Loans" || installment) {
      if (!usable && !markedOff(card)) missing.push(card.name || card.id);
      if (!usable) return;
      liabilities += amount;
      haveLiabilities = true;
      return;
    }
    if (card.section === "Cards (detail)" && card.unknown && !markedOff(card)) missing.push(card.name || card.id);
  });
  const head = (book && book.headline) || {};
  const revolving = finite(head.revolving);
  if (revolving != null) {
    liabilities += revolving;
    haveLiabilities = true;
  } else if (finite(head.revolving_projected) != null) {
    missing.push("posted revolving");
  }
  const stated = book && book.networth && book.networth.status;
  return {
    assets: haveAssets ? assets : null,
    liabilities: haveLiabilities ? liabilities : null,
    status: missing.length || stated === "INCOMPLETE" ? "INCOMPLETE" : "COMPLETE",
    missing
  };
}

function networthBlock(book) {
  const snaps = ((book && book.networth && book.networth.snapshots) || []).filter((s) => finite(s.net) != null);
  const position = positionFromCards(book);
  if (!snaps.length && position.assets == null && position.liabilities == null) return "";
  let svg = "";
  if (snaps.length >= 2) {
    const W = 360;
    const H = 120;
    const nums = snaps.map((s) => s.net);
    const mn = Math.min(...nums);
    const mx = Math.max(...nums);
    const span = mx - mn || 1;
    const pt = (v, i) => [(i / (snaps.length - 1)) * (W - 16) + 8, 16 + (1 - (v - mn) / span) * (H - 36)];
    const d = snaps.map((s, i) => pt(s.net, i).map((n) => n.toFixed(1)).join(",")).join(" ");
    svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Net worth trend">
      <polyline points="${d}" fill="none" stroke="${CYAN}" stroke-width="2"/>
      ${snaps.map((s, i) => {
        const [x, y] = pt(s.net, i);
        return `<circle cx="${x}" cy="${y}" r="3" fill="${CYAN}" data-nw="${escAttr(s.when)}" data-net="${escAttr(s.net)}"><title>${esc(s.when)} ${money(s.net)}</title></circle>`;
      }).join("")}
    </svg>`;
  } else if (snaps.length === 1) {
    svg = `<p class="figure num" data-nw="${escAttr(snaps[0].when)}" data-net="${escAttr(snaps[0].net)}">${esc(money(snaps[0].net))}</p><p class="meta">${esc(snaps[0].when)}</p>`;
  }
  const pair = (position.assets != null || position.liabilities != null) ? `<div class="pair tight">
      <article class="card inset"><p class="kicker">Assets</p><p class="figure num">${esc(money(position.assets))}</p></article>
      <article class="card inset"><p class="kicker">Liabilities</p><p class="figure num debt">${esc(money(position.liabilities))}</p></article>
    </div>` : "";
  const incomplete = position.status === "INCOMPLETE";
  const projected = book && book.headline ? finite(book.headline.revolving_projected) : null;
  const status = incomplete
    ? `<p class="meta" data-nw-status="INCOMPLETE">INCOMPLETE${position.missing.length ? " · " + esc(position.missing.join(", ")) : ""}</p>`
    : "";
  const projection = projected != null ? `<p class="meta">Pending payoff ${esc(money(projected))} is not the posted liability.</p>` : "";
  return `<article class="card glass metric">
    <p class="kicker">Net worth</p>
    ${status}
    ${svg}
    ${pair}
    ${projection}
    <p class="meta">Stale and need-you balances stay out of the pair. Equity is not added on top of gross value.</p>
  </article>`;
}

export function flowChartsHtml(book) {
  const rows = flowRows(book);
  const flow = rows.length ? `<article class="card glass metric">
      <p class="kicker">Income vs spend</p>
      <div class="legend-row"><span class="legend"><i style="background:${CYAN}"></i>In</span><span class="legend"><i style="background:${ROSE}"></i>Out</span><span class="legend"><i style="background:${LIME}"></i>Net</span></div>
      ${flowSvg(rows)}
      <ul class="mini">${rows.map((row) => `<li data-flow-month="${escAttr(row.id)}" data-flow-income="${escAttr(row.income)}" data-flow-spend="${escAttr(row.spend)}" data-flow-net="${row.net == null ? "" : escAttr(row.net)}"><span>${esc(row.label)}</span> <b class="num">${row.net == null ? "—" : esc(money(row.net))}</b></li>`).join("")}</ul>
    </article>` : `<article class="card glass metric"><p class="kicker">Income vs spend</p><p class="meta">Cash flow shows up when the book is rebuilt with a Plaid rollup or a Cash flow page.</p></article>`;
  return `<div class="flow-stack">${flow}${categoryBlock(book)}${utilitySvg(book)}${networthBlock(book)}</div>`;
}

function placeTip(chart, tip, clientX) {
  const host = chart.getBoundingClientRect();
  const x = Math.min(Math.max(12, clientX - host.left), Math.max(12, host.width - 12));
  tip.hidden = false;
  tip.style.left = x + "px";
}

function nearestHit(chart, clientX) {
  const pts = [...chart.querySelectorAll(".spark-hit")];
  let best = null;
  let bestD = Infinity;
  pts.forEach((pt) => {
    const rect = pt.getBoundingClientRect();
    const dist = Math.abs(clientX - (rect.left + rect.width / 2));
    if (dist < bestD) {
      bestD = dist;
      best = pt;
    }
  });
  return best;
}

function showPoint(chart, pt) {
  const tip = chart.querySelector(".chart-tip");
  const scrub = chart.querySelector(".scrub");
  if (!tip || !pt) return;
  chart.querySelectorAll(".spark-hit").forEach((hit) => hit.classList.toggle("is-hot", hit === pt));
  tip.textContent = (pt.getAttribute("data-when") || "Point") + ": " + (pt.getAttribute("data-score") || "");
  const rect = pt.getBoundingClientRect();
  const host = chart.getBoundingClientRect();
  const x = rect.left + rect.width / 2 - host.left;
  tip.hidden = false;
  tip.style.left = Math.min(Math.max(12, x), Math.max(12, host.width - 12)) + "px";
  if (scrub) {
    scrub.hidden = false;
    scrub.style.left = x + "px";
  }
}

function hideSpark(chart) {
  const tip = chart.querySelector(".chart-tip");
  const scrub = chart.querySelector(".scrub");
  if (tip) tip.hidden = true;
  if (scrub) scrub.hidden = true;
  chart.querySelectorAll(".spark-hit.is-hot").forEach((hit) => hit.classList.remove("is-hot"));
}

function bindSpark(chart) {
  if (chart.dataset.bound === "1") return;
  chart.dataset.bound = "1";
  let originX = 0;
  let moved = 0;
  let tracking = false;
  chart.addEventListener("pointerdown", (event) => {
    tracking = true;
    originX = event.clientX;
    moved = 0;
    const pt = nearestHit(chart, event.clientX);
    if (pt) showPoint(chart, pt);
  });
  chart.addEventListener("pointermove", (event) => {
    if (tracking) moved = Math.max(moved, Math.abs(event.clientX - originX));
    const pt = nearestHit(chart, event.clientX);
    if (pt) showPoint(chart, pt);
  });
  const endTrack = () => { tracking = false; };
  chart.addEventListener("pointerup", endTrack);
  chart.addEventListener("pointercancel", endTrack);
  chart.addEventListener("pointerleave", (event) => {
    tracking = false;
    if (event.pointerType === "touch") return;
    hideSpark(chart);
  });
  chart.addEventListener("click", (event) => {
    if (moved > 8) {
      event.preventDefault();
      event.stopPropagation();
      moved = 0;
    }
  }, true);
  chart.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const pts = [...chart.querySelectorAll(".spark-hit")];
    const index = pts.indexOf(document.activeElement);
    const from = index < 0 ? 0 : index;
    const next = event.key === "ArrowRight" ? Math.min(pts.length - 1, from + (index < 0 ? 0 : 1)) : Math.max(0, from - 1);
    if (!pts[next]) return;
    event.preventDefault();
    pts[next].focus();
    showPoint(chart, pts[next]);
  });
  chart.addEventListener("focusin", (event) => {
    const pt = event.target.closest(".spark-hit");
    if (pt) showPoint(chart, pt);
  });
  chart.addEventListener("focusout", () => hideSpark(chart));
}

function bindFloor(chart) {
  if (chart.dataset.bound === "1") return;
  chart.dataset.bound = "1";
  const tip = chart.querySelector(".chart-tip");
  if (!tip) return;
  const text = floorTip(chart.getAttribute("data-banked"), chart.getAttribute("data-floor"));
  if (!text) return;
  let timer = 0;
  const show = (event) => {
    clearTimeout(timer);
    tip.textContent = text;
    placeTip(chart, tip, event.clientX || chart.getBoundingClientRect().left + 24);
  };
  const hide = () => {
    tip.hidden = true;
  };
  chart.addEventListener("pointerenter", show);
  chart.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    show(event);
  });
  chart.addEventListener("pointerdown", show);
  chart.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "touch") {
      clearTimeout(timer);
      timer = setTimeout(hide, 2200);
      return;
    }
    hide();
  });
  chart.addEventListener("focusin", (event) => show(event));
  chart.addEventListener("focusout", hide);
}

function bindGauge(chart) {
  if (chart.dataset.bound === "1") return;
  chart.dataset.bound = "1";
  const tip = chart.querySelector(".chart-tip");
  if (!tip) return;
  const score = chart.getAttribute("data-score");
  const text = score === "" || score == null
    ? "No stress score in this book."
    : score + " / 1000 · lower better · goal under 400";
  const show = () => {
    tip.hidden = false;
    tip.textContent = text;
  };
  const hide = () => {
    tip.hidden = true;
  };
  chart.addEventListener("pointerenter", show);
  chart.addEventListener("pointerdown", show);
  chart.addEventListener("focusin", show);
  chart.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "touch") {
      setTimeout(hide, 1800);
      return;
    }
    hide();
  });
  chart.addEventListener("focusout", hide);
}

export function bindCharts(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll("[data-chart='stress']").forEach(bindSpark);
  root.querySelectorAll("[data-chart='floor']").forEach(bindFloor);
  root.querySelectorAll("[data-chart='gauge']").forEach(bindGauge);
}
