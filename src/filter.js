/* Narrow the open book. Pure matchers plus a small DOM apply.
   The encrypted pages are not rewritten. */

const SECTIONS = [
  { id: "all", label: "All" },
  { id: "Cash", label: "Cash" },
  { id: "Cards (detail)", label: "Cards" },
  { id: "Loans", label: "Loans" },
  { id: "Assets beyond cash", label: "Assets" }
];

const MARKS = [
  { id: "all", label: "Any mark" },
  { id: "NEED YOU", label: "Need you" },
  { id: "STALE?", label: "Stale" },
  { id: "HOLD", label: "Hold" }
];

let state = blankFilter();

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}

export function blankFilter() {
  return { section: "all", mark: "all", q: "", pinned: false };
}

export function getFilter() {
  return { ...state };
}

export function setFilter(next) {
  state = { ...blankFilter(), ...(next || {}) };
  return getFilter();
}

export function filterActive(current = state) {
  return current.section !== "all" || current.mark !== "all" || !!current.pinned || String(current.q || "").trim() !== "";
}

export function accountMatches(card, current, pinned) {
  if (!card) return false;
  const filter = current || blankFilter();
  if (filter.section !== "all" && card.section !== filter.section) return false;
  if (filter.mark !== "all" && !(card.marks || []).includes(filter.mark)) return false;
  if (filter.pinned && !pinned) return false;
  const q = String(filter.q || "").trim().toLowerCase();
  if (!q) return true;
  const name = String(card.name || "").toLowerCase();
  const id = String(card.id || "").toLowerCase();
  return name.includes(q) || id.includes(q);
}

function sectionLabel(id) {
  return (SECTIONS.find((item) => item.id === id) || {}).label || id;
}

function markLabel(id) {
  return (MARKS.find((item) => item.id === id) || {}).label || id;
}

export function filterSummary(current, counts) {
  const shown = counts && Number.isFinite(counts.shown) ? counts.shown : 0;
  const total = counts && Number.isFinite(counts.total) ? counts.total : 0;
  const bits = [`Showing ${shown} of ${total}`];
  if (current.section !== "all") bits.push(sectionLabel(current.section));
  if (current.mark !== "all") bits.push(markLabel(current.mark));
  if (current.pinned) bits.push("Pinned");
  const q = String(current.q || "").trim();
  if (q) bits.push("“" + q + "”");
  return bits.join(" · ");
}

export function filterBarHtml() {
  const sections = SECTIONS.map((item) => `<button type="button" class="chip" data-filter-section="${escAttr(item.id)}" aria-pressed="${item.id === "all" ? "true" : "false"}">${esc(item.label)}</button>`).join("");
  const marks = MARKS.map((item) => `<button type="button" class="chip" data-filter-mark="${escAttr(item.id)}" aria-pressed="${item.id === "all" ? "true" : "false"}">${esc(item.label)}</button>`).join("");
  return `<div class="filterbar" id="filters">
    <div class="filter-top">
      <label class="sr" for="q">Search by name or id</label>
      <input id="q" type="search" inputmode="search" enterkeyhint="search" placeholder="Search name or id" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
      <button type="button" class="chip reset" data-filter-reset hidden>Reset</button>
    </div>
    <div class="filter-chips" role="group" aria-label="Section">${sections}</div>
    <div class="filter-chips" role="group" aria-label="Mark">${marks}<button type="button" class="chip" data-filter-pin aria-pressed="false">Pinned</button></div>
    <p class="filter-status" data-filter-count aria-live="polite">Showing all accounts</p>
    <p class="filter-empty" data-filter-empty hidden>No accounts match these filters.</p>
  </div>`;
}

export function cardFromElement(el) {
  return {
    section: el.getAttribute("data-section") || "",
    id: el.getAttribute("data-id") || "",
    name: el.getAttribute("data-name") || "",
    marks: (el.getAttribute("data-marks") || "").split("|").filter(Boolean)
  };
}

export function applyAccountFilter(root, current, pinnedIds) {
  const pins = pinnedIds || new Set();
  const nodes = [...root.querySelectorAll("[data-account]")];
  nodes.forEach((el) => {
    const card = cardFromElement(el);
    el.hidden = !accountMatches(card, current, pins.has(card.id));
  });
  root.querySelectorAll(".sheet").forEach((sheet) => {
    const accounts = [...sheet.querySelectorAll("[data-account]")];
    if (!accounts.length) return;
    sheet.classList.toggle("is-filtered-out", accounts.every((el) => el.hidden));
  });
  const ids = new Set(nodes.map((el) => el.getAttribute("data-id")));
  const shown = new Set(nodes.filter((el) => !el.hidden).map((el) => el.getAttribute("data-id")));
  return { total: ids.size, shown: shown.size };
}

export function paintFilter(root, current, counts) {
  root.querySelectorAll("[data-filter-section]").forEach((btn) => {
    const on = btn.getAttribute("data-filter-section") === current.section;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  root.querySelectorAll("[data-filter-mark]").forEach((btn) => {
    const on = btn.getAttribute("data-filter-mark") === current.mark;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const pin = root.querySelector("[data-filter-pin]");
  if (pin) pin.setAttribute("aria-pressed", current.pinned ? "true" : "false");
  const search = root.querySelector("#q");
  if (search && search.value !== current.q) search.value = current.q;
  const status = root.querySelector("[data-filter-count]");
  if (status) status.textContent = filterSummary(current, counts);
  const reset = root.querySelector("[data-filter-reset]");
  if (reset) reset.hidden = !filterActive(current);
  const empty = root.querySelector("[data-filter-empty]");
  if (empty) empty.hidden = !counts || counts.shown !== 0;
}

export function bindFilters(root, onChange) {
  const bar = root.querySelector("#filters");
  if (!bar || bar.dataset.bound === "1") return;
  bar.dataset.bound = "1";
  const search = bar.querySelector("#q");
  if (search) {
    search.addEventListener("input", () => {
      state = { ...state, q: search.value };
      onChange(getFilter());
    });
  }
  bar.addEventListener("click", (event) => {
    const section = event.target.closest("[data-filter-section]");
    if (section) {
      state = { ...state, section: section.getAttribute("data-filter-section") };
      onChange(getFilter());
      return;
    }
    const mark = event.target.closest("[data-filter-mark]");
    if (mark) {
      state = { ...state, mark: mark.getAttribute("data-filter-mark") };
      onChange(getFilter());
      return;
    }
    if (event.target.closest("[data-filter-pin]")) {
      state = { ...state, pinned: !state.pinned };
      onChange(getFilter());
      return;
    }
    if (event.target.closest("[data-filter-reset]")) {
      state = blankFilter();
      if (search) search.value = "";
      onChange(getFilter());
    }
  });
}
