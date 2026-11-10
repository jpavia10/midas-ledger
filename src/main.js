import { demoBook } from "./demo.js";
import { bindNav, mountLedger, presentBook, showTab } from "./ledger.js";
import { startField } from "./particles.js";

export { presentBook };

const canvas = document.getElementById("field");

if (canvas) {
  try {
    startField(canvas);
    document.documentElement.classList.add("has-gl");
  } catch (error) {
    document.documentElement.classList.add("no-gl");
    console.warn("Particle field unavailable", error);
  }
}

bindNav();
paintDeskClock();
window.setInterval(paintDeskClock, 15000);

function paintDeskClock() {
  const now = new Date();
  const hour = now.getHours();
  const part = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : hour < 21 ? "Evening" : "Night";
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 21 ? "Good evening" : "Good night";
  const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const day = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(now);
  document.querySelectorAll("[data-atmo]").forEach((el) => { el.textContent = part; });
  document.querySelectorAll("[data-greet]").forEach((el) => { el.textContent = greet; });
  document.querySelectorAll("[data-clock]").forEach((el) => {
    el.textContent = clock;
    el.setAttribute("datetime", now.toISOString());
  });
  document.querySelectorAll("[data-day]").forEach((el) => { el.textContent = day; });
}

let vault = null;
const vaultEl = document.getElementById("vault");
if (vaultEl) {
  try {
    vault = JSON.parse(vaultEl.textContent);
  } catch (error) {
    vault = null;
  }
}

const preview = new URLSearchParams(location.search).has("hud")
  && (location.hostname === "localhost" || location.hostname === "127.0.0.1");
if (preview) {
  presentBook(demoBook());
  const tab = new URLSearchParams(location.search).get("tab");
  if (tab) showTab(tab);
} else {
  mountLedger(vault);
}

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  });
}

paintDeskClock();
