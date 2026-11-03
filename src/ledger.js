/* Client-side book. AES-256-GCM, key from PBKDF2-SHA256.
   localStorage "midasKey" is { salt, k } where k is the raw AES key (base64).
   A new salt asks for the password again. The password is never stored. */

const KEY_NAME = "midasKey";
const WRONG = "That password didn't work. Try again 🙂";

const ORDER = {
  L8: [1, "Phase 1"],
  L6: [1, "Phase 1"],
  L10: [2, "Phase 2"],
  L4: [3, "Phase 3"],
  L5: [3, "Phase 3"],
  L9: [4, "0% autopay"],
  L7: [5, "Cleared"],
  L11: [5, "Cleared"],
  L13: [6, "Hold"]
};

export function b64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function derive(vault, pw) {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pw),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: b64(vault.salt), iterations: vault.iter },
    k,
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt"]
  );
}

export async function dec(vault, key) {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64(vault.iv) },
    key,
    b64(vault.ct)
  );
  return JSON.parse(new TextDecoder().decode(pt));
}

export async function openVault(vault, password) {
  const key = await derive(vault, password);
  const data = await dec(vault, key);
  return { key, data };
}

export async function rememberedRecord(vault, key) {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return { salt: vault.salt, k: btoa(String.fromCharCode(...raw)) };
}

function vaultOk(vault) {
  return !!(vault && typeof vault.salt === "string" && typeof vault.iv === "string" && typeof vault.ct === "string" && Number.isFinite(vault.iter) && vault.iter > 0);
}

function money(n) {
  return n == null ? "—" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}

function tags(marks) {
  return (marks || []).map((t) => {
    const cls = t === "STALE?" ? "st" : t === "NEED YOU" ? "nd" : t === "HOLD" ? "hold" : t === "VERIFIED" ? "ok" : "";
    return `<span class="tag ${cls}">${esc(t)}</span>`;
  }).join("");
}

function gauge(s) {
  const p = Math.min(1, Math.max(0, (s || 0) / 1000));
  const a = Math.PI * (1 - p);
  const x = 100 + 80 * Math.cos(a);
  const y = 100 - 80 * Math.sin(a);
  const c = s < 400 ? "#d5e2cf" : s < 550 ? "#e4c48a" : "#e3a598";
  const g = Math.PI * (1 - 0.4);
  const gx = 100 + 80 * Math.cos(g);
  const gy = 100 - 80 * Math.sin(g);
  return `<svg viewBox="0 0 200 115" width="100%" role="img" aria-label="Stress ${s ?? "?"} out of 1000, lower is better">
    <path d="M20 100A80 80 0 0 1 180 100" stroke="rgba(255,255,255,0.16)" stroke-width="14" fill="none" stroke-linecap="round"/>
    <path d="M20 100A80 80 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" stroke="${c}" stroke-width="14" fill="none" stroke-linecap="round"/>
    <circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="3.5" fill="#d5e2cf"/>
    <text x="100" y="92" text-anchor="middle" fill="#f6f3ee" font-size="34" font-weight="300" font-family="Outfit, sans-serif">${s ?? "?"}</text>
    <text x="100" y="110" text-anchor="middle" fill="#a7b0bf" font-size="9">/1000 · lower better · goal &lt;400</text>
  </svg>`;
}

function spark(h) {
  if (!h || h.length < 2) return "";
  const W = 320;
  const H = 70;
  const mn = Math.min(...h.map((x) => x.score), 400) - 10;
  const mx = Math.max(...h.map((x) => x.score)) + 10;
  const pt = (v, i) => [(i / (h.length - 1)) * W, H - ((v - mn) / (mx - mn)) * H];
  const d = h.map((x, i) => pt(x.score, i).map((n) => n.toFixed(1)).join(",")).join(" ");
  const gy = pt(400, 0)[1];
  const last = h.at(-1);
  return `<svg viewBox="0 0 ${W} ${H + 14}" width="100%" role="img" aria-label="Stress history">
    <line x1="0" x2="${W}" y1="${gy}" y2="${gy}" stroke="#d5e2cf" stroke-dasharray="4 4"/>
    <polyline points="${d}" fill="none" stroke="#e7c48a" stroke-width="2"/>
    ${h.map((x, i) => {
      const [px, py] = pt(x.score, i);
      return `<circle cx="${px}" cy="${py}" r="2.5" fill="#f0d7a8"><title>${escAttr(x.when)}: ${x.score}</title></circle>`;
    }).join("")}
    <text x="0" y="${H + 12}" fill="#a7b0bf" font-size="9">${esc(h[0].when)} ${h[0].score}</text>
    <text x="${W}" y="${H + 12}" fill="#a7b0bf" font-size="9" text-anchor="end">${esc(last.when)} ${last.score}</text>
  </svg>`;
}

