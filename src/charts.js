/* Charts drawn from decrypted numbers only. */

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
  if (n == null || n === "") return null;
  const value = typeof n === "number" ? n : Number(n);
  return Number.isFinite(value) ? value : null;
}

export function floorTip(banked, floor) {
  const have = finite(banked);
  const goal = finite(floor);
  if (have == null || goal == null) return "";
  const gap = have - goal;
  const rel = gap >= 0 ? "Above floor by " + money(gap) : "Short " + money(goal - have);
  return "Banked " + money(have) + " · Floor " + money(goal) + " · " + rel;
}

export function sparkHtml(history) {
  const h = history || [];
  if (h.length < 2) return "";
  const W = 320;
  const H = 70;
  const mn = Math.min(...h.map((x) => x.score), 400) - 10;
  const mx = Math.max(...h.map((x) => x.score)) + 10;
  const span = mx - mn || 1;
  const pt = (v, i) => [(i / (h.length - 1)) * W, H - ((v - mn) / span) * H];
  const d = h.map((x, i) => pt(x.score, i).map((n) => n.toFixed(1)).join(",")).join(" ");
  const gy = pt(400, 0)[1];
  const last = h.at(-1);
  return `<div class="chart" data-chart="stress">
    <p class="chart-tip" role="status" hidden></p>
    <div class="scrub" hidden></div>
    <svg viewBox="0 0 ${W} ${H + 14}" width="100%" role="img" aria-label="Stress history">
      <line x1="0" x2="${W}" y1="${gy}" y2="${gy}" stroke="#9fd4e8" stroke-dasharray="4 4"/>
      <polyline points="${d}" fill="none" stroke="#c9d7ea" stroke-width="2"/>
      ${h.map((x, i) => {
        const [px, py] = pt(x.score, i);
        const label = escAttr(x.when) + ": " + x.score;
        return `<circle class="spark-hit" cx="${px}" cy="${py}" r="12" fill="transparent" tabindex="0" role="button" data-open="history:${i}" data-score="${escAttr(x.score)}" data-when="${escAttr(x.when)}" aria-label="${label}"></circle><circle class="spark-dot" cx="${px}" cy="${py}" r="2.5" fill="#e8eef8" pointer-events="none"><title>${label}</title></circle>`;
      }).join("")}
      <text x="0" y="${H + 12}" fill="#c5d0de" font-size="9">${esc(h[0].when)} ${h[0].score}</text>
      <text x="${W}" y="${H + 12}" fill="#c5d0de" font-size="9" text-anchor="end">${esc(last.when)} ${last.score}</text>
    </svg>
  </div>`;
}

export function compositionHtml(cards) {
  const list = (cards || []).filter((c) => c && c.section === "Cards (detail)");
  if (!list.length) return "";
  const nums = list.map((c) => (typeof c.balance === "number" && Number.isFinite(c.balance) ? c.balance : 0));
  const max = Math.max(...nums, 0);
  const rows = list.map((c) => {
    const known = typeof c.balance === "number" && Number.isFinite(c.balance);
    const pct = !known || max <= 0 ? 0 : Math.max(2, (c.balance / max) * 100);
    const figure = known ? money(c.balance) : "see note";
    const width = known ? pct.toFixed(1) : "0";
    return `<button type="button" class="comp-row" data-open="card:${escAttr(c.id)}" data-balance="${known ? escAttr(c.balance) : ""}" aria-label="${escAttr(c.name)} ${escAttr(figure)}">
      <span class="comp-name">${esc(c.name)} <span class="id">${esc(c.id)}</span></span>
      <span class="comp-track" aria-hidden="true"><i style="width:${width}%"></i></span>
      <span class="comp-fig">${known ? esc(figure) : '<span class="pending">see note</span>'}</span>
    </button>`;
  }).join("");
  return `<div class="chart" data-chart="revolving"><p class="kicker">Card balances</p><div class="comp">${rows}</div></div>`;
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
