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