function cardRow(c, extra = "") {
  const bad = c.marks.includes("NEED YOU");
  const stale = c.marks.includes("STALE?");
  const cls = bad ? "alert" : stale ? "warnb" : "";
  const figure = c.balance == null ? '<span class="pending">see note</span>' : money(c.balance);
  const from = c.source != "card" ? "· from " + esc(c.source) : "";
  const prev = c.prev != null ? " · card said " + money(c.prev) : "";
  const lines = c.balance == null || bad ? `<p class="note">${(c.lines || []).map(esc).join("<br>")}</p>` : "";
  return `<article class="card ${cls}">
    <div class="row">
      <h3>${esc(c.name)} <span class="id">${esc(c.id)}</span>${extra}</h3>
      <p class="figure">${figure}</p>
    </div>
    <div class="tags">${tags(c.marks)}</div>
    <p class="meta">${esc(c.asof || "")} ${from}${prev}</p>
    ${lines}
  </article>`;
}

function sheet(id, shift, side, kicker, title, body) {
  return `<section class="sheet${side ? " side-right" : ""}" id="${id}" data-shift="${shift}" data-nav>
    <div class="sheet-inner">
      <p class="kicker">${kicker}</p>
      <h2>${title}</h2>
      <div class="stack">${body}</div>
    </div>
  </section>`;
}

export function ledgerHtml(d) {
  const h = d.headline;
  const cards = d.cards;
  const by = (section) => cards.filter((c) => c.section === section);
  const pct = Math.min(100, (h.banked || 0) / (h.floor || 3000) * 100);
  const ordered = by("Cards (detail)").sort((a, b) => (ORDER[a.id]?.[0] ?? 9) - (ORDER[b.id]?.[0] ?? 9));
  const attention = cards.filter((c) => c.marks.includes("NEED YOU") || c.marks.includes("STALE?"));
  const floorNote = pct >= 100 ? "Above floor by " + money(h.banked - h.floor) : "Short " + money(h.floor - h.banked);
  const bar = pct >= 100 ? "#d5e2cf" : "#e4c48a";
  const when = esc(d.ledger_update || d.ledger_revised || "");

  const overview = `<section class="panel hero" id="overview" data-shift="0" data-nav>
    <div class="hero-mark">
      <span class="sq big" aria-hidden="true"></span>
      <h1 id="overview-title" tabindex="-1">MIDAS <span class="hub">ledger</span></h1>
    </div>
    <div class="hero-copy overview-copy">
      <p class="kicker">Finance wing</p>
      <p class="lede">Built ${esc(d.built_pt)} · ledger: ${when}</p>
      <article class="card metric">
        ${gauge(h.stress)}
        ${spark(d.history)}
        <p class="meta">${d.history.length} points · dashed line = goal 400</p>
      </article>
      <div class="pair">
        <article class="card metric">
          <div class="row">
            <div>
              <p class="kicker">Banked liquid</p>
              <p class="figure">${money(h.banked)}</p>
            </div>
            <div class="floor">
              <p class="kicker">Floor</p>
              <p class="floor-num">${money(h.floor)}</p>
            </div>
          </div>
          <div class="bar" role="img" aria-label="${escAttr(floorNote)}"><i style="width:${pct}%;background:${bar}"></i></div>
          <p class="meta">${floorNote}</p>
        </article>
        <article class="card metric">
          <p class="kicker">Revolving total</p>
          <p class="figure debt">${money(h.revolving)}</p>
        </article>
      </div>
    </div>
  </section>`;

  const attentionHtml = attention.length ? sheet(
    "attention",
    "0.45",
    false,
    "Needs you / stale",
    "Attention",
    attention.map((c) => `<article class="card ${c.marks.includes("NEED YOU") ? "alert" : "warnb"}">
      <h3>${esc(c.name)} ${tags(c.marks)}</h3>
      <p class="meta">${esc((c.lines && c.lines[0]) || c.status || "")}</p>
    </article>`).join("")
  ) : "";

  const cardHtml = sheet(
    "cards",
    "0.62",
    false,
    "Payoff order",
    "Cards",
    ordered.map((c) => cardRow(c, ORDER[c.id] ? ` <span class="phase">${esc(ORDER[c.id][1])}</span>` : "")).join("")
  );

  const cashHtml = sheet(
    "cash",
    "-0.95",
    true,
    "On hand",
    "Cash",
    by("Cash").map((c) => cardRow(c)).join("")
  );

  const assetHtml = sheet(
    "assets",
    "-0.4",
    true,
    "Beyond cash",
    "Assets",
    by("Assets beyond cash").map((c) => cardRow(c, c.id == "A14" ? ` <span class="tag hold">HOLD · never sell</span>` : "")).join("")
  );

  const loanHtml = sheet(
    "loans",
    "0.5",
    false,
    "Owed",
    "Loans",
    by("Loans").map((c) => cardRow(c)).join("")
  );

  const book = `<section class="sheet" id="book" data-shift="1.05" data-nav>
    <div class="sheet-inner">
      <p class="kicker">Written pages</p>
      <h2 id="book-title" tabindex="-1">Full ledger</h2>
      ${(d.sections || []).map((s) => `<details class="fold"><summary>${esc(s.title)}</summary><pre>${esc(s.body)}</pre></details>`).join("")}
      <details class="fold"><summary>Recent log</summary><pre>${(d.log || []).map(esc).join("\n\n")}</pre></details>
      <button type="button" class="quiet-btn" data-lock>Lock &amp; forget device</button>
    </div>
  </section>`;

  return overview + attentionHtml + cardHtml + cashHtml + assetHtml + loanHtml + book;
}

let navObserver = null;

export function bindNav() {
  if (typeof IntersectionObserver === "undefined") return;
  if (navObserver) navObserver.disconnect();
  const panels = [...document.querySelectorAll("[data-nav]")].filter((el) => !el.closest("[hidden]"));
  if (!panels.length) return;
  navObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    const id = "#" + visible.target.id;
    document.querySelectorAll(".topnav a[href^='#']").forEach((link) => {
      if (link.getAttribute("href") === id) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }, { threshold: [0.2, 0.45, 0.7] });
  panels.forEach((panel) => navObserver.observe(panel));
}

function paintHtml(html) {
  const lock = document.getElementById("lock");
  const app = document.getElementById("app");
  app.innerHTML = html;
  lock.hidden = true;
  app.hidden = false;
  document.body.classList.add("is-open");
  document.documentElement.classList.remove("restoring");
  const brand = document.getElementById("brand");
  if (brand) brand.setAttribute("href", "#overview");
  bindNav();
  window.scrollTo(0, 0);
  const head = document.getElementById("overview-title");
  if (head) head.focus({ preventScroll: true });
}

export function mountLedger(vault) {
  const form = document.getElementById("f");
  const err = document.getElementById("err");
  const button = form.querySelector("button");
  const input = document.getElementById("pw");
  const remember = document.getElementById("rem");

  document.body.addEventListener("click", (event) => {
    const hit = event.target.closest("[data-lock]");
    if (!hit) return;
    try { localStorage.removeItem(KEY_NAME); } catch (e) { /* private mode */ }
    location.reload();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!vaultOk(vault)) {
      err.textContent = "This copy of the book has no encrypted pages.";
      return;
    }
    button.disabled = true;
    err.textContent = "Unlocking…";
    let opened;
    try {
      opened = await openVault(vault, input.value);
    } catch (e) {
      err.textContent = WRONG;
      button.disabled = false;
      document.documentElement.classList.remove("restoring");
      return;
    }
    let html;
    try {
      html = ledgerHtml(opened.data);
    } catch (e) {
      err.textContent = "The book opened, but this page couldn't draw it.";
      button.disabled = false;
      document.documentElement.classList.remove("restoring");
      return;
    }
    if (remember.checked) {
      try {
        const record = await rememberedRecord(vault, opened.key);
        localStorage.setItem(KEY_NAME, JSON.stringify(record));
      } catch (e) { /* still open the book */ }
    }
    paintHtml(html);
  });

  if (!vaultOk(vault)) {
    err.textContent = "This copy of the book has no encrypted pages.";
    document.documentElement.classList.remove("restoring");
    return;
  }
  restore(vault, err);
}

async function restore(vault, err) {
  let record = null;
  try {
    record = JSON.parse(localStorage.getItem(KEY_NAME) || "null");
  } catch (e) {
    document.documentElement.classList.remove("restoring");
    return;
  }
  if (!record || record.salt !== vault.salt || typeof record.k !== "string") {
    document.documentElement.classList.remove("restoring");
    return;
  }
  let data;
  try {
    const key = await crypto.subtle.importKey("raw", b64(record.k), "AES-GCM", false, ["decrypt"]);
    data = await dec(vault, key);
  } catch (e) {
    try { localStorage.removeItem(KEY_NAME); } catch (err2) { /* ignore */ }
    document.documentElement.classList.remove("restoring");
    return;
  }
  try {
    paintHtml(ledgerHtml(data));
  } catch (e) {
    document.documentElement.classList.remove("restoring");
    err.textContent = "The book opened, but this page couldn't draw it.";
  }
}
